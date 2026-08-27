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