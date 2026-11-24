import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { BusinessError, canView, hasRole } from "./domain";
import { DEMO_MEMBERS, buildSeed } from "./seed";
import { canViewAs, canEditMember } from "./access";
import { DEPARTMENTS } from "./types";
import type { Member, Purchase, Audit } from "./types";
import { indexStatement, rebuildIndex } from "./register-server";
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
      ...requests.map((p) => indexStatement(db, p)),
      db
        .prepare("INSERT OR IGNORE INTO app_settings(key,value) VALUES (?,?)")
        .bind("seed-v1", "complete"),
    ];
    await db.batch(sql);
  }
  if (
    !(await db
      .prepare("SELECT value FROM app_settings WHERE key='register-index-v3'")
      .first())
  )
    await rebuildIndex(db);
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
  const signedIn = user;
  let me =
    members.find((m) => !m.demo && m.userId === signedIn.userId) ??
    members.find(
      (m) =>
        !m.demo &&
        !m.userId &&
        m.email.toLowerCase() === signedIn.email.toLowerCase(),
    );
  if (!me)
    throw new BusinessError(
      "Ask an authorized manager to add your ChatGPT sign-in email.",
      403,
    );
  if (me.active === false)
    throw new BusinessError(
      "Your membership is inactive. Ask an authorized manager to review your access.",
      403,
    );
  if (!me.userId) {
    // Bind only the identity; a sign-in must never undo a concurrent role change or removal.
    const bound = await database()
      .prepare(
        "UPDATE members SET data=json_set(data,'$.userId',?) WHERE id=? AND email=? AND COALESCE(json_extract(data,'$.active'),1)=1 AND (json_extract(data,'$.userId') IS NULL OR json_extract(data,'$.userId')=?) AND NOT EXISTS(SELECT 1 FROM members WHERE id<>? AND json_extract(data,'$.userId')=?) RETURNING data",
      )
      .bind(user.userId, me.id, me.email, user.userId, me.id, user.userId)
      .first<{ data: string }>();
    if (!bound)
      throw new BusinessError(
        "This membership is unavailable for this sign-in.",
        403,
      );
    Object.assign(me, JSON.parse(bound.data) as Member);
  }
  for (const m of members)
    if (m.roles.includes("supervisor")) m.departments = [...DEPARTMENTS];
  const actor = request.headers.get("x-demo-member");
  const viewer = me;
  const target = request.headers.get("x-view-as");
  if (target !== null) {
    if (!["GET", "HEAD"].includes(request.method) || actor)
      throw new BusinessError("View As is read-only.", 403);
    const person = members.find((m) => m.id === target);
    if (!person || !canViewAs(viewer, person))
      throw new BusinessError("This perspective is unavailable.", 403);
    me = person;
  }
  if (actor) {
    if (!owner)
      throw new BusinessError(
        "Only the workspace owner can use demo personas.",
        403,
      );
    me = members.find((m) => m.demo && m.id === actor);
    if (!me) throw new BusinessError("Unknown demo persona.");
  }
  return {
    me,
    owner: owner && target === null,
    viewer,
    readOnly: target !== null,
    members,
    user,
  };
}
export async function findPurchase(id: string) {
  const row = await database()
    .prepare("SELECT data FROM purchase_requests WHERE id=?")
    .bind(id)
    .first<{ data: string }>();
  return row ? (JSON.parse(row.data) as Purchase) : null;
}
export async function getPurchase(id: string) {
  const purchase = await findPurchase(id);
  if (!purchase) throw new BusinessError("Request not found.", 404);
  return purchase;
}
export async function loadWorkspace(request: Request) {
  const ctx = await context(request);
  return {
    me: ctx.me,
    owner: ctx.owner,
    actors: ctx.owner ? ctx.members.filter((m) => m.demo) : [],
    readOnly: ctx.readOnly,
    members: ctx.members
      .filter((m) => m.active !== false || canEditMember(ctx.me, m))
      .map(({ userId, ...m }) => ({
        ...m,
        email:
          hasRole(ctx.me, "admin") || canEditMember(ctx.me, m) ? m.email : "",
      })),
    requests: [] as Purchase[],
    audit: [] as Audit[],
    demoMode: ctx.me.demo,
  };
}
export async function writePurchase(
  p: Purchase,
  actor: Member,
  event: Audit,
  expectedVersion?: number,
  extra: D1PreparedStatement[] = [],
) {
  const db = database();
  // A signed-in user can lose access while a form or file upload is being processed.
  const actorQuery =
    "SELECT 1 FROM members WHERE id=? AND COALESCE(json_extract(data,'$.active'),1)=1 AND COALESCE(json_extract(data,'$.accessVersion'),0)=?";
  const actorArgs = [actor.id, actor.accessVersion ?? 0];
  const assertActorAccess = async () => {
    if (
      !(await db
        .prepare(actorQuery)
        .bind(...actorArgs)
        .first())
    )
      throw new BusinessError(
        "Your access changed. Refresh the workspace before continuing.",
        403,
      );
  };
  const previous =
    expectedVersion === undefined ? null : await getPurchase(p.id);
  event.changes = Object.keys(p)
    .filter(
      (field) =>
        !["lastMutationId", "version", "submissionFingerprint"].includes(field),
    )
    .filter(
      (field) =>
        JSON.stringify(previous?.[field as keyof Purchase] ?? null) !==
        JSON.stringify(p[field as keyof Purchase] ?? null),
    )
    .map((field) => ({
      field,
      before: previous?.[field as keyof Purchase] ?? null,
      after: p[field as keyof Purchase] ?? null,
    }));
  p.lastMutationId = event.id;
  if (expectedVersion === undefined) {
    const result = await db.batch([
      db
        .prepare(
          `INSERT INTO purchase_requests(id,data,version,updated_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM app_settings WHERE key='restore-lock' AND json_extract(value,'$.until')>?) AND EXISTS(${actorQuery}) ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          p.id,
          JSON.stringify(p),
          p.version,
          p.updatedAt,
          Date.now(),
          ...actorArgs,
        ),
      db
        .prepare(
          "INSERT INTO audit_events(id,request_id,data,at) SELECT ?,?,?,? FROM purchase_requests WHERE id=? AND json_extract(data,'$.lastMutationId')=?",
        )
        .bind(event.id, p.id, JSON.stringify(event), event.at, p.id, event.id),
      indexStatement(db, p, event.id),
    ]);
    if (!result[0].meta.changes) {
      await assertActorAccess();
      const existing = await findPurchase(p.id);
      if (existing) return existing;
      throw new BusinessError(
        "Records are being restored. Try again when restoration finishes.",
        503,
      );
    }
    return p;
  }
  p.version = expectedVersion + 1;
  const result = await db.batch([
    db
      .prepare(
        `UPDATE purchase_requests SET data=?,version=?,updated_at=? WHERE id=? AND version=? AND NOT EXISTS(SELECT 1 FROM app_settings WHERE key='restore-lock' AND json_extract(value,'$.until')>?) AND EXISTS(${actorQuery})`,
      )
      .bind(
        JSON.stringify(p),
        p.version,
        p.updatedAt,
        p.id,
        expectedVersion,
        Date.now(),
        ...actorArgs,
      ),
    db
      .prepare(
        "INSERT INTO audit_events(id,request_id,data,at) SELECT ?,?,?,? FROM purchase_requests WHERE id=? AND json_extract(data,'$.lastMutationId')=?",
      )
      .bind(event.id, p.id, JSON.stringify(event), event.at, p.id, event.id),
    ...extra,
    indexStatement(db, p, event.id),
  ]);
  if (!result[0].meta.changes) {
    await assertActorAccess();
    const lock = await db
      .prepare(
        "SELECT value FROM app_settings WHERE key='restore-lock' AND json_extract(value,'$.until')>?",
      )
      .bind(Date.now())
      .first();
    if (lock)
      throw new BusinessError(
        "Records are being restored. Try again when restoration finishes.",
        503,
      );
    throw new BusinessError(
      "This proposal changed while you were reviewing it. Refresh and try again.",
      409,
    );
  }
  return p;
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin)
    throw new BusinessError("Cross-origin writes are not allowed.", 403);
}
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export function handleError(e: unknown) {
  if (e instanceof BusinessError)
    return json(
      { error: e.message, ...(e.code ? { code: e.code } : {}) },
      e.status,
    );
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
