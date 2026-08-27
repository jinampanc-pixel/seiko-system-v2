CREATE TABLE `erp_users` (
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
CREATE UNIQUE INDEX `erp_users_email_uq` ON `erp_users` (`email`);
--> statement-breakpoint
CREATE UNIQUE INDEX `erp_users_phone_uq` ON `erp_users` (`phone_e164`);
--> statement-breakpoint
CREATE TABLE `erp_sessions` (
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
CREATE UNIQUE INDEX `erp_sessions_token_uq` ON `erp_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `erp_sessions_user_active_idx` ON `erp_sessions` (`user_id`,`revoked_at`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `erp_auth_events` (
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
CREATE INDEX `erp_auth_events_identifier_idx` ON `erp_auth_events` (`identifier_hash`,`at`);
--> statement-breakpoint
CREATE INDEX `erp_auth_events_ip_idx` ON `erp_auth_events` (`ip_hash`,`at`);
--> statement-breakpoint
CREATE INDEX `erp_auth_events_user_idx` ON `erp_auth_events` (`user_id`,`at`);
