import test from "node:test";
import assert from "node:assert/strict";
import { createHarness } from "./harness.ts";
import { DEPARTMENTS } from "../lib/purchasing/types.ts";

test("multi-role accounts, global supervision, delegated role edits and read-only perspectives", async () => {
  const { routes, identity, req, sql, read } = await createHarness();
  await identity();
  const member = async (name: string, roles: string[]) =>
    read(
      await routes.people.POST(
        req("POST", "", { name, email: name + "@example.test", roles }),
      ),
    );
  const lead = await member("Lead", ["controller", "accounting", "supervisor"]);
  const staff = await member("Staff", ["employee"]);
  assert.equal(lead.status, 201);
  assert.equal(lead.data.roles.length, 3);
  assert.deepEqual(lead.data.departments, [...DEPARTMENTS]);
  await member("Peer", ["plantmanager"]);
  const legacy = await member("Legacy", ["supervisor"]);
  sql
    .prepare(
      "UPDATE members SET data=json_set(data,'$.departments',json('[\"Lab\"]')) WHERE id=?",
    )
    .run(legacy.data.id);
  await identity("legacy", "Legacy@example.test");
  assert.deepEqual(
    (await read(await routes.workspace.GET(req()))).data.me.departments,
    [...DEPARTMENTS],
  );
  assert.equal((await read(await routes.register.GET(req()))).data.total, 64);
  await identity("lead", "Lead@example.test");
  assert.equal(
    (await member("Staff", ["supervisor", "accounting"])).status,
    201,
  );
  assert.equal((await member("New", ["employee"])).status, 403);
  assert.equal((await member("Staff", ["controller"])).status, 403);
  assert.equal((await member("Peer", ["employee"])).status, 403);
  assert.equal((await member("Lead", ["employee"])).status, 403);
  assert.equal((await member("Staff", [])).status, 400);
  assert.ok(
    sql
      .prepare(
        "SELECT 1 FROM security_events WHERE user_id=? AND action LIKE 'Membership saved %'",
      )
      .get(lead.data.id),
  );
  const view = (target: string, method = "GET", actor = "") => {
    const r = req(method, actor);
    r.headers.set("x-view-as", target);
    return r;
  };
  const w = await read(await routes.workspace.GET(view(staff.data.id)));
  assert.equal(w.data.me.id, staff.data.id);
  assert.equal(w.data.readOnly, true);
  assert.equal(w.data.owner, false);
  assert.equal((await routes.workspace.GET(view(lead.data.id))).status, 403);
  assert.equal((await routes.workspace.GET(view("owner-1"))).status, 403);
  const readEmployee = await read(
    await routes.register.GET(view("demo-employee")),
  );
  assert.ok(readEmployee.data.total > 0 && readEmployee.data.total < 64);
  assert.ok(
    readEmployee.data.requests.every(
      (p: any) => p.requesterId === "demo-employee" && p.sample,
    ),
  );
  const unrelated = sql
    .prepare(
      "SELECT id FROM request_index WHERE requester_id<>'demo-employee' LIMIT 1",
    )
    .get() as { id: string };
  const params = { params: Promise.resolve(unrelated) };
  assert.equal(
    (await routes.update.GET(view("demo-employee"), params)).status,
    403,
  );
  assert.equal(
    (await routes.operations.GET(view("demo-employee"))).status,
    403,
  );
  assert.equal(
    (await routes.create.POST(view(staff.data.id, "POST"))).status,
    403,
  );
  assert.equal(
    (await routes.update.PATCH(view(staff.data.id, "PATCH"), params)).status,
    403,
  );
  assert.equal(
    (await routes.attachment.POST(view(staff.data.id, "POST"), params)).status,
    403,
  );
  assert.equal(
    (await routes.people.POST(view(staff.data.id, "POST"))).status,
    403,
  );
  assert.equal(
    (await routes.operations.POST(view(staff.data.id, "POST"))).status,
    403,
  );
  await identity();
  assert.equal(
    (await routes.workspace.GET(view(staff.data.id, "GET", "demo-vp"))).status,
    403,
  );
  assert.equal(
    (await read(await routes.workspace.GET(req()))).data.readOnly,
    false,
  );
});
