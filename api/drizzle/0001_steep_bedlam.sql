CREATE TABLE `takedown_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reporter_name` text NOT NULL,
	`reporter_email` text NOT NULL,
	`place_id` text,
	`media_id` integer,
	`description` text NOT NULL,
	`infringing_url` text,
	`right_description` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_at` text,
	`admin_note` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `place_media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `users` ADD `is_admin` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `users` ADD `is_banned` integer DEFAULT false;