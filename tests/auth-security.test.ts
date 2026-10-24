import { test } from "node:test";
import assert from "node:assert/strict";
import { createHarness } from "./harness.ts";
const h = await createHarness();
const { routes, req, read, sql, auth } = h;
let secret = "",
  recovery: string[] = [];
test("MFA blocks privileged records until enrollment is confirmed and protects the stored key", async () => {
  const initial = await h.identity("owner-1", "owner@example.test", false);
  assert.equal(initial.state, "enroll");
  assert.equal((await routes.workspace.GET(req())).status, 403);
  const started = await read(
    await routes.mfa.POST(req("POST", "", { action: "enroll" })),
  );
  assert.equal(started.status, 200);
  secret = started.data.secret;
  assert.match(secret, /^[A-Z2-7]{32}$/);
  const stored = sql
    .prepare(
      "SELECT pending_secret FROM security_factors WHERE user_id='owner-1'",
    )
    .get() as any;
  assert.ok(!stored.pending_secret.includes(secret));
  const verified = await read(
    await routes.mfa.POST(
      req("POST", "", { action: "confirm", code: await auth.totp(secret) }),
    ),
  );
  assert.equal(verified.status, 200);
  recovery = verified.data.recoveryCodes;
  assert.equal(recovery.length, 10);
  assert.equal((await routes.workspace.GET(req())).status, 200);
  const factor = sql
    .prepare("SELECT * FROM security_factors WHERE user_id='owner-1'")
    .get() as any;
  for (const code of recovery)
    assert.ok(!factor.recovery_hashes.includes(code));
  await assert.rejects(() => auth.decryptSecret(factor.secret, "another-user"));
});
test("TOTP conforms to RFC 6238 SHA-1 vectors", async () => {
  const key = auth.base32(new TextEncoder().encode("12345678901234567890"));
  for (const [time, expected] of [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ] as const)
    assert.equal(await auth.totp(key, time * 1000, 8), expected);
});
test("new sessions require MFA, codes cannot be replayed, recovery codes are single-use, and attempts are limited", async () => {
  h.cookies.delete("owner-1");
  assert.equal(
    (await h.identity("owner-1", "owner@example.test", false)).state,
    "verify",
  );
  assert.equal((await routes.register.GET(req())).status, 403);
  const replay = await routes.mfa.POST(
    req("POST", "", { action: "verify", code: await auth.totp(secret) }),
  );
  assert.equal(replay.status, 400);
  const recoveryCode = recovery.shift()!;
  assert.equal(
    (
      await routes.mfa.POST(
        req("POST", "", { action: "verify", code: recoveryCode }),
      )
    ).status,
    200,
  );
  h.cookies.delete("owner-1");
  await h.identity("owner-1", "owner@example.test", false);
  assert.equal(
    (
      await routes.mfa.POST(
        req("POST", "", { action: "verify", code: recoveryCode }),
      )
    ).status,
    400,
  );
  for (let i = 0; i < 4; i++)
    assert.equal(
      (
        await routes.mfa.POST(
          req("POST", "", { action: "verify", code: "invalid" }),
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await routes.mfa.POST(
        req("POST", "", { action: "verify", code: recovery.shift() }),
      )
    ).status,
    429,
  );
  sql
    .prepare(
      "UPDATE security_factors SET blocked_until=0,failures=0 WHERE user_id='owner-1'",
    )
    .run();
  assert.equal(
    (
      await routes.mfa.POST(
        req("POST", "", { action: "verify", code: recovery.shift() }),
      )
    ).status,
    200,
  );
});
test("idle expiration is enforced on the server; status checks do not keep a session alive", async () => {
  const cookie = h.cookies.get("owner-1")!.split("=")[1];
  const id = await auth.digest(cookie);
  const old = Date.now() - 14 * 60_000;
  sql.prepare("UPDATE app_sessions SET last_seen_at=? WHERE id=?").run(old, id);
  const status = await read(await routes.session.GET(req()));
  assert.equal(status.data.state, "ready");
  assert.equal(
    (
      sql
        .prepare("SELECT last_seen_at FROM app_sessions WHERE id=?")
        .get(id) as any
    ).last_seen_at,
    old,
  );
  sql
    .prepare("UPDATE app_sessions SET last_seen_at=? WHERE id=?")
    .run(Date.now() - auth.IDLE_MS - 1000, id);
  assert.equal((await routes.workspace.GET(req())).status, 401);
  assert.equal(
    (await routes.session.POST(req("POST", "", { action: "touch" }))).status,
    401,
  );
  assert.equal(
    (await read(await routes.session.GET(req()))).data.state,
    "expired",
  );
});
test("employees still need valid sessions; elevated roles need MFA; cookies and credentials cannot cross identities", async () => {
  h.cookies.delete("owner-1");
  await h.identity("owner-1", "owner@example.test", false);
  await routes.mfa.POST(
    req("POST", "", { action: "verify", code: recovery.shift() }),
  );
  assert.equal(
    (
      await routes.people.POST(
        req("POST", "", {
          name: "Employee",
          email: "employee@example.test",
          role: "employee",
        }),
      )
    ).status,
    201,
  );
  assert.equal(
    (await h.identity("employee-1", "employee@example.test", false)).state,
    "ready",
  );
  assert.equal((await routes.workspace.GET(req())).status, 200);
  assert.equal((await routes.operations.GET(req())).status, 403);
  const fresh = await routes.session.GET(
    new Request("https://test.local/api/security/session"),
  );
  const cookie = fresh.headers.get("set-cookie")!;
  assert.match(cookie, /__Host-fuji_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Path=\//);
  const forged = new Request("https://test.local/api/workspace", {
    headers: { Cookie: h.cookies.get("owner-1")! },
  });
  assert.equal((await routes.workspace.GET(forged)).status, 401);
  const cross = new Request("https://test.local/api/security/mfa", {
    method: "POST",
    headers: {
      Origin: "https://evil.test",
      Cookie: h.cookies.get("employee-1")!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "enroll" }),
  });
  assert.equal((await routes.mfa.POST(cross)).status, 403);
  const events = sql.prepare("SELECT * FROM security_events").all();
  const text = JSON.stringify(events);
  assert.ok(!text.includes(secret));
  for (const c of recovery) assert.ok(!text.includes(c));
  assert.throws(
    () => sql.prepare("DELETE FROM security_events").run(),
    /append-only/,
  );
});
test("concurrent incorrect MFA guesses cannot bypass the five-attempt limit", async () => {
  h.cookies.delete("owner-1");
  await h.identity("owner-1", "owner@example.test", false);
  sql
    .prepare(
      "UPDATE security_factors SET failures=0,blocked_until=0 WHERE user_id='owner-1'",
    )
    .run();
  const attempts = await Promise.all(
    Array.from({ length: 12 }, () =>
      routes.mfa.POST(req("POST", "", { action: "verify", code: "invalid" })),
    ),
  );
  assert.equal(attempts.filter((r) => r.status === 400).length, 5);
  assert.equal(attempts.filter((r) => r.status === 429).length, 7);
});
