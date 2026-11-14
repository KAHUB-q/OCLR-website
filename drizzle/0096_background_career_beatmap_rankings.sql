CREATE TABLE "ranking_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"source_hash" text NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" jsonb NOT NULL,
	CONSTRAINT "ranking_snapshots_kind" CHECK ("ranking_snapshots"."kind" IN ('career', 'beatmap')),
	CONSTRAINT "ranking_snapshots_hash" CHECK ("ranking_snapshots"."source_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "ranking_snapshots_result" CHECK (jsonb_typeof("ranking_snapshots"."result") = 'object')
);
--> statement-breakpoint
CREATE INDEX "ranking_snapshots_source_idx" ON "ranking_snapshots" USING btree ("kind","source_hash","calculated_at");
--> statement-breakpoint
CREATE TRIGGER protect_ranking_snapshots BEFORE UPDATE OR DELETE ON ranking_snapshots
  FOR EACH ROW EXECUTE FUNCTION protect_archive_relation();
