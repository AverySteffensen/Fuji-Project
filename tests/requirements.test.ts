import { test } from "node:test";
import assert from "node:assert/strict";
import { createHarness } from "./harness.ts";
import { buildSeed, DEMO_MEMBERS } from "../lib/purchasing/seed.ts";
import {
  canApprove,
  canView,
  invoiceVariance,
  saveOrder,
  withdraw,
  businessDate,
  exportRows,
} from "../lib/purchasing/domain.ts";
import {
  DEFAULT_FILTERS,
  SORT_FIELDS,
  periodDates,
  periodSelection,
  selectRequests,
  isOverdue,
} from "../lib/purchasing/register.ts";
import {
  queryRegister,
  registerQuery,
} from "../lib/purchasing/register-server.ts";
import type { Purchase, Workspace } from "../lib/purchasing/types.ts";
const h = await createHarness();
const { sql, req, read, routes } = h;
const now = new Date().toISOString();
const input = {
  department: "Packaging (90)",
  purchaseType: "Facilities",
  priority: "Medium",
  neededBy: "2026-12-01",
  supplier: "Requirements Supplier",
  explanation: "Replacement part",
  items: [
    {
      description: "Requirements part",
      partNumber: "REQ-NEW",
      quantity: 1,
      unitPrice: 100,
    },
  ],
};
test("withdrawal stops approvals, preserves decisions and requires the requester and a Pending unordered proposal", async () => {
  await h.identity();
  const created = (
    await read(await routes.create.POST(req("POST", "demo-employee", input)))
  ).data;
  const invoke = (actor: string, action: string, version: number) =>
    routes.update.PATCH(
      req("PATCH", actor, { action, version, note: "No longer needed" }),
      { params: Promise.resolve({ id: created.id }) },
    );
  assert.equal((await invoke("demo-accounting", "withdraw", 1)).status, 403);
  const withdrawn = await read(await invoke("demo-employee", "withdraw", 1));
  assert.equal(withdrawn.status, 200);
  assert.equal(withdrawn.data.status, "Withdrawn");
  assert.equal(withdrawn.data.withdrawalReason, "No longer needed");
  assert.equal((await invoke("demo-supervisor", "approve", 2)).status, 403);
  assert.equal((await invoke("demo-employee", "withdraw", 2)).status, 400);
  assert.equal(isOverdue(withdrawn.data, "2027-01-01"), false);
  const events = sql
    .prepare("SELECT data FROM audit_events WHERE request_id=?")
    .all(created.id)
    .map((r: any) => JSON.parse(r.data));
  assert.equal(events.length, 2);
  assert.ok(
    events[1].changes.some(
      (c: any) =>
        c.field === "status" &&
        c.before === "Pending" &&
        c.after === "Withdrawn",
    ),
  );
  assert.throws(
    () =>
      sql
        .prepare("UPDATE audit_events SET at='changed' WHERE request_id=?")
        .run(created.id),
    /append-only/,
  );
  assert.throws(
    () =>
      sql
        .prepare("DELETE FROM audit_events WHERE request_id=?")
        .run(created.id),
    /append-only/,
  );
  const accounting = DEMO_MEMBERS.find((m) => m.roles.includes("accounting"))!;
  assert.throws(() =>
    saveOrder(
      withdrawn.data,
      accounting,
      { poNumber: "INVALID", orderedAt: businessDate(now) },
      now,
    ),
  );
  assert.throws(() =>
    withdraw({ ...created, status: "Approved" }, DEMO_MEMBERS[0], "", now),
  );
  assert.throws(() =>
    withdraw({ ...created, order: {} }, DEMO_MEMBERS[0], "", now),
  );
});
test("final invoice variance uses approved total, preserves zero and rejects invalid amounts or employees", async () => {
  const accounting = DEMO_MEMBERS.find((m) => m.roles.includes("accounting"))!;
  const seed = buildSeed().requests[0];
  const p: Purchase = {
    ...seed,
    status: "Approved",
    total: 100,
    approvedAt: now,
    order: null,
  };
  const order = {
    poNumber: "INV-TEST",
    orderedAt: businessDate(now),
    finalInvoiceAmount: 125.55,
  };
  const changed = saveOrder(p, accounting, order, now);
  assert.deepEqual(invoiceVariance(changed), {
    amount: 125.55,
    amountDifference: 25.55,
    percentageDifference: 25.55,
  });
  const zero = saveOrder(
    p,
    accounting,
    { ...order, finalInvoiceAmount: 0 },
    now,
  );
  assert.deepEqual(invoiceVariance(zero), {
    amount: 0,
    amountDifference: -100,
    percentageDifference: -100,
  });
  assert.equal(
    invoiceVariance(
      saveOrder(p, accounting, { ...order, finalInvoiceAmount: "" }, now),
    ),
    null,
  );
  for (const bad of [-1, Infinity, "bad"])
    assert.throws(() =>
      saveOrder(p, accounting, { ...order, finalInvoiceAmount: bad }, now),
    );
  assert.throws(() => saveOrder(p, DEMO_MEMBERS[0], order, now));
  const rows = exportRows([changed]);
  assert.equal(rows[1][rows[0].indexOf("Final invoice amount")], 125.55);
  assert.equal(rows[1][rows[0].indexOf("Invoice variance amount")], 25.55);
});
test("date shortcuts display the actual selection, manual dates display Custom, and every header has a sort option", () => {
  const today = "2026-10-23";
  for (const period of ["all", "7", "30", "month", "year"] as const) {
    const dates = periodDates(period, today);
    assert.equal(
      periodSelection({ ...DEFAULT_FILTERS, ...dates, period }, today),
      period,
    );
  }
  assert.equal(
    periodSelection(
      { ...DEFAULT_FILTERS, from: "2026-10-01", to: today, period: "custom" },
      today,
    ),
    "custom",
  );
  assert.equal(
    periodSelection(
      { ...DEFAULT_FILTERS, from: "2026-09-01", to: today, period: "7" },
      today,
    ),
    "custom",
  );
  for (const field of [
    "number",
    "title",
    "department",
    "requesterName",
    "total",
    "priority",
    "submittedAt",
    "neededBy",
    "status",
  ])
    assert.ok(field in SORT_FIELDS);
});
test("indexed server results match access, filtering, sorting and approval rules for every role", async () => {
  const requests = sql
    .prepare("SELECT data FROM purchase_requests")
    .all()
    .map((r: any) => JSON.parse(r.data) as Purchase);
  for (const me of DEMO_MEMBERS) {
    const w: Workspace = {
      me,
      owner: false,
      actors: [],
      members: [],
      audit: [],
      requests: requests.filter((p) => canView(me, p)),
      demoMode: true,
    };
    for (const view of ["requests", "approvals", "history"])
      for (const sortField of [
        "title",
        "total",
        "priority",
        "approvedAt",
        "submittedAt",
      ] as const)
        for (const direction of ["asc", "desc"] as const) {
          const f = { ...DEFAULT_FILTERS, view, sortField, direction };
          const expected = selectRequests(w, f).map((p) => p.id);
          const actual = await queryRegister(h.env.DB as any, me, f, 1, 100);
          assert.deepEqual(
            actual.requests.map((p) => p.id),
            expected,
            `${me.id} ${view} ${sortField} ${direction}`,
          );
        }
    const f = {
      ...DEFAULT_FILTERS,
      view: "approvals",
      status: "Rejected",
      fulfillment: "Received",
    };
    const result = await queryRegister(h.env.DB as any, me, f, 1, 100);
    assert.ok(result.requests.every((p) => canApprove(me, p)));
  }
  for (const patch of [
    { search: "REQ-NEW" },
    { department: "Packaging (90)", priority: "High" },
    { from: "2026-10-01", to: "2026-10-23" },
    { overdueOnly: true },
    { view: "history", fulfillment: "Not ordered" },
  ]) {
    const me = { ...DEMO_MEMBERS[0], roles: ["accounting"] as const };
    const f = { ...DEFAULT_FILTERS, ...patch };
    const w = {
      me,
      owner: true,
      actors: [],
      members: [],
      audit: [],
      requests: requests.filter((p) => canView(me as any, p)),
      demoMode: true,
    } as unknown as Workspace;
    const result = await queryRegister(h.env.DB as any, w.me, f, 1, 100);
    assert.deepEqual(
      result.requests.map((p) => p.id),
      selectRequests(w, f).map((p) => p.id),
    );
  }
});
test("pagination exports all matching rows and an unknown sort or invalid range fails cleanly", async () => {
  const list = await read(
    await routes.register.GET(
      req(
        "GET",
        "demo-accounting",
        undefined,
        "/api/register?size=1&sortField=title&direction=asc",
      ),
    ),
  );
  assert.equal(list.data.requests.length, 1);
  assert.ok(list.data.total > 1);
  const exported = await routes.export.GET(
    req(
      "GET",
      "demo-accounting",
      undefined,
      "/api/register/export?size=1&sortField=title&direction=asc",
    ),
  );
  assert.equal(exported.status, 200);
  assert.equal(Number(exported.headers.get("X-Export-Count")), list.data.total);
  assert.match(exported.headers.get("Content-Type")!, /spreadsheetml/);
  for (const query of [
    "sortField=malicious_sql",
    "from=2026-02-30",
    "from=2026-10-24&to=2026-10-01",
  ])
    assert.equal(
      (
        await routes.register.GET(
          req("GET", "", undefined, `/api/register?${query}`),
        )
      ).status,
      400,
    );
  const literal = await read(
    await routes.register.GET(
      req("GET", "", undefined, "/api/register?search=%25"),
    ),
  );
  assert.equal(literal.data.total, 0);
});
