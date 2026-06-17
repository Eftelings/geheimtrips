CREATE TABLE `authors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`handle` text NOT NULL,
	`bio` text DEFAULT '',
	`avatar_url` text,
	`avatar_color` text DEFAULT '#8A6FB3',
	`instagram` text,
	`tiktok` text,
	`website` text,
	`place_count` integer DEFAULT 0 NOT NULL,
	`saved_count` integer DEFAULT 0 NOT NULL,
	`avg_stars` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authors_handle_unique` ON `authors` (`handle`);--> statement-breakpoint
CREATE TABLE `friendships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`requester_id` integer NOT NULL,
	`addressee_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`addressee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `place_media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`place_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`url` text NOT NULL,
	`type` text DEFAULT 'photo' NOT NULL,
	`cc_confirmed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `places` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`region` text NOT NULL,
	`category` text NOT NULL,
	`category_label` text NOT NULL,
	`vibe_json` text DEFAULT '[]' NOT NULL,
	`distance_min` integer NOT NULL,
	`distance_label` text NOT NULL,
	`cost` integer NOT NULL,
	`cost_label` text NOT NULL,
	`rating` real DEFAULT 0 NOT NULL,
	`reviews` integer DEFAULT 0 NOT NULL,
	`saves` integer DEFAULT 0 NOT NULL,
	`match` integer DEFAULT 0 NOT NULL,
	`short` text NOT NULL,
	`long` text NOT NULL,
	`hero` text NOT NULL,
	`gallery_json` text DEFAULT '[]' NOT NULL,
	`tips_json` text DEFAULT '[]' NOT NULL,
	`attributes_json` text DEFAULT '{}' NOT NULL,
	`author_id` integer,
	`lat` real,
	`lng` real,
	`has_video` integer DEFAULT false,
	`is_user_submitted` integer DEFAULT false,
	`submitted_by` integer,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`place_id` text NOT NULL,
	`stars` integer NOT NULL,
	`mood` integer,
	`description_accurate` integer,
	`time_spent` text,
	`companions` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `saved_places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`place_id` text NOT NULL,
	`saved_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trip_overnights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`after_day_index` integer NOT NULL,
	`hotel_id` text,
	`hotel_name` text,
	`hotel_price` real,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trip_places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`place_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`day_index` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '',
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title` text NOT NULL,
	`subtitle` text DEFAULT '',
	`hero` text,
	`transport` text DEFAULT 'auto' NOT NULL,
	`start_date` text,
	`end_date` text,
	`persons` integer DEFAULT 1 NOT NULL,
	`is_curated` integer DEFAULT false,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`handle` text NOT NULL,
	`bio` text DEFAULT '',
	`avatar_url` text,
	`instagram` text,
	`tiktok` text,
	`website` text,
	`profile_visible` integer DEFAULT true,
	`notifications_enabled` integer DEFAULT true,
	`play_videos` integer DEFAULT true,
	`meet_people_enabled` integer DEFAULT false,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);--> statement-breakpoint
CREATE TABLE `visited_places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`place_id` text NOT NULL,
	`visited_at` text DEFAULT (datetime('now')),
	`gps_verified` integer DEFAULT false,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action
);
