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
  createdByUserId: text("created_by_user_id").notNull(),
  createdByEmail: text("created_by_email").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  updatedByEmail: text("updated_by_email").notNull(),
}, table => [
  uniqueIndex("erp_orders_business_order_no_uq").on(table.businessId, table.orderNo),
  index("erp_orders_business_updated_idx").on(table.businessId, table.updatedAt),
  index("erp_orders_business_status_idx").on(table.businessId, table.status),
]);

/** Immutable audit event. Database triggers write these atomically with orders. */
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
  updatedByUserId: text("updated_by_user_id").notNull(),
  updatedByEmail: text("updated_by_email").notNull(),
}, table => [
  uniqueIndex("erp_preferences_business_key_uq").on(table.businessId, table.key),
]);

/**
 * Authoritative user ↔ business ↔ role membership. Authentication is independent
 * of membership so one person can belong to several businesses with different
 * permissions.
 */
export const erpMemberships = sqliteTable("erp_memberships", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  userId: text("user_id"),
  email: text("email").notNull(),
  displayName: text("display_name"),
  role: text("role").notNull(),
  modulesJson: text("modules_json"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  createdByEmail: text("created_by_email").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedByEmail: text("updated_by_email").notNull(),
}, table => [
  uniqueIndex("erp_memberships_business_email_uq").on(table.businessId, table.email),
  index("erp_memberships_email_idx").on(table.email, table.active),
  index("erp_memberships_business_role_idx").on(table.businessId, table.role, table.active),
]);

/** First-party ERP identity and credential record. */
export const erpUsers = sqliteTable("erp_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  phoneE164: text("phone_e164"),
  displayName: text("display_name"),
  passwordHash: text("password_hash"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  passwordUpdatedAt: text("password_updated_at"),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull(),
  createdByEmail: text("created_by_email").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedByEmail: text("updated_by_email").notNull(),
}, table => [
  uniqueIndex("erp_users_email_uq").on(table.email),
  uniqueIndex("erp_users_phone_uq").on(table.phoneE164),
]);

/** Server-side session. Only a SHA-256 hash of the browser token is stored. */
export const erpSessions = sqliteTable("erp_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  userAgent: text("user_agent"),
}, table => [
  uniqueIndex("erp_sessions_token_uq").on(table.tokenHash),
  index("erp_sessions_user_active_idx").on(table.userId, table.revokedAt, table.expiresAt),
]);

/** Security/audit events used for login throttling and account history. */
export const erpAuthEvents = sqliteTable("erp_auth_events", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  email: text("email"),
  identifierHash: text("identifier_hash").notNull(),
  ipHash: text("ip_hash").notNull(),
  event: text("event").notNull(),
  success: integer("success", { mode: "boolean" }).notNull().default(false),
  at: text("at").notNull(),
  detailsJson: text("details_json"),
}, table => [
  index("erp_auth_events_identifier_idx").on(table.identifierHash, table.at),
  index("erp_auth_events_ip_idx").on(table.ipHash, table.at),
  index("erp_auth_events_user_idx").on(table.userId, table.at),
]);

/** Stable external identities linked to an ERP user. Provider passwords/tokens are never stored. */
export const erpAuthIdentities = sqliteTable("erp_auth_identities", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  providerSubject: text("provider_subject").notNull(),
  emailAtLink: text("email_at_link"),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
}, table => [
  uniqueIndex("erp_auth_identities_provider_subject_uq").on(table.provider, table.providerSubject),
  uniqueIndex("erp_auth_identities_user_provider_uq").on(table.userId, table.provider),
  index("erp_auth_identities_user_idx").on(table.userId),
]);

/** Short-lived, one-use OAuth and WebAuthn challenges. */
export const erpAuthChallenges = sqliteTable("erp_auth_challenges", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  provider: text("provider"),
  userId: text("user_id"),
  nonce: text("nonce"),
  verifier: text("verifier"),
  rpId: text("rp_id"),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
}, table => [
  index("erp_auth_challenges_exp_idx").on(table.expiresAt, table.usedAt),
]);

/** Discoverable WebAuthn credentials. Only the public key and authenticator counter are stored. */
export const erpPasskeys = sqliteTable("erp_passkeys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  credentialId: text("credential_id").notNull(),
  publicKeyJwk: text("public_key_jwk").notNull(),
  signCount: integer("sign_count").notNull().default(0),
  label: text("label"),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
}, table => [
  uniqueIndex("erp_passkeys_credential_uq").on(table.credentialId),
  index("erp_passkeys_user_idx").on(table.userId),
]);
