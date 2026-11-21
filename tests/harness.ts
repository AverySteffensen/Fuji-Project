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
    run() {
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
              : st.run(),
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
            size: row.body.byteLength,
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
    FUJI_BACKUP_KEY: "c".repeat(64),
    FUJI_OPERATIONS_TOKEN: "b".repeat(64),
  };
  (globalThis as any).__testEnv = env;
  const routes = {
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
  const req = (
    method = "GET",
    actor = "",
    data?: any,
    path = "/api",
    submissionKey = crypto.randomUUID() as string,
  ) =>
    new Request(`https://test.local${path}`, {
      method,
      headers: {
        ...(actor ? { "x-demo-member": actor } : {}),
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(method === "POST" && submissionKey
          ? { "Idempotency-Key": submissionKey }
          : {}),
        Origin: "https://test.local",
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  const read = async (response: Response) => ({
    status: response.status,
    data: (await response.json()) as any,
  });
  const identity = async (id = "owner-1", email = "owner@example.test") => {
    (globalThis as any).__testAuthHeaders = new Headers({
      "oai-authenticated-user-id": id,
      "oai-authenticated-user-email": email,
    });
    return (await routes.workspace.GET(req())).status;
  };
  const signOut = () => {
    (globalThis as any).__testAuthHeaders = new Headers();
  };
  return {
    sql,
    objects,
    env,
    routes,
    req,
    read,
    identity,
    signOut,
  };
}
