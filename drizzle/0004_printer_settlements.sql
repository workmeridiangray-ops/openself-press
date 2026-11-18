CREATE TABLE `finance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`event` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `finance_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`payment_id` text NOT NULL,
	`request` text NOT NULL,
	`state` text NOT NULL,
	`provider_id` text,
	`last_error` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_refunds_provider_id_unique` ON `payment_refunds` (`provider_id`);--> statement-breakpoint
CREATE TABLE `printer_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`request` text NOT NULL,
	`state` text NOT NULL,
	`provider_id` text,
	`utr` text,
	`fee_paise` integer DEFAULT 0 NOT NULL,
	`tax_paise` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `printer_attempts_provider_id_unique` ON `printer_attempts` (`provider_id`);--> statement-breakpoint
CREATE TABLE `printer_batch_items` (
	`order_id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`invoice` text NOT NULL,
	`revision` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `printer_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`manifest` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`state` text NOT NULL,
	`approved_by` text,
	`attempt_id` text,
	`acknowledged` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `printer_batches_day_unique` ON `printer_batches` (`day`);--> statement-breakpoint
CREATE TABLE `printer_charges` (
	`order_id` text PRIMARY KEY NOT NULL,
	`remote_id` integer NOT NULL,
	`revision` integer NOT NULL,
	`invoice` text NOT NULL,
	`payload` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`state` text DEFAULT 'Review' NOT NULL,
	`confirmed_at` text NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`batch_id` text,
	`last_error` text DEFAULT '' NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `printer_credits` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`order_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`state` text NOT NULL,
	`batch_id` text,
	`reason` text NOT NULL,
	`approved_by` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `printer_credits_reference_unique` ON `printer_credits` (`reference`);