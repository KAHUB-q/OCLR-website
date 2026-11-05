CREATE TABLE "historical_statistics_sources" (
	"edition_slug" text NOT NULL,
	"mp_id" bigint NOT NULL,
	"source_hash" text NOT NULL,
	CONSTRAINT "historical_statistics_sources_edition_slug_mp_id_pk" PRIMARY KEY("edition_slug","mp_id"),
	CONSTRAINT "historical_statistics_source_hash" CHECK ("historical_statistics_sources"."source_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "archive_read_versions" ADD COLUMN "statistics_manifest_hash" text;--> statement-breakpoint
ALTER TABLE "archive_read_versions" ADD COLUMN "statistics_score_policy" text;--> statement-breakpoint
ALTER TABLE "archive_read_versions" ADD COLUMN "ez_score_multiplier" double precision;--> statement-breakpoint
ALTER TABLE "archive_read_versions" ADD COLUMN "public_statistics" jsonb;--> statement-breakpoint
ALTER TABLE "historical_statistics_sources" ADD CONSTRAINT "historical_statistics_sources_edition_slug_mp_id_historical_statistics_edition_slug_mp_id_fk" FOREIGN KEY ("edition_slug","mp_id") REFERENCES "public"."historical_statistics"("edition_slug","mp_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "archive_read_play_team_idx" ON "archive_read_plays" USING btree ("generation_id","team_id");--> statement-breakpoint
CREATE INDEX "archive_read_play_game_idx" ON "archive_read_plays" USING btree ("generation_id","game_id");
--> statement-breakpoint
-- This backfill changes no source JSONB, publication state or source version.
INSERT INTO public.historical_statistics_sources (edition_slug,mp_id,source_hash)
SELECT s.edition_slug,s.mp_id,encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') FROM public.historical_statistics s;
--> statement-breakpoint
CREATE FUNCTION public.refresh_historical_statistics_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.historical_statistics_sources(edition_slug,mp_id,source_hash)
  VALUES(NEW.edition_slug,NEW.mp_id,encode(sha256(convert_to(to_jsonb(NEW)::text,'UTF8')),'hex'))
  ON CONFLICT(edition_slug,mp_id) DO UPDATE SET source_hash=EXCLUDED.source_hash;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER historical_statistics_source_manifest AFTER INSERT OR UPDATE ON public.historical_statistics
FOR EACH ROW EXECUTE FUNCTION public.refresh_historical_statistics_source();
