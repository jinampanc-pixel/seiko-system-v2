import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Shared ERP order snapshot.
 *
 * The complete domain document is stored as JSON so the existing order model can
 * evolve without destructive relational migrations. Search/audit/concurrency
 * fields remain first-class columns.
 */
export const erpOrders = sqliteTable("erp_orders", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  orderNo: text("order_no").notNull(),
  status: text("status").notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  documentJson: text("document_json").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
}, table => [
  uniqueIndex("erp_orders_business_order_no_uq").on(table.businessId, table.orderNo),
  index("erp_orders_business_updated_idx").on(table.businessId, table.updatedAt),
  index("erp_orders_business_status_idx").on(table.businessId, table.status),
]);

/** Immutable audit event for every server-side order mutation. */
export const erpAuditEvents = sqliteTable("erp_audit_events", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  version: integer("version").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  at: text("at").notNull(),
  snapshotJson: text("snapshot_json"),
}, table => [
  index("erp_audit_entity_idx").on(table.businessId, table.entityType, table.entityId, table.at),
  index("erp_audit_actor_idx").on(table.businessId, table.actorEmail, table.at),
]);

/** Shared owner/admin-managed option sets and small ERP preferences. */
export const erpPreferences = sqliteTable("erp_preferences", {
  businessId: text("business_id").notNull(),
  key: text("key").notNull(),
  valueJson: text("value_json").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
}, table => [
  uniqueIndex("erp_preferences_business_key_uq").on(table.businessId, table.key),
]);
