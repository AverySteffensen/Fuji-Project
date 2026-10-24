import { env } from "cloudflare:workers";
import { BusinessError } from "./domain.ts";
import type { Member } from "./types.ts";

export const IDLE_MS = 15 * 60_000;
const encoder = new TextEncoder();
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const randomToken = (bytes = 32) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export const digest = async (s: string | Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof s === "string"
          ? encoder.encode(s)
          : (s as Uint8Array<ArrayBuffer>),
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
export function base32(bytes: Uint8Array): string {
  let buffer = 0,
    bits = 0,
    out = "";
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += alphabet[(buffer << (5 - bits)) & 31];
  return out;
}
function decodeBase32(s: string) {
  let buffer = 0,
    bits = 0;
  const out: number[] = [];
  for (const c of s.replace(/=+$/, "").toUpperCase()) {
    const n = alphabet.indexOf(c);
    if (n < 0) throw new Error("Invalid authenticator key");
    buffer = (buffer << 5) | n;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
export async function totp(
  secret: string,
  milliseconds = Date.now(),
  digits = 6,
) {
  const counter = Math.floor(milliseconds / 30_000);
  const data = new Uint8Array(8);
  new DataView(data.buffer).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase32(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  const offset = signature[signature.length - 1] & 15;
  const value =
    ((signature[offset] & 127) << 24) |
    (signature[offset + 1] << 16) |
    (signature[offset + 2] << 8) |
    signature[offset + 3];
  return (value % 10 ** digits).toString().padStart(digits, "0");
}
export async function validCounter(
  secret: string,
  code: string,
  now = Date.now(),
) {
  if (!/^\d{6}$/.test(code)) return -1;
  for (const offset of [0, -1, 1])
    if ((await totp(secret, now + offset * 30_000)) === code)
      return Math.floor(now / 30_000) + offset;
  return -1;
}
async function encryptionKey() {
  const raw = env.FUJI_MFA_KEY;
  if (!raw || !/^[0-9a-f]{64}$/i.test(raw))
    throw new BusinessError(
      "Authenticator protection needs to be configured by the workspace administrator.",
      503,
      "SECURITY_CONFIGURATION",
    );
  const bytes = new Uint8Array(raw.match(/../g)!.map((x) => parseInt(x, 16)));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encryptSecret(value: string, userId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(userId) },
      await encryptionKey(),
      encoder.encode(value),
    ),
  );
  return JSON.stringify({ v: 1, iv: Array.from(iv), data: Array.from(data) });
}
export async function decryptSecret(value: string, userId: string) {
  const data = JSON.parse(value);
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(data.iv),
        additionalData: encoder.encode(userId),
      },
      await encryptionKey(),
      new Uint8Array(data.data),
    ),
  );
}
export const mfaRequired = (m: Member) => m.roles.some((r) => r !== "employee");
export const cookieName = (request: Request) =>
  new URL(request.url).protocol === "https:"
    ? "__Host-fuji_session"
    : "fuji_session";
export function cookieValue(request: Request) {
  const name = cookieName(request);
  return (
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="))
      ?.slice(name.length + 1) ?? ""
  );
}
export type AppSession = {
  id: string;
  user_id: string;
  created_at: number;
  last_seen_at: number;
  mfa_at: number | null;
  revoked: number;
};
export async function sessionFor(
  request: Request,
  userId: string,
  db: D1Database,
) {
  const token = cookieValue(request);
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return db
    .prepare("SELECT * FROM app_sessions WHERE id=? AND user_id=?")
    .bind(await digest(token), userId)
    .first<AppSession>();
}
export const sessionExpired = (s: AppSession | null, now = Date.now()) =>
  !s || !!s.revoked || now - s.last_seen_at >= IDLE_MS;
export async function enforceSecurity(
  request: Request,
  userId: string,
  member: Member,
  db: D1Database,
) {
  const session = await sessionFor(request, userId, db);
  if (sessionExpired(session)) {
    if (session)
      await db
        .prepare("UPDATE app_sessions SET revoked=1 WHERE id=?")
        .bind(session.id)
        .run();
    throw new BusinessError(
      "Your session has ended. Sign in again to continue.",
      401,
      "SESSION_REQUIRED",
    );
  }
  const factor = await db
    .prepare("SELECT enabled_at FROM security_factors WHERE user_id=?")
    .bind(userId)
    .first<{ enabled_at: number | null }>();
  if ((mfaRequired(member) || factor?.enabled_at) && !session!.mfa_at)
    throw new BusinessError(
      "Verify your authenticator code before opening purchasing records.",
      403,
      "MFA_REQUIRED",
    );
  return session!;
}
export async function securityEvent(
  db: D1Database,
  userId: string,
  action: string,
) {
  await db
    .prepare(
      "INSERT INTO security_events(id,user_id,action,at) VALUES (?,?,?,?)",
    )
    .bind(crypto.randomUUID(), userId, action, new Date().toISOString())
    .run();
}
export async function beginSession(
  request: Request,
  userId: string,
  db: D1Database,
) {
  const token = randomToken();
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO app_sessions(id,user_id,created_at,last_seen_at,mfa_at,revoked) VALUES (?,?,?,?,NULL,0)",
    )
    .bind(await digest(token), userId, now, now)
    .run();
  const secure = new URL(request.url).protocol === "https:";
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}; Max-Age=86400`;
}
