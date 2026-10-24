import { businessDate, BusinessError, hasRole, nextStep } from "./domain.ts";
import {
  DEFAULT_FILTERS,
  SORT_FIELDS,
  type RegisterFilters,
  type SortField,
} from "./register.ts";
import type { Member, Purchase } from "./types.ts";
const columns = [
  "id",
  "version",
  "number",
  "title",
  "supplier",
  "requester_id",
  "requester_name",
  "department",
  "status",
  "priority",
  "sample",
  "total",
  "has_order",
  "submitted_day",
  "needed_by",
  "approved_day",
  "ordered_day",
  "expected_day",
  "received_day",
  "search_text",
  "review_roles",
];
export function indexStatement(
  db: D1Database,
  p: Purchase,
  mutationId?: string,
) {
  const day = (s: string) => (s ? (s.length > 10 ? businessDate(s) : s) : "");
  const values = [
    p.id,
    p.version,
    p.number,
    p.title,
    p.supplier,
    p.requesterId,
    p.requesterName,
    p.department,
    p.status,
    { Low: 0, Medium: 1, High: 2 }[p.priority],
    p.sample ? 1 : 0,
    p.total,
    p.order ? 1 : 0,
    day(p.submittedAt),
    p.neededBy,
    day(p.approvedAt),
    p.order?.orderedAt ?? "",
    p.order?.expectedAt ?? "",
    p.order?.receivedAt ?? "",
    [
      p.number,
      p.title,
      p.supplier,
      p.requesterName,
      p.quoteNumber,
      p.order?.poNumber,
      p.department,
      p.contactName,
      p.projectManager,
      p.explanation,
      ...p.items.flatMap((i) => [i.partNumber, i.description]),
      ...p.quotes.flatMap((q) => [q.vendor, q.number]),
    ]
      .join(" ")
      .toLowerCase(),
    JSON.stringify(p.status === "Pending" ? nextStep(p) : []),
  ];
  return db
    .prepare(
      `INSERT INTO request_index(${columns.join(",")}) SELECT ${columns.map(() => "?").join(",")} WHERE ${mutationId ? "EXISTS(SELECT 1 FROM purchase_requests WHERE id=? AND json_extract(data,'$.lastMutationId')=?)" : "EXISTS(SELECT 1 FROM purchase_requests WHERE id=? AND version=?)"} ON CONFLICT(id) DO UPDATE SET ${columns
        .slice(1)
        .map((c) => `${c}=excluded.${c}`)
        .join(",")} WHERE excluded.version>=request_index.version`,
    )
    .bind(...values, p.id, mutationId ?? p.version);
}
export async function rebuildIndex(db: D1Database) {
  let cursor = "";
  for (;;) {
    const page = await db
      .prepare(
        "SELECT id,data FROM purchase_requests WHERE id>? ORDER BY id LIMIT 200",
      )
      .bind(cursor)
      .all<{ id: string; data: string }>();
    if (!page.results.length) break;
    await db.batch(
      page.results.map((r) => indexStatement(db, JSON.parse(r.data))),
    );
    cursor = page.results[page.results.length - 1].id;
  }
  await db
    .prepare(
      "INSERT OR REPLACE INTO app_settings(key,value) VALUES ('register-index-v3','complete')",
    )
    .run();
}
const fieldColumns: Record<SortField, string> = {
  number: "number",
  title: "title",
  supplier: "supplier",
  requesterName: "requester_name",
  department: "department",
  status: "status",
  priority: "priority",
  total: "total",
  submittedAt: "submitted_day",
  neededBy: "needed_by",
  approvedAt: "approved_day",
  orderedAt: "ordered_day",
  expectedAt: "expected_day",
  receivedAt: "received_day",
};
export function readFilters(url: URL): RegisterFilters {
  const f = { ...DEFAULT_FILTERS };
  for (const name of [
    "view",
    "search",
    "status",
    "department",
    "priority",
    "fulfillment",
    "from",
    "to",
  ] as const)
    f[name] = (url.searchParams.get(name) ?? f[name]).slice(0, 500);
  f.sortField = (url.searchParams.get("sortField") ?? f.sortField) as SortField;
  f.dateField = (url.searchParams.get("dateField") ??
    f.dateField) as RegisterFilters["dateField"];
  f.direction = url.searchParams.get("direction") === "asc" ? "asc" : "desc";
  f.overdueOnly = url.searchParams.get("overdueOnly") === "true";
  if (
    !(f.sortField in SORT_FIELDS) ||
    ![
      "submittedAt",
      "neededBy",
      "approvedAt",
      "orderedAt",
      "expectedAt",
      "receivedAt",
    ].includes(f.dateField)
  )
    throw new BusinessError("Choose a valid date or sort field.");
  if (!["requests", "approvals", "history"].includes(f.view))
    f.view = "requests";
  for (const d of [f.from, f.to])
    if (
      d &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(d) ||
        Number.isNaN(Date.parse(d + "T12:00:00Z")) ||
        new Date(d + "T12:00:00Z").toISOString().slice(0, 10) !== d)
    )
      throw new BusinessError("Use valid filter dates.");
  if (f.from && f.to && f.from > f.to)
    throw new BusinessError(
      "The From date must be on or before the Through date.",
    );
  return f;
}
function access(me: Member) {
  const conditions: string[] = [],
    values: unknown[] = [];
  if (me.demo) conditions.push("i.sample=1");
  if (
    !hasRole(
      me,
      "admin",
      "accounting",
      "controller",
      "vicepresident",
      "plantmanager",
      "treasurer",
    )
  ) {
    let ownership = "i.requester_id=?";
    values.push(me.id);
    if (hasRole(me, "supervisor") && me.departments.length) {
      ownership += ` OR i.department IN (${me.departments.map(() => "?").join(",")})`;
      values.push(...me.departments);
    }
    conditions.push(`(${ownership})`);
  }
  return { conditions, values };
}
function approvalClause(me: Member) {
  const values: unknown[] = [me.id, ...me.roles];
  let clause = `i.status='Pending' AND i.requester_id<>? AND EXISTS(SELECT 1 FROM json_each(i.review_roles) WHERE value IN (${me.roles.map(() => "?").join(",")}))`;
  if (me.roles.includes("supervisor")) {
    clause += ` AND (NOT EXISTS(SELECT 1 FROM json_each(i.review_roles) WHERE value='supervisor') OR i.department IN (${me.departments.length ? me.departments.map(() => "?").join(",") : "NULL"}))`;
    values.push(...me.departments);
  }
  return { clause, values };
}
export function registerQuery(
  me: Member,
  f: RegisterFilters,
  today = businessDate(new Date().toISOString()),
) {
  const { conditions, values } = access(me);
  if (f.view === "approvals") {
    const a = approvalClause(me);
    conditions.push(a.clause);
    values.push(...a.values);
  }
  if (f.view === "history") conditions.push("i.has_order=1");
  if (f.view !== "approvals" && f.status) {
    conditions.push("i.status=?");
    values.push(f.status);
  }
  if (f.department) {
    conditions.push("i.department=?");
    values.push(f.department);
  }
  if (f.priority) {
    conditions.push("i.priority=?");
    values.push({ Low: 0, Medium: 1, High: 2 }[f.priority as "Low"] ?? -1);
  }
  if (f.view !== "approvals") {
    if (f.fulfillment === "Not ordered" && f.view !== "history")
      conditions.push("i.has_order=0");
    if (f.fulfillment === "Ordered")
      conditions.push("i.has_order=1 AND i.received_day=''");
    if (f.fulfillment === "Received") conditions.push("i.received_day<>''");
  }
  if (f.overdueOnly) {
    conditions.push(
      "i.status NOT IN ('Rejected','Withdrawn') AND i.received_day='' AND i.needed_by<>'' AND i.needed_by<?",
    );
    values.push(today);
  }
  if (f.from) {
    conditions.push(`i.${fieldColumns[f.dateField]}>=?`);
    values.push(f.from);
  }
  if (f.to) {
    conditions.push(
      `i.${fieldColumns[f.dateField]}<>'' AND i.${fieldColumns[f.dateField]}<=?`,
    );
    values.push(f.to);
  }
  if (f.search.trim()) {
    conditions.push("i.search_text LIKE ? ESCAPE '\\'");
    values.push(
      `%${f.search
        .trim()
        .toLowerCase()
        .replace(/[\\%_]/g, "\\$&")}%`,
    );
  }
  const column = fieldColumns[f.sortField];
  return {
    where: conditions.length
      ? conditions.map((c) => `(${c})`).join(" AND ")
      : "1",
    values,
    order: `(i.${column}='') ASC, i.${column} COLLATE NOCASE ${f.direction === "asc" ? "ASC" : "DESC"}, i.number ASC`,
  };
}
export async function queryRegister(
  db: D1Database,
  me: Member,
  f: RegisterFilters,
  page = 1,
  size = 25,
) {
  const q = registerQuery(me, f);
  const base = access(me),
    baseWhere = base.conditions.length ? base.conditions.join(" AND ") : "1";
  const a = approvalClause(me);
  const today = businessDate(new Date().toISOString());
  const stats = await db
    .prepare(
      `SELECT COUNT(*) AS total,COALESCE(SUM(total),0) AS value FROM request_index i WHERE ${q.where}`,
    )
    .bind(...q.values)
    .first<{ total: number; value: number }>();
  const pages = Math.max(1, Math.ceil((stats?.total ?? 0) / size));
  page = Math.max(1, Math.min(page, pages));
  const records = await db
    .prepare(
      `SELECT p.data FROM request_index i JOIN purchase_requests p ON p.id=i.id WHERE ${q.where} ORDER BY ${q.order} LIMIT ? OFFSET ?`,
    )
    .bind(...q.values, size, (page - 1) * size)
    .all<{ data: string }>();
  const summary = await db
    .prepare(
      `SELECT COUNT(*) AS total,SUM(CASE WHEN status='Pending' THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN status NOT IN ('Rejected','Withdrawn') AND received_day='' AND needed_by<>'' AND needed_by<? THEN 1 ELSE 0 END) AS overdue,SUM(CASE WHEN ${a.clause} THEN 1 ELSE 0 END) AS approvals FROM request_index i WHERE ${baseWhere}`,
    )
    .bind(today, ...a.values, ...base.values)
    .first();
  const departments = await db
    .prepare(
      `SELECT DISTINCT department FROM request_index i WHERE ${baseWhere} ORDER BY department`,
    )
    .bind(...base.values)
    .all<{ department: string }>();
  return {
    requests: records.results.map((r) => JSON.parse(r.data) as Purchase),
    total: stats?.total ?? 0,
    value: stats?.value ?? 0,
    page,
    pages,
    summary,
    departments: departments.results.map((r) => r.department),
  };
}
