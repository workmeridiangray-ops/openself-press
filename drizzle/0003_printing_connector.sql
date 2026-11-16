CREATE TABLE `printing_jobs` (
	`order_id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'Queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_token` text DEFAULT '' NOT NULL,
	`remote_id` integer,
	`remote_revision` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `printing_jobs_due` ON `printing_jobs` (`state`,`next_attempt`,`lease_until`);--> statement-breakpoint
CREATE TABLE `printing_snapshots` (
	`order_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`created` text NOT NULL
);
