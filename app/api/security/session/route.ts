import {
  context,
  database,
  body,
  handleError,
  json,
} from "@/lib/purchasing/server";
import {
  beginSession,
  cookieName,
  enforceSecurity,
  IDLE_MS,
  mfaRequired,
  sessionExpired,
  sessionFor,
} from "@/lib/purchasing/auth-security";
export async function GET(req: Request) {
  try {
    const { user, principal: actual } = await context(req, {
      skipSecurity: true,
    });
    const db = database();
    let session = await sessionFor(req, user.userId, db);
    let cookie: string | undefined;
    if (!session) {
      cookie = await beginSession(req, user.userId, db);
      const headers = new Headers(req.headers);
      headers.set("cookie", cookie.split(";")[0]);
      session = await sessionFor(
        new Request(req.url, { headers }),
        user.userId,
        db,
      );
    }
    const factor = await db
      .prepare("SELECT enabled_at FROM security_factors WHERE user_id=?")
      .bind(user.userId)
      .first<{ enabled_at: number | null }>();
    const required = mfaRequired(actual) || !!factor?.enabled_at;
    const state = sessionExpired(session)
      ? "expired"
      : required && !session!.mfa_at
        ? factor?.enabled_at
          ? "verify"
          : "enroll"
        : "ready";
    const response = json({
      state,
      email: user.email,
      required,
      enabled: !!factor?.enabled_at,
      serverTime: Date.now(),
      expiresAt: session!.last_seen_at + IDLE_MS,
    });
    if (cookie) response.headers.set("Set-Cookie", cookie);
    return response;
  } catch (error) {
    return handleError(error);
  }
}
export async function POST(req: Request) {
  try {
    const input = await body(req);
    const { user, principal } = await context(req, { skipSecurity: true });
    const db = database();
    if (input.action === "logout") {
      const session = await sessionFor(req, user.userId, db);
      if (session)
        await db
          .prepare("UPDATE app_sessions SET revoked=1 WHERE id=?")
          .bind(session.id)
          .run();
      const response = json({ signedOut: true });
      response.headers.set(
        "Set-Cookie",
        `${cookieName(req)}=; Path=/; HttpOnly; SameSite=Lax${new URL(req.url).protocol === "https:" ? "; Secure" : ""}; Max-Age=0`,
      );
      return response;
    }
    const session = await enforceSecurity(req, user.userId, principal, db);
    const now = Date.now();
    const result = await db
      .prepare(
        "UPDATE app_sessions SET last_seen_at=? WHERE id=? AND revoked=0 AND last_seen_at>?",
      )
      .bind(now, session.id, now - IDLE_MS)
      .run();
    if (!result.meta.changes)
      return json(
        { error: "Your session has ended.", code: "SESSION_REQUIRED" },
        401,
      );
    return json({ state: "ready", serverTime: now, expiresAt: now + IDLE_MS });
  } catch (error) {
    return handleError(error);
  }
}
