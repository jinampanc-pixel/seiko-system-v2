-- Adopt existing tables without deleting or replacing data.
CREATE TABLE IF NOT EXISTS `erp_orders` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `order_no` text NOT NULL,
  `status` text NOT NULL,
  `archived` integer DEFAULT false NOT NULL,
  `document_json` text NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `created_by_user_id` text NOT NULL,
  `created_by_email` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by_user_id` text NOT NULL,
  `updated_by_email` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `erp_orders_business_order_no_uq` ON `erp_orders` (`business_id`,`order_no`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `erp_orders_business_updated_idx` ON `erp_orders` (`business_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `erp_orders_business_status_idx` ON `erp_orders` (`business_id`,`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `erp_audit_events` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `action` text NOT NULL,
  `version` integer NOT NULL,
  `actor_user_id` text NOT NULL,
  `actor_email` text NOT NULL,
  `at` text NOT NULL,
  `snapshot_json` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `erp_audit_entity_idx` ON `erp_audit_events` (`business_id`,`entity_type`,`entity_id`,`at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `erp_audit_actor_idx` ON `erp_audit_events` (`business_id`,`actor_email`,`at`);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `erp_orders_audit_insert`
AFTER INSERT ON `erp_orders`
BEGIN
  INSERT INTO `erp_audit_events` (
    `id`,`business_id`,`entity_type`,`entity_id`,`action`,`version`,
    `actor_user_id`,`actor_email`,`at`,`snapshot_json`
  ) VALUES (
    lower(hex(randomblob(16))), NEW.`business_id`, 'order', NEW.`id`, 'created', NEW.`version`,
    NEW.`updated_by_user_id`, NEW.`updated_by_email`, NEW.`updated_at`, NEW.`document_json`
  );
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `erp_orders_audit_update`
AFTER UPDATE ON `erp_orders`
BEGIN
  INSERT INTO `erp_audit_events` (
    `id`,`business_id`,`entity_type`,`entity_id`,`action`,`version`,
    `actor_user_id`,`actor_email`,`at`,`snapshot_json`
  ) VALUES (
    lower(hex(randomblob(16))), NEW.`business_id`, 'order', NEW.`id`, 'updated', NEW.`version`,
    NEW.`updated_by_user_id`, NEW.`updated_by_email`, NEW.`updated_at`, NEW.`document_json`
  );
END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `erp_preferences` (
  `business_id` text NOT NULL,
  `key` text NOT NULL,
  `value_json` text NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by_user_id` text NOT NULL,
  `updated_by_email` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `erp_preferences_business_key_uq` ON `erp_preferences` (`business_id`,`key`);

CREATE TABLE IF NOT EXISTS `erp_memberships` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `user_id` text,
  `email` text NOT NULL,
  `display_name` text,
  `role` text NOT NULL,
  `modules_json` text,
  `active` integer DEFAULT true NOT NULL,
  `created_at` text NOT NULL,
  `created_by_email` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by_email` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `erp_memberships_business_email_uq` ON `erp_memberships` (`business_id`,`email`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `erp_memberships_email_idx` ON `erp_memberships` (`email`,`active`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `erp_memberships_business_role_idx` ON `erp_memberships` (`business_id`,`role`,`active`);

CREATE TABLE IF NOT EXISTS `erp_users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `phone_e164` text,
  `display_name` text,
  `password_hash` text,
  `must_change_password` integer DEFAULT true NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `password_updated_at` text,
  `last_login_at` text,
  `created_at` text NOT NULL,
  `created_by_email` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by_email` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `erp_users_email_uq` ON `erp_users` (`email`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `erp_users_phone_uq` ON `erp_users` (`phone_e164`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `erp_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `token_hash` text NOT NULL,
  `created_at` text NOT NULL,
  `last_seen_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `revoked_at` text,
  `user_agent` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `erp_sessions_token_uq` ON `erp_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `erp_sessions_user_active_idx` ON `erp_sessions` (`user_id`,`revoked_at`,`expires_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `erp_auth_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text,
  `email` text,
  `identifier_hash` text NOT NULL,
  `ip_hash` text NOT NULL,
  `event` text NOT NULL,
  `success` integer DEFAULT false NOT NULL,
  `at` text NOT NULL,
  `details_json` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `erp_auth_events_identifier_idx` ON `erp_auth_events` (`identifier_hash`,`at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `erp_auth_events_ip_idx` ON `erp_auth_events` (`ip_hash`,`at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `erp_auth_events_user_idx` ON `erp_auth_events` (`user_id`,`at`);

CREATE TABLE IF NOT EXISTS `erp_auth_identities` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `provider` text NOT NULL,
  `provider_subject` text NOT NULL,
  `email_at_link` text,
  `created_at` text NOT NULL,
  `last_used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `erp_auth_identities_provider_subject_uq` ON `erp_auth_identities` (`provider`,`provider_subject`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `erp_auth_identities_user_provider_uq` ON `erp_auth_identities` (`user_id`,`provider`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `erp_auth_identities_user_idx` ON `erp_auth_identities` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `erp_auth_challenges` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `provider` text,
  `user_id` text,
  `nonce` text,
  `verifier` text,
  `rp_id` text,
  `expires_at` text NOT NULL,
  `used_at` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `erp_auth_challenges_exp_idx` ON `erp_auth_challenges` (`expires_at`,`used_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `erp_passkeys` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `credential_id` text NOT NULL,
  `public_key_jwk` text NOT NULL,
  `sign_count` integer DEFAULT 0 NOT NULL,
  `label` text,
  `created_at` text NOT NULL,
  `last_used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `erp_passkeys_credential_uq` ON `erp_passkeys` (`credential_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `erp_passkeys_user_idx` ON `erp_passkeys` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS jinam_meth_fulfilment_settings (
    id TEXT PRIMARY KEY,
    default_policy TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    updated_by_email TEXT NOT NULL
  );

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS jinam_meth_finished_stock (
    meth_sku TEXT PRIMARY KEY,
    on_hand INTEGER NOT NULL DEFAULT 0,
    reserved INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    updated_by_email TEXT NOT NULL
  );

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS jinam_meth_order_routing_claims (
    claim_id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS jinam_meth_order_routing_order_idx ON jinam_meth_order_routing_claims(order_id,updated_at);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS jinam_shared_changes (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    version INTEGER NOT NULL,
    action TEXT NOT NULL,
    at TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    snapshot_json TEXT NOT NULL
  );

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS jinam_shared_changes_scope_idx ON jinam_shared_changes(scope,collection,sequence);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS jinam_shared_changes_entity_idx ON jinam_shared_changes(scope,collection,id,sequence);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS jinam_shared_records (
    scope TEXT NOT NULL,
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    document_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    updated_by_email TEXT NOT NULL,
    PRIMARY KEY (scope, collection, id)
  );

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS jinam_shared_records_updated_idx ON jinam_shared_records(scope,collection,updated_at);

--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS jinam_shared_records_insert_audit
    AFTER INSERT ON jinam_shared_records
    BEGIN
      INSERT INTO jinam_shared_changes (scope,collection,id,version,action,at,actor_user_id,actor_email,snapshot_json)
      VALUES (NEW.scope,NEW.collection,NEW.id,NEW.version,'created',NEW.updated_at,NEW.updated_by_user_id,NEW.updated_by_email,NEW.document_json);
    END;

--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS jinam_shared_records_update_audit
    AFTER UPDATE OF document_json, version ON jinam_shared_records
    BEGIN
      INSERT INTO jinam_shared_changes (scope,collection,id,version,action,at,actor_user_id,actor_email,snapshot_json)
      VALUES (NEW.scope,NEW.collection,NEW.id,NEW.version,'updated',NEW.updated_at,NEW.updated_by_user_id,NEW.updated_by_email,NEW.document_json);
    END;

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS erp_platform_roles (
    user_email TEXT PRIMARY KEY NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS jinam_channel_oauth_states (
      state TEXT PRIMARY KEY NOT NULL,
      provider TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      shop_domain TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS jinam_channel_oauth_states_exp_idx ON jinam_channel_oauth_states(provider,expires_at,used_at);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS jinam_connector_secrets (
      credential_ref TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      created_at TEXT NOT NULL,
      rotated_at TEXT
    );

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS jinam_channel_events (
      provider TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      external_event_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      received_at TEXT NOT NULL,
      payload_fingerprint TEXT NOT NULL,
      PRIMARY KEY (provider, connection_id, external_event_id)
    );

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS jinam_channel_event_inbox (
      provider TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      external_event_id TEXT NOT NULL,
      external_action_id TEXT NOT NULL,
      shop_domain TEXT NOT NULL,
      topic TEXT NOT NULL,
      received_at TEXT NOT NULL,
      payload_fingerprint TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      processing_status TEXT NOT NULL,
      processed_at TEXT,
      processing_error TEXT,
      PRIMARY KEY (provider, connection_id, external_event_id)
    );

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS jinam_channel_event_inbox_pending_idx ON jinam_channel_event_inbox(processing_status,received_at);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS seiko_billing_documents (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL, total_paise INTEGER NOT NULL, cancelled INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS seiko_billing_payments (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, invoice_id TEXT NOT NULL, amount_paise INTEGER NOT NULL, data TEXT NOT NULL, created_by TEXT NOT NULL);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS seiko_clients (id TEXT PRIMARY KEY, name_key TEXT NOT NULL, phone_key TEXT NOT NULL, email_key TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, created_by TEXT NOT NULL, updated_by TEXT NOT NULL);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS seiko_billing_payment_invoice ON seiko_billing_payments(invoice_id);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS seiko_clients_lookup ON seiko_clients(name_key,phone_key,email_key);
