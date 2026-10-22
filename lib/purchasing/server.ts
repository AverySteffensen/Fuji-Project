import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { BusinessError, canView, hasRole } from "./domain";
import { DEMO_MEMBERS, buildSeed } from "./seed";
import type { Member, Purchase, Audit } from "./types";
export const database = () => {
  if (!env.DB)
    throw new BusinessError("The purchasing database is not connected.", 503);
  return env.DB;
};
export async function initialize(user: {
  userId: string;
  email: string;
  displayName?: string | null;
}) {
  const db = database();
  await db
    .prepare("INSERT OR IGNORE INTO app_settings (key,value) VALUES (?,?)")
    .bind("owner", user.userId)
    .run();
  const owner = await db
    .prepare("SELECT value FROM app_settings WHERE key=?")
    .bind("owner")
    .first<{ value: string }>();
  if (owner?.value === user.userId) {
    const m: Member = {
      id: user.userId,
      name: user.displayName || user.email,
      email: user.email.toLowerCase(),
      roles: ["admin", "accounting"],
      departments: [],
      demo: false,
      userId: user.userId,
    };
    await db
      .prepare("INSERT OR IGNORE INTO members(id,email,data) VALUES (?,?,?)")
      .bind(m.id, m.email, JSON.stringify(m))
      .run();
  }
  const seeded = await db
    .prepare("SELECT value FROM app_settings WHERE key=?")
    .bind("seed-v1")
    .first();
  if (!seeded) {
    const { requests, audit } = buildSeed();
    const sql = [
      ...DEMO_MEMBERS.map((m) =>
        db
          .prepare(
            "INSERT OR IGNORE INTO members(id,email,data) VALUES (?,?,?)",
          )
          .bind(m.id, m.email, JSON.stringify(m)),
      ),
      ...requests.map((p) =>
        db
          .prepare(
            "INSERT OR IGNORE INTO purchase_requests(id,data,version,updated_at) VALUES (?,?,?,?)",
          )
          .bind(p.id, JSON.stringify(p), p.version, p.updatedAt),
      ),
      ...audit.map((a) =>
        db
          .prepare(
            "INSERT OR IGNORE INTO audit_events(id,request_id,data,at) VALUES (?,?,?,?)",
          )
          .bind(a.id, a.requestId, JSON.stringify(a), a.at),
      ),
      db
        .prepare("INSERT OR IGNORE INTO app_settings(key,value) VALUES (?,?)")
        .bind("seed-v1", "complete"),
    ];
    await db.batch(sql);
  }
  return owner?.value === user.userId;
}
export async function context(request: Request) {
  let user = await getChatGPTUser();
  if (!user && import.meta.env?.DEV)
    user = {
      userId: "preview-owner",
      email: "preview@example.test",
      displayName: "Preview owner",
      fullName: null,
    };
  if (!user)
    throw new BusinessError(
      "Sign in with ChatGPT to open this workspace.",
      401,
    );
  const owner = await initialize(user);
  const rows = await database()
    .prepare("SELECT data FROM members")
    .all<{ data: string }>();
  const members = rows.results.map((r) => JSON.parse(r.data) as Member);
  let me = members.find(
    (m) =>
      m.userId === user!.userId ||
      (!m.demo &&
        !m.userId &&
        m.email.toLowerCase() === user!.email.toLowerCase()),
  );
  if (!me)
    throw new BusinessError(
      "Ask the workspace owner to add your email and role.",
      403,
    );
  if (!me.userId) {
    me = { ...me, userId: user.userId };
    const result = await database()
      .prepare(
        "UPDATE members SET data=? WHERE id=? AND (json_extract(data,'$.userId') IS NULL OR json_extract(data,'$.userId')=?)",
      )
      .bind(JSON.stringify(me), me.id, user.userId)
      .run();
    if (!result.meta.changes)
      throw new BusinessError(
        "This membership is bound to a different sign-in.",
        403,
      );
  }
  const actor = request.headers.get("x-demo-member");
  if (actor) {
    if (!owner)
      throw new BusinessError(
        "Only the workspace owner can use demo personas.",
        403,
      );
    me = members.find((m) => m.demo && m.id === actor);
    if (!me) throw new BusinessError("Unknown demo persona.");
  }
  return { me, owner, members, user };
}
export async function getPurchase(id: string) {
  const row = await database()
    .prepare("SELECT data FROM purchase_requests WHERE id=?")
    .bind(id)
    .first<{ data: string }>();
  if (!row) throw new BusinessError("Request not found.", 404);
  return JSON.parse(row.data) as Purchase;
}
export async function loadWorkspace(request: Request) {
  const ctx = await context(request);
  const rows = await database()
    .prepare("SELECT data FROM purchase_requests ORDER BY updated_at DESC")
    .all<{ data: string }>();
  const requests = rows.results
    .map((r) => JSON.parse(r.data) as Purchase)
    .filter((p) => canView(ctx.me, p));
  const ids = new Set(requests.map((p) => p.id));
  const events = await database()
    .prepare("SELECT data FROM audit_events ORDER BY at DESC LIMIT 2000")
    .all<{ data: string }>();
  return {
    me: ctx.me,
    owner: ctx.owner,
    actors: ctx.owner ? ctx.members.filter((m) => m.demo) : [],
    members: hasRole(ctx.me, "admin")
      ? ctx.members
      : ctx.members.map((m) => ({ ...m, email: "" })),
    requests,
    audit: events.results
      .map((r) => JSON.parse(r.data) as Audit)
      .filter((a) => ids.has(a.requestId)),
    demoMode: ctx.me.demo,
  };
}
export async function writePurchase(
  p: Purchase,
  event: Audit,
  expectedVersion?: number,
  extra: D1PreparedStatement[] = [],
) {
  const db = database();
  p.lastMutationId = event.id;
  if (expectedVersion === undefined) {
    await db.batch([
      db
        .prepare(
          "INSERT INTO purchase_requests(id,data,version,updated_at) VALUES (?,?,?,?)",
        )
        .bind(p.id, JSON.stringify(p), p.version, p.updatedAt),
      db
        .prepare(
          "INSERT INTO audit_events(id,request_id,data,at) VALUES (?,?,?,?)",
        )
        .bind(event.id, p.id, JSON.stringify(event), event.at),
    ]);
    return;
  }
  p.version = expectedVersion + 1;
  const result = await db.batch([
    db
      .prepare(
        "UPDATE purchase_requests SET data=?,version=?,updated_at=? WHERE id=? AND version=?",
      )
      .bind(JSON.stringify(p), p.version, p.updatedAt, p.id, expectedVersion),
    db
      .prepare(
        "INSERT INTO audit_events(id,request_id,data,at) SELECT ?,?,?,? FROM purchase_requests WHERE id=? AND json_extract(data,'$.lastMutationId')=?",
      )
      .bind(event.id, p.id, JSON.stringify(event), event.at, p.id, event.id),
    ...extra,
  ]);
  if (!result[0].meta.changes)
    throw new BusinessError(
      "This proposal changed while you were reviewing it. Refresh and try again.",
      409,
    );
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin)
    throw new BusinessError("Cross-origin writes are not allowed.", 403);
}
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export function handleError(e: unknown) {
  if (e instanceof BusinessError) return json({ error: e.message }, e.status);
  console.error(e);
  return json(
    { error: "The request could not be completed. Please try again." },
    500,
  );
}
export async function body(request: Request) {
  assertSameOrigin(request);
  const limit = 200000;
  if (Number(request.headers.get("content-length")) > limit)
    throw new BusinessError("Request is too large.", 413);
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let raw = "",
    length = 0;
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new BusinessError("Request is too large.", 413);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  }
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new BusinessError("The submitted data is not valid JSON.");
  }
}
