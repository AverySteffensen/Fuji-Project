CREATE TABLE `app_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`mfa_at` integer,
	`revoked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backup_rows` (
	`run_id` text NOT NULL,
	`kind` text NOT NULL,
	`row_id` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`run_id`, `kind`, `row_id`)
);
--> statement-breakpoint
CREATE TABLE `backup_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `health_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`ok` integer NOT NULL,
	`duration` integer NOT NULL,
	`message` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operation_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`at` text NOT NULL,
	`delivered_at` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request_index` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`number` text NOT NULL,
	`title` text NOT NULL,
	`supplier` text NOT NULL,
	`requester_id` text NOT NULL,
	`requester_name` text NOT NULL,
	`department` text NOT NULL,
	`status` text NOT NULL,
	`priority` integer NOT NULL,
	`sample` integer NOT NULL,
	`total` real NOT NULL,
	`has_order` integer NOT NULL,
	`submitted_day` text NOT NULL,
	`needed_by` text NOT NULL,
	`approved_day` text NOT NULL,
	`ordered_day` text NOT NULL,
	`expected_day` text NOT NULL,
	`received_day` text NOT NULL,
	`search_text` text NOT NULL,
	`review_roles` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `register_requester_date` ON `request_index` (`requester_id`,`submitted_day`);--> statement-breakpoint
CREATE INDEX `register_status_date` ON `request_index` (`status`,`submitted_day`);--> statement-breakpoint
CREATE INDEX `register_department_date` ON `request_index` (`department`,`submitted_day`);--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `security_factors` (
	`user_id` text PRIMARY KEY NOT NULL,
	`secret` text,
	`pending_secret` text,
	`pending_expires` integer,
	`enabled_at` integer,
	`last_counter` integer DEFAULT -1 NOT NULL,
	`recovery_hashes` text DEFAULT '[]' NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`blocked_until` integer DEFAULT 0 NOT NULL
);
