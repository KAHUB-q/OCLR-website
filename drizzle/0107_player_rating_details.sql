ALTER TABLE "imported_player_ratings" ADD COLUMN "etx_mods" jsonb;--> statement-breakpoint
ALTER TABLE "imported_player_ratings" ADD COLUMN "imported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sip_rating_cache" ADD COLUMN "snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "sip_rating_cache" ADD COLUMN "not_found_at" timestamp with time zone;