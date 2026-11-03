ALTER TABLE "mappool_candidates" ADD COLUMN "skillset_tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "mappool_candidates" ADD COLUMN "skillset_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "mappool_candidates" ADD CONSTRAINT "candidate_skillset_version_valid" CHECK ("mappool_candidates"."skillset_version" > 0);