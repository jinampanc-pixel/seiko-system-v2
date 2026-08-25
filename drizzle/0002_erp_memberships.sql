CREATE TABLE `erp_memberships` (
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
CREATE UNIQUE INDEX `erp_memberships_business_email_uq` ON `erp_memberships` (`business_id`,`email`);
--> statement-breakpoint
CREATE INDEX `erp_memberships_email_idx` ON `erp_memberships` (`email`,`active`);
--> statement-breakpoint
CREATE INDEX `erp_memberships_business_role_idx` ON `erp_memberships` (`business_id`,`role`,`active`);
