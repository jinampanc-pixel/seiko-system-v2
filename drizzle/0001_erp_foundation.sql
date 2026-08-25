CREATE TABLE `erp_orders` (
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
CREATE UNIQUE INDEX `erp_orders_business_order_no_uq` ON `erp_orders` (`business_id`,`order_no`);
--> statement-breakpoint
CREATE INDEX `erp_orders_business_updated_idx` ON `erp_orders` (`business_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `erp_orders_business_status_idx` ON `erp_orders` (`business_id`,`status`);
--> statement-breakpoint
CREATE TABLE `erp_audit_events` (
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
CREATE INDEX `erp_audit_entity_idx` ON `erp_audit_events` (`business_id`,`entity_type`,`entity_id`,`at`);
--> statement-breakpoint
CREATE INDEX `erp_audit_actor_idx` ON `erp_audit_events` (`business_id`,`actor_email`,`at`);
--> statement-breakpoint
CREATE TRIGGER `erp_orders_audit_insert`
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
CREATE TRIGGER `erp_orders_audit_update`
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
CREATE TABLE `erp_preferences` (
  `business_id` text NOT NULL,
  `key` text NOT NULL,
  `value_json` text NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by_user_id` text NOT NULL,
  `updated_by_email` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `erp_preferences_business_key_uq` ON `erp_preferences` (`business_id`,`key`);
