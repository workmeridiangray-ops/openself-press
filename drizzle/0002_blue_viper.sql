CREATE TABLE `auth_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `author_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`verified_at` text,
	`auth_version` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `author_accounts_member_id_unique` ON `author_accounts` (`member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `author_accounts_email_unique` ON `author_accounts` (`email`);--> statement-breakpoint
CREATE TABLE `author_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`auth_version` integer NOT NULL,
	`expires` integer NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `author_sessions_account` ON `author_sessions` (`account_id`);--> statement-breakpoint
CREATE TABLE `author_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`purpose` text NOT NULL,
	`auth_version` integer NOT NULL,
	`expires` integer NOT NULL,
	`consumed` text,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `author_tokens_account` ON `author_tokens` (`account_id`);