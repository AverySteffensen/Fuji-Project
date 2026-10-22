import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSeed, DEMO_MEMBERS } from "../lib/purchasing/seed.ts";
import {
  approvalSteps,
  approve,
  reject,
  resubmit,
  saveOrder,
  sanitizeRequest,
  canView,
  canApprove,
  toCSV,
  exportRows,
  emergencyDue,
  businessDate,
} from "../lib/purchasing/domain.ts";
import type { Purchase, Member, Role } from "../lib/purchasing/types.ts";
const base = (): Purchase => ({
  ...buildSeed().requests[0],
  status: "Pending",
  approvals: [],
  approvedAt: "",
  order: null,
  emergency: false,
});
const actor = (r: Role): Member =>
  DEMO_MEMBERS.find((m) => m.roles.includes(r))!;
const at = "2026-10-22T17:00:00.000Z";
test("amount boundaries follow the documented approval tiers", () => {
  for (const [total, steps] of [
    [149.99, [["supervisor"]]],
    [150, [["supervisor"]]],
    [150.01, [["supervisor"], ["controller", "vicepresident"]]],
    [1000, [["supervisor"], ["controller", "vicepresident"]]],
    [1000.01, [["supervisor"], ["controller"], ["vicepresident"]]],
  ] as [number, Role[][]][]) {
    assert.deepEqual(
      approvalSteps({ ...base(), total, purchaseType: "Facilities" }),
      steps,
    );
  }
});
test("basic tier supports supervisor absence and raw materials exception", () => {
  assert.deepEqual(
    approvalSteps({ ...base(), total: 150, supervisorUnavailable: true }),
    [["treasurer", "controller"]],
  );
  assert.deepEqual(
    approvalSteps({ ...base(), purchaseType: "Raw materials", total: 100000 }),
    [["plantmanager", "controller"]],
  );
});
test("high-value purchases require all three dated steps in order", () => {
  let p = base();
  assert.equal(canApprove(actor("controller"), p), false);
  assert.throws(() => approve(p, actor("vicepresident"), at));
  p = approve(p, actor("supervisor"), at);
  assert.equal(p.status, "Pending");
  p = approve(p, actor("controller"), at);
  assert.equal(p.status, "Pending");
  p = approve(p, actor("vicepresident"), at);
  assert.equal(p.status, "Approved");
  assert.equal(p.approvedAt, at);
  assert.equal(p.approvals.length, 3);
  assert.ok(p.approvals.every((a) => a.at === at));
  assert.throws(() => approve(p, actor("vicepresident"), at));
});
test("one of controller or VP completes the middle tier", () => {
  for (const r of ["controller", "vicepresident"] as Role[]) {
    let p = { ...base(), total: 500 };
    p = approve(p, actor("supervisor"), at);
    p = approve(p, actor(r), at);
    assert.equal(p.status, "Approved");
    assert.equal(p.approvals.length, 2);
  }
});
test("scope restricts employee and supervisor access and blocks self approval", () => {
  const p = base(),
    own = actor("employee");
  assert.equal(canView(own, p), true);
  assert.equal(canView({ ...own, id: "another" }, p), false);
  assert.equal(canApprove({ ...own, roles: ["supervisor"] }, p), false);
  assert.equal(
    canApprove({ ...actor("supervisor"), departments: ["Lab"] }, p),
    false,
  );
  assert.equal(canView(actor("accounting"), p), true);
});
test("rejection requires a reason and resubmission starts a fresh revision", () => {
  const p = base();
  assert.throws(() => reject(p, actor("supervisor"), at, ""));
  const rejected = reject(p, actor("supervisor"), at, "Need a second quote.");
  const revised = resubmit(
    rejected,
    actor("employee"),
    {
      ...p,
      items: [
        {
          description: "New item",
          partNumber: "X",
          quantity: 2,
          unitPrice: 12.45,
        },
      ],
    },
    at,
  );
  assert.equal(revised.revision, 2);
  assert.equal(revised.total, 24.9);
  assert.equal(revised.status, "Pending");
  assert.equal(revised.approvals.length, 0);
  assert.equal(revised.order, null);
  assert.equal(rejected.rejectionReason, "Need a second quote.");
  assert.throws(() => resubmit(rejected, actor("accounting"), p, at));
});
test("required fields and finite numeric values are enforced server-side", () => {
  const p = base();
  for (const patch of [
    { supplier: "" },
    { explanation: "" },
    { department: "Bad" },
    { neededBy: "2026-02-31" },
    { items: [] },
    { items: [{ description: "X", quantity: -1, unitPrice: 3 }] },
    { items: [{ description: "X", quantity: 1, unitPrice: Infinity }] },
  ])
    assert.throws(() => sanitizeRequest({ ...p, ...patch }));
  const clean = sanitizeRequest({
    ...p,
    requesterId: "fake",
    status: "Approved",
    poNumber: "FAKE",
  });
  assert.equal(clean.total, p.total);
  assert.equal("status" in clean, false);
  assert.equal("requesterId" in clean, false);
});
test("PO details belong to Accounting and normally require completed approval", () => {
  const p = base(),
    o = { poNumber: "DEMO-123", orderedAt: "2026-10-22" };
  assert.throws(() => saveOrder(p, actor("accounting"), o, at));
  assert.throws(() =>
    saveOrder(
      { ...p, status: "Approved", approvedAt: at },
      actor("employee"),
      o,
      at,
    ),
  );
  const approved = { ...p, status: "Approved" as const, approvedAt: at };
  const saved = saveOrder(approved, actor("accounting"), o, at);
  assert.equal(saved.order?.poNumber, "DEMO-123");
  assert.throws(() =>
    saveOrder(
      approved,
      actor("accounting"),
      { ...o, orderedAt: "2026-10-21" },
      at,
    ),
  );
  assert.throws(() =>
    saveOrder(
      approved,
      actor("accounting"),
      { ...o, trackingUrl: "javascript:alert(1)" },
      at,
    ),
  );
  assert.throws(() =>
    saveOrder(
      approved,
      actor("accounting"),
      { ...o, receivedAt: "2026-10-21" },
      at,
    ),
  );
});
test("emergencies retain written approvals and calculate the one-day due time", () => {
  const p = {
    ...base(),
    emergency: true,
    verbalApprovedAt: "2026-10-21T17:00:00.000Z",
  };
  assert.equal(emergencyDue(p), at);
  const ordered = saveOrder(
    p,
    actor("accounting"),
    { poNumber: "EM-1", orderedAt: "2026-10-21" },
    at,
  );
  assert.equal(ordered.status, "Pending");
  assert.equal(ordered.order?.poNumber, "EM-1");
  assert.throws(() =>
    saveOrder(
      p,
      actor("accounting"),
      { poNumber: "EM-1", orderedAt: "2026-10-20" },
      at,
    ),
  );
});
test("CSV export protects spreadsheet formulas and escapes quotes/newlines", () => {
  const csv = toCSV([
    [
      '=HYPERLINK("bad")',
      "normal",
      "@cmd",
      "+SUM(A1)",
      "-4",
      "line\nnext",
      '"quoted"',
    ],
  ]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"\'@cmd"'));
  assert.ok(csv.includes('"line\nnext"'));
  assert.ok(csv.includes('""quoted""'));
});
test("summary and line exports include all approval/order fields with consistent columns", () => {
  const data = buildSeed();
  for (const line of [false, true]) {
    const rows = exportRows(data.requests, line);
    assert.ok(rows.every((r) => r.length === rows[0].length));
    assert.ok(rows[0].includes("Approved at"));
    assert.ok(rows[0].includes("Ordered on"));
    assert.ok(rows[0].includes("Sample data"));
    assert.equal(rows.length, line ? 73 : 65);
  }
  assert.equal(data.requests.length, 64);
  assert.ok(data.requests.every((p) => p.sample));
  assert.equal(new Set(data.requests.map((p) => p.id)).size, 64);
  assert.ok(data.requests.some((p) => p.status === "Rejected"));
  assert.ok(data.requests.some((p) => p.order?.receivedAt));
});

test("review regression: demo actors cannot access or approve live records", () => {
  const p = { ...base(), sample: false };
  assert.equal(canView(actor("accounting"), p), false);
  assert.equal(canApprove(actor("supervisor"), p), false);
  assert.throws(() => approve(p, actor("supervisor"), at));
});
test("review regression: rejected emergencies cannot be ordered", () => {
  const p = {
    ...base(),
    emergency: true,
    status: "Rejected" as const,
    verbalApprovedAt: at,
  };
  assert.throws(() =>
    saveOrder(
      p,
      actor("accounting"),
      { poNumber: "BLOCK", orderedAt: "2026-10-22" },
      at,
    ),
  );
});
test("review regression: business dates follow Fuji Eastern time across midnight", () => {
  assert.equal(businessDate("2026-10-23T01:30:00Z"), "2026-10-22");
  const p = {
    ...base(),
    status: "Approved" as const,
    approvedAt: "2026-10-23T01:00:00Z",
  };
  const saved = saveOrder(
    p,
    actor("accounting"),
    { poNumber: "LATE", orderedAt: "2026-10-22" },
    "2026-10-23T01:30:00Z",
  );
  assert.equal(saved.order?.orderedAt, "2026-10-22");
});
