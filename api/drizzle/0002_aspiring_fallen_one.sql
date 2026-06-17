CREATE TABLE `business_claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`place_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`business_name` text NOT NULL,
	`contact_email` text NOT NULL,
	`contact_website` text,
	`message` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`admin_note` text,
	`reviewed_at` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `business_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`company_name` text NOT NULL,
	`company_email` text NOT NULL,
	`company_website` text,
	`description` text,
	`is_verified` integer DEFAULT false,
	`verified_at` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_profiles_user_id_unique` ON `business_profiles` (`user_id`);--> statement-breakpoint
ALTER TABLE `places` ADD `business_profile_id` integer;--> statement-breakpoint
ALTER TABLE `places` ADD `is_officially_managed` integer DEFAULT false;