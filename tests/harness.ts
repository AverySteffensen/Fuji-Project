import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
export async function createHarness() {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql.exec(
      readFileSync(`drizzle/${file}`, "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
  class Statement {
    values: any[] = [];
    query: string;
    constructor(query: string) {
      this.query = query;
    }
    bind(...values: any[]) {
      this.values = values;
      return this;
    }
    async first() {
      return sql.prepare(this.query).get(...this.values) ?? null;
    }
    async all() {
      return {
        success: true,
        results: sql.prepare(this.query).all(...this.values),
      };
    }
    async run() {
      const result = sql.prepare(this.query).run(...this.values);
      return { success: true, meta: { changes: Number(result.changes) } };
    }
  }
  const objects = new Map<
    string,
    { body: ArrayBuffer; type: string; metadata: any }
  >();
  const DB = {
    prepare: (query: string) => new Statement(query),
    batch: async (statements: Statement[]) => {
      sql.exec("BEGIN");
      try {
        const results = [];
        for (const st of statements)
          results.push(
            /^\s*SELECT/i.test(st.query)
              ? {
                  success: true,
                  results: sql.prepare(st.query).all(...st.values),
                  meta: {},
                }
              : await st.run(),
          );
        sql.exec("COMMIT");
        return results;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const BUCKET = {
    async put(
      id: string,
      body: string | ArrayBuffer | Uint8Array,
      opts: any = {},
    ) {
      const bytes =
        typeof body === "string"
          ? new TextEncoder().encode(body)
          : body instanceof ArrayBuffer
            ? new Uint8Array(body)
            : body;
      objects.set(id, {
        body: bytes.slice().buffer as ArrayBuffer,
        type: opts.httpMetadata?.contentType || "application/octet-stream",
        metadata: opts.customMetadata,
      });
      return { key: id, size: bytes.byteLength };
    },
    async get(id: string) {
      const row = objects.get(id);
      return row
        ? {
            body: row.body.slice(0),
            arrayBuffer: async () => row.body.slice(0),
            text: async () => new TextDecoder().decode(row.body),
            customMetadata: row.metadata,
          }
        : null;
    },
    async head(id: string) {
      const row = objects.get(id);
      return row ? { key: id, size: row.body.byteLength } : null;
    },
    async delete(ids: string | string[]) {
      for (const id of Array.isArray(ids) ? ids : [ids]) objects.delete(id);
    },
    async list({ prefix = "", limit = 1000, cursor = "0" } = {}) {
      const keys = [...objects.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort();
      const offset = Number(cursor);
      return {
        objects: keys.slice(offset, offset + limit).map((key) => ({ key })),
        truncated: keys.length > offset + limit,
        cursor: String(offset + limit),
      };
    },
  };
  const env = {
    DB,
    BUCKET,
    FUJI_MFA_KEY: "a".repeat(64),
    FUJI_BACKUP_KEY: "c".repeat(64),
    FUJI_OPERATIONS_TOKEN: "b".repeat(64),
  };
  (globalThis as any).__testEnv = env;
  const routes = {
    session: await import("../app/api/security/session/route.ts"),
    mfa: await import("../app/api/security/mfa/route.ts"),
    workspace: await import("../app/api/workspace/route.ts"),
    register: await import("../app/api/register/route.ts"),
    export: await import("../app/api/register/export/route.ts"),
    create: await import("../app/api/requests/route.ts"),
    update: await import("../app/api/requests/[id]/route.ts"),
    people: await import("../app/api/members/route.ts"),
    attachment: await import("../app/api/attachments/[id]/route.ts"),
    operations: await import("../app/api/operations/route.ts"),
    tick: await import("../app/api/operations/run/route.ts"),
    health: await import("../app/api/health/route.ts"),
  };
  const auth = await import("../lib/purchasing/auth-security.ts");
  const cookies = new Map<string, string>(),
    recovery = new Map<string, string[]>();
  let userId = "owner-1";
  const req = (method = "GET", actor = "", data?: any, path = "/api") =>
    new Request(`https://test.local${path}`, {
      method,
      headers: {
        ...(actor ? { "x-demo-member": actor } : {}),
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(cookies.get(userId) ? { Cookie: cookies.get(userId)! } : {}),
        Origin: "https://test.local",
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  const read = async (response: Response) => ({
    status: response.status,
    data: (await response.json()) as any,
  });
  const identity = async (
    id = "owner-1",
    email = "owner@example.test",
    completeMfa = true,
  ) => {
    userId = id;
    (globalThis as any).__testAuthHeaders = new Headers({
      "oai-authenticated-user-id": id,
      "oai-authenticated-user-email": email,
    });
    const session = await routes.session.GET(req());
    const cookie = session.headers.get("set-cookie");
    if (cookie) cookies.set(id, cookie.split(";")[0]);
    const state = (await read(session)).data;
    if (completeMfa && state.state === "enroll") {
      const setup = await read(
        await routes.mfa.POST(req("POST", "", { action: "enroll" })),
      );
      const result = await read(
        await routes.mfa.POST(
          req("POST", "", {
            action: "confirm",
            code: await auth.totp(setup.data.secret),
          }),
        ),
      );
      if (result.status !== 200)
        throw new Error(
          `Test authenticator setup failed: ${JSON.stringify(result)}`,
        );
      recovery.set(id, result.data.recoveryCodes);
    } else if (completeMfa && state.state === "verify") {
      const code = recovery.get(id)?.shift();
      const result = await read(
        await routes.mfa.POST(req("POST", "", { action: "verify", code })),
      );
      if (result.status !== 200)
        throw new Error("Test authenticator verification failed");
    }
    return state;
  };
  return {
    sql,
    objects,
    env,
    routes,
    auth,
    req,
    read,
    identity,
    cookies,
    recovery,
  };
}
