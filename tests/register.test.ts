import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { crc32 } from "node:zlib";
import { buildSeed, DEMO_MEMBERS } from "../lib/purchasing/seed.ts";
import { sanitizeRequest } from "../lib/purchasing/domain.ts";
import {
  DEFAULT_FILTERS,
  selectRequests,
  isOverdue,
  requestDate,
} from "../lib/purchasing/register.ts";
import {
  createXlsx,
  purchaseSheets,
  excelDate,
} from "../lib/purchasing/xlsx.ts";
import type { Purchase, Workspace } from "../lib/purchasing/types.ts";

const seed = buildSeed();
const w: Workspace = {
  me: { ...DEMO_MEMBERS[0], roles: ["admin"] },
  owner: true,
  actors: [],
  members: DEMO_MEMBERS,
  requests: seed.requests,
  audit: seed.audit,
  demoMode: false,
};
const base = (): Purchase => ({
  ...seed.requests[0],
  neededBy: "2026-10-22",
  status: "Pending",
  order: null,
});

test("priority validation accepts all three levels and rejects the old scale", () => {
  for (const priority of ["Low", "Medium", "High"])
    assert.equal(sanitizeRequest({ ...base(), priority }).priority, priority);
  for (const priority of ["Rush", "Normal", "Critical", ""])
    assert.throws(() => sanitizeRequest({ ...base(), priority }));
  assert.deepEqual(
    new Set(seed.requests.map((p) => p.priority)),
    new Set(["Low", "Medium", "High"]),
  );
});
test("overdue requests exclude rejected and received records and are not overdue on their due date", () => {
  const p = base();
  assert.equal(isOverdue(p, "2026-10-22"), false);
  assert.equal(isOverdue(p, "2026-10-23"), true);
  assert.equal(isOverdue({ ...p, status: "Approved" }, "2026-10-23"), true);
  assert.equal(isOverdue({ ...p, status: "Rejected" }, "2026-10-23"), false);
  assert.equal(
    isOverdue(
      {
        ...p,
        order: {
          ...seed.requests.find((p) => p.order)!.order!,
          receivedAt: "2026-10-21",
        },
      },
      "2026-10-23",
    ),
    false,
  );
});
test("inclusive date ranges use the Eastern calendar at UTC midnight", () => {
  const p = { ...base(), submittedAt: "2026-10-23T01:30:00Z" };
  assert.equal(requestDate(p, "submittedAt"), "2026-10-22");
  const workspace = { ...w, requests: [p] };
  assert.equal(
    selectRequests(workspace, {
      ...DEFAULT_FILTERS,
      from: "2026-10-22",
      to: "2026-10-22",
    }).length,
    1,
  );
  assert.equal(
    selectRequests(workspace, { ...DEFAULT_FILTERS, from: "2026-10-23" })
      .length,
    0,
  );
  assert.equal(
    selectRequests(workspace, {
      ...DEFAULT_FILTERS,
      from: "2026-10-24",
      to: "2026-10-22",
    }).length,
    0,
  );
  assert.equal(
    selectRequests(workspace, {
      ...DEFAULT_FILTERS,
      dateField: "orderedAt",
      from: "2026-01-01",
    }).length,
    0,
  );
});
test("sorting dates, amounts, and priorities is stable and leaves missing dates last", () => {
  const records = [
    {
      ...base(),
      id: "low",
      priority: "Low" as const,
      total: 90,
      approvedAt: "",
    },
    {
      ...base(),
      id: "medium",
      priority: "Medium" as const,
      total: 100,
      approvedAt: "2026-10-22T12:00:00Z",
    },
    {
      ...base(),
      id: "high",
      priority: "High" as const,
      total: 20,
      approvedAt: "2026-10-21T12:00:00Z",
    },
  ];
  const workspace = { ...w, requests: records };
  assert.deepEqual(
    selectRequests(workspace, {
      ...DEFAULT_FILTERS,
      sortField: "priority",
      direction: "asc",
    }).map((p) => p.id),
    ["low", "medium", "high"],
  );
  assert.deepEqual(
    selectRequests(workspace, {
      ...DEFAULT_FILTERS,
      sortField: "total",
      direction: "desc",
    }).map((p) => p.id),
    ["medium", "low", "high"],
  );
  assert.deepEqual(
    selectRequests(workspace, {
      ...DEFAULT_FILTERS,
      sortField: "approvedAt",
      direction: "asc",
    }).map((p) => p.id),
    ["high", "medium", "low"],
  );
  assert.deepEqual(
    selectRequests(workspace, {
      ...DEFAULT_FILTERS,
      sortField: "approvedAt",
      direction: "desc",
    }).map((p) => p.id),
    ["medium", "high", "low"],
  );
  assert.equal(records[0].id, "low");
});
test("combined filters and each tab's export preserve the exact selected records", () => {
  const filters = {
    ...DEFAULT_FILTERS,
    department: "Packaging (90)",
    priority: "High",
    overdueOnly: true,
  };
  const selected = selectRequests(w, filters, "2026-11-30");
  assert.ok(selected.length);
  assert.ok(
    selected.every(
      (p) =>
        p.department === filters.department &&
        p.priority === "High" &&
        isOverdue(p, "2026-11-30"),
    ),
  );
  const sheets = purchaseSheets(selected, w, filters);
  assert.deepEqual(
    sheets[0].rows.slice(1).map((r) => r[0]),
    selected.map((p) => p.number),
  );
  assert.equal(
    sheets[1].rows.length - 1,
    selected.reduce((n, p) => n + p.items.length, 0),
  );
  assert.ok(
    sheets[3].rows
      .slice(1)
      .every((r) => selected.some((p) => p.number === r[0])),
  );
  assert.ok(
    selectRequests(w, { ...DEFAULT_FILTERS, view: "history" }).every(
      (p) => p.order,
    ),
  );
  assert.equal(
    selectRequests(
      { ...w, me: DEMO_MEMBERS[0] },
      { ...DEFAULT_FILTERS, view: "approvals" },
    ).length,
    0,
  );
});
function unzip(data: Uint8Array): Map<string, string> {
  const files = new Map<string, string>();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    assert.equal(view.getUint16(at + 8, true), 0);
    const size = view.getUint32(at + 18, true),
      names = view.getUint16(at + 26, true),
      extra = view.getUint16(at + 28, true);
    const start = at + 30 + names + extra,
      payload = data.slice(start, start + size);
    assert.equal(crc32(payload), view.getUint32(at + 14, true));
    files.set(
      new TextDecoder().decode(data.slice(at + 30, at + 30 + names)),
      new TextDecoder().decode(payload),
    );
    at = start + size;
  }
  assert.equal(view.getUint32(at, true), 0x02014b50);
  assert.equal(view.getUint32(data.length - 22, true), 0x06054b50);
  return files;
}
test("Excel workbooks contain typed values, filterable tables, frozen headings, and dynamic overdue formatting", () => {
  const selected = selectRequests(w, DEFAULT_FILTERS);
  const files = unzip(createXlsx(purchaseSheets(selected, w, DEFAULT_FILTERS)));
  assert.match(files.get("xl/workbook.xml")!, /name="Requests"/);
  const requests = files.get("xl/worksheets/sheet1.xml")!;
  assert.match(requests, /state="frozen"/);
  assert.match(requests, /<conditionalFormatting/);
  assert.match(requests, /TODAY\(\)/);
  assert.match(requests, /<c r="L2" s="2"><v>/); // request total remains numeric
  assert.match(requests, /s="4"><v>\d/); // timestamps are native Excel values
  assert.match(files.get("xl/tables/table1.xml")!, /autoFilter ref="A1:/);
  assert.doesNotMatch(requests, /Sample data|Fictional|demonstration|<f>/);
  assert.equal(
    excelDate({ date: "2026-10-23T01:30:00Z", time: true }),
    excelDate({ date: "2026-10-22" })! + 21.5 / 24,
  );
});
test("Excel export keeps hostile text literal and handles empty result sets", () => {
  const files = unzip(
    createXlsx([
      {
        name: "Requests",
        rows: [
          ["Text", "Amount"],
          ['=HYPERLINK("https://example.test","open") & <tag>', 12.34],
        ],
        currency: [1],
      },
    ]),
  );
  const sheet = files.get("xl/worksheets/sheet1.xml")!;
  assert.match(sheet, /t="inlineStr"/);
  assert.match(sheet, /&amp; &lt;tag&gt;/);
  assert.doesNotMatch(sheet, /<f>/);
  assert.match(sheet, /<v>12.34<\/v>/);
  assert.ok(
    unzip(createXlsx(purchaseSheets([], w, DEFAULT_FILTERS))).has(
      "xl/workbook.xml",
    ),
  );
});
test("priority migration updates older records and archived revisions idempotently", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync("drizzle/0000_futuristic_doctor_doom.sql", "utf8").replaceAll(
      "--> statement-breakpoint",
      "",
    ),
  );
  db.prepare("INSERT INTO purchase_requests VALUES (?,?,?,?)").run(
    "old",
    JSON.stringify({ priority: "Rush" }),
    1,
    "2026-10-22",
  );
  db.prepare("INSERT INTO audit_events VALUES (?,?,?,?)").run(
    "audit",
    "old",
    JSON.stringify({ previousVersion: { priority: "Normal" } }),
    "2026-10-22",
  );
  const migration = readFileSync(
    "drizzle/0001_priority_levels.sql",
    "utf8",
  ).replaceAll("--> statement-breakpoint", "");
  db.exec(migration);
  db.exec(migration);
  assert.equal(
    JSON.parse(
      String(db.prepare("SELECT data FROM purchase_requests").get()!.data),
    ).priority,
    "High",
  );
  assert.equal(
    JSON.parse(String(db.prepare("SELECT data FROM audit_events").get()!.data))
      .previousVersion.priority,
    "Medium",
  );
  db.close();
});
