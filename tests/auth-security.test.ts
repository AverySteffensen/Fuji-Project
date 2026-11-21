import { test } from "node:test";
import assert from "node:assert/strict";
import { createHarness } from "./harness.ts";

test("a valid hosted identity can use the workspace without an app session or MFA", async () => {
  const h = await createHarness();
  assert.equal(await h.identity(), 200);
  assert.equal((await h.routes.register.GET(h.req())).status, 200);
  assert.equal((await h.routes.operations.GET(h.req())).status, 200);
  assert.equal(h.sql.prepare("SELECT COUNT(*) AS n FROM app_sessions").get()?.n, 0);
  assert.equal(h.sql.prepare("SELECT COUNT(*) AS n FROM security_factors").get()?.n, 0);

  const old = Date.now() - 8 * 60 * 60_000;
  h.sql.prepare("INSERT INTO app_sessions(id,user_id,created_at,last_seen_at,revoked) VALUES (?,?,?,?,1)")
    .run("old-app-session", "owner-1", old, old);
  const request = h.req();
  request.headers.set("Cookie", "__Host-fuji_session=obsolete");
  assert.equal((await h.routes.register.GET(request)).status, 200);
  h.signOut();
  assert.equal((await h.routes.register.GET(request)).status, 401);
  assert.equal((await h.routes.operations.GET(request)).status, 401);
  h.sql.close();
});

test("active membership and operation permissions still constrain hosted users", async () => {
  const h = await createHarness();
  assert.equal(await h.identity(), 200);
  assert.equal(await h.identity("member-1", "member@example.test"), 403);
  const member = { id: "member-1", userId: "member-1", email: "member@example.test", name: "Member", roles: ["employee"], departments: [], active: true, demo: false };
  h.sql.prepare("INSERT INTO members(id,email,data) VALUES (?,?,?)")
    .run(member.id, member.email, JSON.stringify(member));
  assert.equal(await h.identity(member.id, member.email), 200);
  assert.equal((await h.routes.operations.GET(h.req())).status, 403);
  h.sql.prepare("UPDATE members SET data=json_set(data,'$.active',json('false')) WHERE id=?").run(member.id);
  assert.equal((await h.routes.workspace.GET(h.req())).status, 403);
  h.sql.close();
});
