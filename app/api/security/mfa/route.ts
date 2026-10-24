import {
  context,
  database,
  body,
  handleError,
  json,
} from "@/lib/purchasing/server";
import { BusinessError } from "@/lib/purchasing/domain";
import {
  base32,
  decryptSecret,
  digest,
  encryptSecret,
  randomToken,
  securityEvent,
  sessionExpired,
  sessionFor,
  validCounter,
} from "@/lib/purchasing/auth-security";
type Factor = {
  secret: string | null;
  pending_secret: string | null;
  pending_expires: number | null;
  enabled_at: number | null;
  last_counter: number;
  recovery_hashes: string;
  failures: number;
  blocked_until: number;
};
export async function POST(req: Request) {
  try {
    const input = await body(req);
    const { user } = await context(req, { skipSecurity: true });
    const db = database();
    const now = Date.now();
    const session = await sessionFor(req, user.userId, db);
    if (sessionExpired(session))
      throw new BusinessError(
        "Your session has ended. Sign in again.",
        401,
        "SESSION_REQUIRED",
      );
    const factor = await db
      .prepare("SELECT * FROM security_factors WHERE user_id=?")
      .bind(user.userId)
      .first<Factor>();
    if (factor && factor.blocked_until > now)
      throw new BusinessError(
        "Too many incorrect codes. Try again in five minutes.",
        429,
      );
    if (input.action === "enroll") {
      if (factor?.enabled_at)
        throw new BusinessError("An authenticator is already enrolled.");
      const secret = base32(crypto.getRandomValues(new Uint8Array(20)));
      const encrypted = await encryptSecret(secret, user.userId);
      await db
        .prepare(
          "INSERT INTO security_factors(user_id,pending_secret,pending_expires) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET pending_secret=excluded.pending_secret,pending_expires=excluded.pending_expires",
        )
        .bind(user.userId, encrypted, now + 10 * 60_000)
        .run();
      return json({
        secret,
        uri: `otpauth://totp/${encodeURIComponent(`Fuji Purchasing:${user.email}`)}?secret=${secret}&issuer=Fuji%20Purchasing&algorithm=SHA1&digits=6&period=30`,
      });
    }
    const code = String(input.code ?? "").trim();
    if (!factor || !["confirm", "verify"].includes(input.action))
      throw new BusinessError("Choose a valid authenticator action.");
    // Reserve one attempt atomically before cryptography. Concurrent guesses
    // cannot all pass an earlier, stale read of the attempt counter.
    const attempt = await db
      .prepare(
        "UPDATE security_factors SET failures=CASE WHEN blocked_until>0 AND blocked_until<=? THEN 1 ELSE failures+1 END,blocked_until=CASE WHEN (CASE WHEN blocked_until>0 AND blocked_until<=? THEN 0 ELSE failures END)+1>=5 THEN ? ELSE 0 END WHERE user_id=? AND blocked_until<=?",
      )
      .bind(now, now, now + 5 * 60_000, user.userId, now)
      .run();
    if (!attempt.meta.changes)
      throw new BusinessError(
        "Too many incorrect codes. Try again in five minutes.",
        429,
      );
    let accepted = false;
    let recoveryCodes: string[] | undefined;
    if (input.action === "confirm") {
      if (
        !factor?.pending_secret ||
        (factor.pending_expires ?? 0) <= now ||
        factor.enabled_at
      )
        throw new BusinessError("Start authenticator setup again.");
      const counter = await validCounter(
        await decryptSecret(factor.pending_secret, user.userId),
        code,
        now,
      );
      if (counter >= 0) {
        recoveryCodes = Array.from({ length: 10 }, () => randomToken(12));
        const hashes = await Promise.all(recoveryCodes.map((c) => digest(c)));
        const result = await db
          .prepare(
            "UPDATE security_factors SET secret=pending_secret,pending_secret=NULL,pending_expires=NULL,enabled_at=?,last_counter=?,recovery_hashes=?,failures=0,blocked_until=0 WHERE user_id=? AND pending_secret=? AND enabled_at IS NULL",
          )
          .bind(
            now,
            counter,
            JSON.stringify(hashes),
            user.userId,
            factor.pending_secret,
          )
          .run();
        accepted = !!result.meta.changes;
      }
    } else if (
      input.action === "verify" &&
      factor?.secret &&
      factor.enabled_at
    ) {
      const counter = await validCounter(
        await decryptSecret(factor.secret, user.userId),
        code,
        now,
      );
      if (counter >= 0 && counter > factor.last_counter) {
        const result = await db
          .prepare(
            "UPDATE security_factors SET last_counter=?,failures=0,blocked_until=0 WHERE user_id=? AND last_counter<?",
          )
          .bind(counter, user.userId, counter)
          .run();
        accepted = !!result.meta.changes;
      } else if (!/^\d{6}$/.test(code)) {
        const hashes = JSON.parse(factor.recovery_hashes) as string[];
        const hash = await digest(code.replace(/[\s-]/g, "").toLowerCase());
        if (hashes.includes(hash)) {
          const result = await db
            .prepare(
              "UPDATE security_factors SET recovery_hashes=?,failures=0,blocked_until=0 WHERE user_id=? AND recovery_hashes=?",
            )
            .bind(
              JSON.stringify(hashes.filter((h) => h !== hash)),
              user.userId,
              factor.recovery_hashes,
            )
            .run();
          accepted = !!result.meta.changes;
        }
      }
    } else throw new BusinessError("Choose a valid authenticator action.");
    if (!accepted) {
      await securityEvent(db, user.userId, "Authenticator verification failed");
      throw new BusinessError(
        "The code is invalid, expired or already used. Wait for a new code or use a recovery code.",
        400,
      );
    }
    await db
      .prepare(
        "UPDATE app_sessions SET mfa_at=?,last_seen_at=? WHERE id=? AND revoked=0",
      )
      .bind(now, now, session!.id)
      .run();
    await securityEvent(
      db,
      user.userId,
      input.action === "confirm"
        ? "Authenticator enrolled"
        : "Authenticator verified",
    );
    return json({
      verified: true,
      ...(recoveryCodes ? { recoveryCodes } : {}),
    });
  } catch (error) {
    return handleError(error);
  }
}
