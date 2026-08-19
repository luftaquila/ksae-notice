CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`user_email` text NOT NULL,
	`target_year` integer NOT NULL,
	`amount` integer NOT NULL,
	`goods_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`method` text,
	`tid` text,
	`granted_from` text,
	`granted_to` text,
	`fail_reason` text,
	`cancel_reason` text,
	`approved_at` text,
	`cancelled_at` text,
	`raw_auth` text,
	`raw_approve` text,
	`raw_cancel` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_order_id_unique` ON `payments` (`order_id`);--> statement-breakpoint
CREATE INDEX `payments_user_created_idx` ON `payments` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payments_status_created_idx` ON `payments` (`status`,`created_at`);