CREATE INDEX `crawl_logs_status_started_at_idx` ON `crawl_logs` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `email_logs_status_sent_at_idx` ON `email_logs` (`status`,`sent_at`);--> statement-breakpoint
CREATE INDEX `email_logs_user_id_idx` ON `email_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `posts_date_idx` ON `posts` (`date`);