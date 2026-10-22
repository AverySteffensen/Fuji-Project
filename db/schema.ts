import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
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
});
