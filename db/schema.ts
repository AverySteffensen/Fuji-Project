import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
export const settings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  data: text("data").notNull(),
});
export const requests = sqliteTable("purchase_requests", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});
export const audits = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  data: text("data").notNull(),
  at: text("at").notNull(),
});
export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  size: integer("size").notNull(),
  storageKey: text("storage_key"),
});
export const appSessions = sqliteTable("app_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
  mfaAt: integer("mfa_at"),
  revoked: integer("revoked").notNull().default(0),
});
export const securityFactors = sqliteTable("security_factors", {
  userId: text("user_id").primaryKey(),
  secret: text("secret"),
  pendingSecret: text("pending_secret"),
  pendingExpires: integer("pending_expires"),
  enabledAt: integer("enabled_at"),
  lastCounter: integer("last_counter").notNull().default(-1),
  recoveryHashes: text("recovery_hashes").notNull().default("[]"),
  failures: integer("failures").notNull().default(0),
  blockedUntil: integer("blocked_until").notNull().default(0),
});
export const securityEvents = sqliteTable("security_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  at: text("at").notNull(),
});
export const backupRuns = sqliteTable("backup_runs", {
  id: text("id").primaryKey(),
  at: text("at").notNull(),
  status: text("status").notNull(),
  data: text("data").notNull(),
});
export const backupRows = sqliteTable(
  "backup_rows",
  {
    runId: text("run_id").notNull(),
    kind: text("kind").notNull(),
    rowId: text("row_id").notNull(),
    data: text("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.kind, t.rowId] })],
);
export const healthChecks = sqliteTable("health_checks", {
  id: text("id").primaryKey(),
  at: text("at").notNull(),
  ok: integer("ok").notNull(),
  duration: integer("duration").notNull(),
  message: text("message").notNull(),
});
export const operationAlerts = sqliteTable("operation_alerts", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  at: text("at").notNull(),
  deliveredAt: text("delivered_at"),
  data: text("data").notNull(),
});
export const requestIndex = sqliteTable(
  "request_index",
  {
    id: text("id").primaryKey(),
    version: integer("version").notNull(),
    number: text("number").notNull(),
    title: text("title").notNull(),
    supplier: text("supplier").notNull(),
    requesterId: text("requester_id").notNull(),
    requesterName: text("requester_name").notNull(),
    department: text("department").notNull(),
    status: text("status").notNull(),
    priority: integer("priority").notNull(),
    sample: integer("sample").notNull(),
    total: real("total").notNull(),
    hasOrder: integer("has_order").notNull(),
    submittedAt: text("submitted_day").notNull(),
    neededBy: text("needed_by").notNull(),
    approvedAt: text("approved_day").notNull(),
    orderedAt: text("ordered_day").notNull(),
    expectedAt: text("expected_day").notNull(),
    receivedAt: text("received_day").notNull(),
    searchText: text("search_text").notNull(),
    reviewRoles: text("review_roles").notNull(),
  },
  (t) => [
    index("register_requester_date").on(t.requesterId, t.submittedAt),
    index("register_status_date").on(t.status, t.submittedAt),
    index("register_department_date").on(t.department, t.submittedAt),
  ],
);
