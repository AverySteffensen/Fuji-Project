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
  assert.equal((await member("New", ["employee"])).status, 201);
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

test("supervisors manage employees, and higher roles manage only eligible accounts", async () => {
  const h = await createHarness();
  const post = async (data: object, sample = "") =>
    h.read(await h.routes.people.POST(h.req("POST", sample, data)));
  const add = (name: string, roles: string[]) =>
    post({ action: "add", name, email: name + "@example.test", roles });
  const target = (member: {
    id: string;
    email: string;
    accessVersion?: number;
  }) => ({
    memberId: member.id,
    email: member.email,
    expectedVersion: member.accessVersion ?? 0,
  });
  await h.identity();
  const supervisor = (await add("supervisor1", ["supervisor"])).data;
  const controller = (await add("controller1", ["controller"])).data;
  const accounting = (await add("books", ["employee", "accounting"])).data;
  const vp = (await add("vp", ["vicepresident"])).data;
  await h.identity("supervisor-identity", supervisor.email);
  const staff = await add("firstemployee", ["employee"]);
  assert.equal(staff.status, 201);
  for (const roles of [
    ["accounting"],
    ["employee", "accounting"],
    ["supervisor"],
    ["controller"],
  ]) {
    assert.equal((await add("outside", roles)).status, 403);
  }
  assert.equal(
    (
      await post({
        action: "edit",
        ...target(staff.data),
        roles: ["accounting"],
      })
    ).status,
    403,
  );
  assert.equal(
    (await post({ action: "edit", ...target(accounting), roles: ["employee"] }))
      .status,
    403,
  );
  for (const member of [accounting, supervisor, controller]) {
    assert.equal(
      (await post({ action: "remove", ...target(member) })).status,
      403,
    );
  }
  const preview = h.req("POST", "", {
    action: "remove",
    ...target(staff.data),
  });
  preview.headers.set("x-view-as", staff.data.id);
  assert.equal((await h.routes.people.POST(preview)).status, 403);
  await h.identity("ordinary", staff.data.email);
  assert.equal((await add("extra", ["employee"])).status, 403);
  await h.identity("accounting-identity", accounting.email);
  assert.equal(
    (await post({ action: "remove", ...target(staff.data) })).status,
    403,
  );
  await h.identity("controller-identity", controller.email);
  assert.equal(
    (await add("newlead", ["supervisor", "accounting"])).status,
    201,
  );
  assert.equal((await add("newpeer", ["treasurer"])).status, 403);
  assert.equal(
    (await post({ action: "remove", ...target(accounting) })).data.active,
    false,
  );
  await h.identity("vicepresident", vp.email);
  assert.equal((await add("treasury", ["treasurer"])).status, 201);
  assert.equal(
    (await post({ action: "remove", ...target(controller) })).data.active,
    false,
  );
  await h.identity();
  assert.equal(
    (await post({ action: "remove", email: "owner@example.test" })).status,
    400,
  );
  assert.equal(
    (await post({ action: "remove", email: "alex@example.test" })).status,
    400,
  );
  assert.equal(
    (
      await post(
        {
          action: "add",
          name: "test",
          email: "test@example.test",
          roles: ["employee"],
        },
        "demo-supervisor",
      )
    ).status,
    403,
  );
});

test("removing and re-adding a member preserves their history and rejects stale actions", async () => {
  const h = await createHarness();
  const post = async (data: object) =>
    h.read(await h.routes.people.POST(h.req("POST", "", data)));
  const email = "returning.employee@example.test";
  const details = { name: "Returning Employee", email, roles: ["employee"] };
  await h.identity();
  const supervisor = await post({
    action: "add",
    name: "Supervisor",
    email: "lead@example.test",
    roles: ["supervisor"],
  });
  await h.identity("lead-account", supervisor.data.email);
  const staff = (await post({ action: "add", ...details })).data;
  assert.equal(await h.identity("employee-account", email), 200);
  const request = await h.read(
    await h.routes.create.POST(
      h.req("POST", "", {
        department: "Packaging (90)",
        purchaseType: "Facilities",
        priority: "Medium",
        neededBy: "2026-12-15",
        supplier: "Practice Supplier",
        explanation: "Supply run",
        items: [{ description: "Labels", quantity: 2, unitPrice: 8 }],
      }),
    ),
  );
  assert.equal(request.status, 201);
  await h.identity("lead-account", supervisor.data.email);
  const before = {
    memberId: staff.id,
    email,
    expectedVersion: staff.accessVersion,
  };
  const removed = await post({ action: "remove", ...before });
  assert.equal(removed.status, 201);
  assert.equal(removed.data.active, false);
  assert.equal(
    (await post({ action: "edit", ...before, roles: ["employee"] })).status,
    409,
  );
  assert.equal((await post({ action: "add", ...details })).status, 409);
  assert.equal(
    (await post({ action: "add", ...details, ...before })).status,
    409,
  );
  assert.equal(await h.identity("employee-account", email), 403);
  assert.equal((await h.routes.register.GET(h.req())).status, 403);
  await h.identity("lead-account", supervisor.data.email);
  const asRemoved = h.req();
  asRemoved.headers.set("x-view-as", staff.id);
  assert.equal((await h.routes.workspace.GET(asRemoved)).status, 403);
  const restored = await post({
    action: "add",
    ...details,
    memberId: staff.id,
    expectedVersion: removed.data.accessVersion,
  });
  assert.equal(restored.status, 201);
  assert.equal(restored.data.id, staff.id);
  assert.equal(restored.data.active, true);
  assert.equal((await post({ action: "remove", ...before })).status, 409);
  assert.equal(await h.identity("different-account", email), 403);
  assert.equal(await h.identity("employee-account", email), 200);
  const record = await h.read(
    await h.routes.update.GET(h.req(), {
      params: Promise.resolve({ id: request.data.id }),
    }),
  );
  assert.equal(record.data.purchase.requesterId, staff.id);
  assert.equal(record.data.audit[0].actorId, staff.id);
  const events = h.sql
    .prepare(
      "SELECT action FROM security_events WHERE user_id=? ORDER BY rowid",
    )
    .all(supervisor.data.id) as { action: string }[];
  assert.deepEqual(
    events.map(
      (e) => JSON.parse(e.action.slice("Membership saved ".length)).action,
    ),
    ["add", "remove", "re-add"],
  );
});
