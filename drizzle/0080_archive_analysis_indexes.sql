ALTER TABLE "archive_read_plays" ADD COLUMN "title" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Populate only the derived scalar column; source JSONB and old payloads stay intact.
UPDATE "archive_read_plays" SET "title" = coalesce("payload"->>'title', '');--> statement-breakpoint
CREATE INDEX "archive_read_play_counted_uid_idx" ON "archive_read_plays" USING btree ("generation_id","osu_id","game_id","team_id") WHERE "archive_read_plays"."raw_score" >= 2000;--> statement-breakpoint
CREATE INDEX "archive_read_play_counted_team_idx" ON "archive_read_plays" USING btree ("generation_id","team_id","game_id") WHERE "archive_read_plays"."raw_score" >= 2000;
