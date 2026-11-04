ALTER TYPE "public"."stage_kind" ADD VALUE 'exhibition';--> statement-breakpoint
ALTER TABLE "mappool_entries" ADD COLUMN "source" jsonb;