ALTER TABLE `users` ADD `subscription_expires_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `subscription_renewed_at` text;--> statement-breakpoint
UPDATE `users` SET
  `subscription_expires_at` = (SELECT MAX(`expires_at`) FROM `subscriptions` WHERE `user_id` = `users`.`id`),
  `subscription_renewed_at` = (SELECT MAX(`renewed_at`) FROM `subscriptions` WHERE `user_id` = `users`.`id`);--> statement-breakpoint
ALTER TABLE `subscriptions` DROP COLUMN `expires_at`;--> statement-breakpoint
ALTER TABLE `subscriptions` DROP COLUMN `renewed_at`;
