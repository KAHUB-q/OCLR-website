CREATE TABLE "archive_read_decisions" (
	"generation_id" uuid NOT NULL,
	"mp_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"position" integer NOT NULL,
	"decision" text NOT NULL,
	"game_id" bigint NOT NULL,
	"osu_id" bigint,
	"reason" text,
	"payload" jsonb NOT NULL,
	CONSTRAINT "archive_read_decisions_generation_id_mp_id_kind_position_pk" PRIMARY KEY("generation_id","mp_id","kind","position")
);
--> statement-breakpoint
CREATE TABLE "archive_read_games" (
	"generation_id" uuid NOT NULL,
	"mp_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"position" integer NOT NULL,
	"game_id" bigint NOT NULL,
	"beatmap_id" bigint,
	"included" boolean NOT NULL,
	"scoring_type" text,
	"start_time" text,
	"end_time" text,
	"mode" text,
	"team_type" text,
	"mods" text[] NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "archive_read_games_generation_id_mp_id_kind_position_pk" PRIMARY KEY("generation_id","mp_id","kind","position")
);
--> statement-breakpoint
CREATE TABLE "archive_read_maps" (
	"generation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"pool_id" text NOT NULL,
	"slot" text NOT NULL,
	"beatmap_id" bigint,
	"title" text,
	"mapper" text,
	"stars" double precision,
	"bpm" double precision,
	"drain_seconds" double precision,
	"cs" double precision,
	"ar" double precision,
	"od" double precision,
	"payload" jsonb NOT NULL,
	CONSTRAINT "archive_read_maps_generation_id_position_pk" PRIMARY KEY("generation_id","position"),
	CONSTRAINT "archive_read_map_slot" UNIQUE("generation_id","pool_id","slot")
);
--> statement-breakpoint
CREATE TABLE "archive_read_matches" (
	"generation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"fixture_id" text NOT NULL,
	"stage" text NOT NULL,
	"phase" text,
	"round_index" integer,
	"team_a" text NOT NULL,
	"team_b" text NOT NULL,
	"scheduled_at" text,
	"recorded" boolean NOT NULL,
	"label" text NOT NULL,
	"score_a" integer,
	"score_b" integer,
	"forfeit_winner" integer,
	"adjudication" text,
	"payload" jsonb NOT NULL,
	CONSTRAINT "archive_read_matches_generation_id_position_pk" PRIMARY KEY("generation_id","position"),
	CONSTRAINT "archive_read_fixture_key" UNIQUE("generation_id","fixture_id")
);
--> statement-breakpoint
CREATE TABLE "archive_read_mps" (
	"generation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"fixture_id" text NOT NULL,
	"mp_id" bigint NOT NULL,
	"url" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "archive_read_mps_generation_id_position_pk" PRIMARY KEY("generation_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_read_people" (
	"generation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"source_position" integer NOT NULL,
	"person_position" integer NOT NULL,
	"osu_id" bigint,
	"username" text NOT NULL,
	"team_id" text,
	"role" text NOT NULL,
	"tier" integer,
	"payload" jsonb NOT NULL,
	CONSTRAINT "archive_read_people_generation_id_position_pk" PRIMARY KEY("generation_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_read_picks" (
	"generation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"round" integer NOT NULL,
	"pick" integer NOT NULL,
	"team_id" text,
	"osu_id" bigint,
	"payload" jsonb NOT NULL,
	CONSTRAINT "archive_read_picks_generation_id_position_pk" PRIMARY KEY("generation_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_read_placements" (
	"generation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"team_id" text,
	"scope" text NOT NULL,
	"placement_start" integer,
	"placement_end" integer,
	"rank" integer,
	"wins" integer,
	"losses" integer,
	"maps_won" integer,
	"maps_lost" integer,
	"tied" boolean,
	"qualified" boolean,
	"official" boolean,
	"payload" jsonb NOT NULL,
	CONSTRAINT "archive_read_placements_generation_id_position_pk" PRIMARY KEY("generation_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_read_plays" (
	"generation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"fixture_id" text NOT NULL,
	"mp_id" bigint NOT NULL,
	"game_id" bigint NOT NULL,
	"osu_id" bigint,
	"team_id" text,
	"stage" text NOT NULL,
	"slot" text NOT NULL,
	"beatmap_id" bigint,
	"score" bigint NOT NULL,
	"raw_score" bigint NOT NULL,
	"score_multiplier" double precision NOT NULL,
	"played_at" text NOT NULL,
	"scoring_type" text NOT NULL,
	"winner_team_id" text,
	"accuracy" double precision,
	"combo" bigint,
	"passed" boolean,
	"relative" double precision,
	"mods" text[] NOT NULL,
	"hit_great" bigint,
	"hit_ok" bigint,
	"hit_meh" bigint,
	"hit_miss" bigint,
	"payload" jsonb NOT NULL,
	CONSTRAINT "archive_read_plays_generation_id_position_pk" PRIMARY KEY("generation_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_read_pools" (
	"generation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"pool_id" text NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "archive_read_pools_generation_id_position_pk" PRIMARY KEY("generation_id","position"),
	CONSTRAINT "archive_read_pool_key" UNIQUE("generation_id","pool_id")
);
--> statement-breakpoint
CREATE TABLE "archive_read_scores" (
	"generation_id" uuid NOT NULL,
	"mp_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"game_position" integer NOT NULL,
	"position" integer NOT NULL,
	"osu_id" bigint,
	"total" bigint,
	"accuracy" double precision,
	"combo" bigint,
	"passed" boolean,
	"raw_team" text,
	"mods" text[] NOT NULL,
	"hit_great" bigint,
	"hit_ok" bigint,
	"hit_meh" bigint,
	"hit_miss" bigint,
	"payload" jsonb NOT NULL,
	CONSTRAINT "archive_read_scores_generation_id_mp_id_kind_game_position_position_pk" PRIMARY KEY("generation_id","mp_id","kind","game_position","position")
);
--> statement-breakpoint
CREATE TABLE "archive_read_snapshots" (
	"generation_id" uuid NOT NULL,
	"mp_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"fixture_id" text NOT NULL,
	"row_version" integer NOT NULL,
	"snapshot_hash" text NOT NULL,
	"archive_key" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"pool_id" text NOT NULL,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	"reviewed_by" bigint,
	"reviewed_at" text,
	"adjudication" text,
	"payload" jsonb NOT NULL,
	CONSTRAINT "archive_read_snapshots_generation_id_mp_id_kind_pk" PRIMARY KEY("generation_id","mp_id","kind")
);
--> statement-breakpoint
CREATE TABLE "archive_read_teams" (
	"generation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"team_key" text NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "archive_read_teams_generation_id_position_pk" PRIMARY KEY("generation_id","position"),
	CONSTRAINT "archive_read_team_key" UNIQUE("generation_id","team_key")
);
--> statement-breakpoint
CREATE TABLE "archive_read_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_slug" text NOT NULL,
	"configuration_version" integer NOT NULL,
	"archive_hash" text NOT NULL,
	"source_hash" text NOT NULL,
	"projector_version" integer NOT NULL,
	"header" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "archive_read_version_positive" CHECK ("archive_read_versions"."configuration_version" >= 0 AND "archive_read_versions"."projector_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "historical_statistics_revisions" (
	"edition_slug" text NOT NULL,
	"mp_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"fixture_id" text NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"published_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "historical_statistics_revisions_edition_slug_mp_id_version_content_hash_pk" PRIMARY KEY("edition_slug","mp_id","version","content_hash")
);
--> statement-breakpoint
ALTER TABLE "archive_read_decisions" ADD CONSTRAINT "archive_read_decisions_generation_id_archive_read_versions_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."archive_read_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_decisions" ADD CONSTRAINT "archive_read_decisions_generation_id_mp_id_kind_archive_read_snapshots_generation_id_mp_id_kind_fk" FOREIGN KEY ("generation_id","mp_id","kind") REFERENCES "public"."archive_read_snapshots"("generation_id","mp_id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_games" ADD CONSTRAINT "archive_read_games_generation_id_archive_read_versions_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."archive_read_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_games" ADD CONSTRAINT "archive_read_games_generation_id_mp_id_kind_archive_read_snapshots_generation_id_mp_id_kind_fk" FOREIGN KEY ("generation_id","mp_id","kind") REFERENCES "public"."archive_read_snapshots"("generation_id","mp_id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_maps" ADD CONSTRAINT "archive_read_maps_generation_id_archive_read_versions_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."archive_read_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_maps" ADD CONSTRAINT "archive_read_maps_generation_id_pool_id_archive_read_pools_generation_id_pool_id_fk" FOREIGN KEY ("generation_id","pool_id") REFERENCES "public"."archive_read_pools"("generation_id","pool_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_matches" ADD CONSTRAINT "archive_read_matches_generation_id_archive_read_versions_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."archive_read_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_mps" ADD CONSTRAINT "archive_read_mps_generation_id_archive_read_versions_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."archive_read_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_mps" ADD CONSTRAINT "archive_read_mps_generation_id_fixture_id_archive_read_matches_generation_id_fixture_id_fk" FOREIGN KEY ("generation_id","fixture_id") REFERENCES "public"."archive_read_matches"("generation_id","fixture_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_people" ADD CONSTRAINT "archive_read_people_generation_id_archive_read_versions_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."archive_read_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_picks" ADD CONSTRAINT "archive_read_picks_generation_id_archive_read_versions_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."archive_read_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_placements" ADD CONSTRAINT "archive_read_placements_generation_id_archive_read_versions_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."archive_read_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_plays" ADD CONSTRAINT "archive_read_plays_generation_id_archive_read_versions_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."archive_read_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_pools" ADD CONSTRAINT "archive_read_pools_generation_id_archive_read_versions_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."archive_read_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_scores" ADD CONSTRAINT "archive_read_scores_generation_id_archive_read_versions_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."archive_read_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_scores" ADD CONSTRAINT "archive_read_scores_generation_id_mp_id_kind_game_position_archive_read_games_generation_id_mp_id_kind_position_fk" FOREIGN KEY ("generation_id","mp_id","kind","game_position") REFERENCES "public"."archive_read_games"("generation_id","mp_id","kind","position") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_snapshots" ADD CONSTRAINT "archive_read_snapshots_generation_id_archive_read_versions_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."archive_read_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_teams" ADD CONSTRAINT "archive_read_teams_generation_id_archive_read_versions_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."archive_read_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_read_versions" ADD CONSTRAINT "archive_read_versions_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_statistics_revisions" ADD CONSTRAINT "historical_statistics_revisions_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "archive_read_map_bid_idx" ON "archive_read_maps" USING btree ("beatmap_id","generation_id");--> statement-breakpoint
CREATE INDEX "archive_read_match_stage_idx" ON "archive_read_matches" USING btree ("generation_id","stage");--> statement-breakpoint
CREATE INDEX "archive_read_mp_idx" ON "archive_read_mps" USING btree ("mp_id","generation_id");--> statement-breakpoint
CREATE INDEX "archive_read_person_uid_idx" ON "archive_read_people" USING btree ("osu_id","generation_id");--> statement-breakpoint
CREATE INDEX "archive_read_person_team_idx" ON "archive_read_people" USING btree ("generation_id","team_id");--> statement-breakpoint
CREATE INDEX "archive_read_play_uid_idx" ON "archive_read_plays" USING btree ("generation_id","osu_id");--> statement-breakpoint
CREATE INDEX "archive_read_play_scope_idx" ON "archive_read_plays" USING btree ("generation_id","fixture_id","stage","team_id");--> statement-breakpoint
CREATE INDEX "archive_read_play_map_idx" ON "archive_read_plays" USING btree ("generation_id","beatmap_id");--> statement-breakpoint
CREATE INDEX "archive_read_score_uid_idx" ON "archive_read_scores" USING btree ("osu_id","generation_id");--> statement-breakpoint
CREATE INDEX "archive_read_current_idx" ON "archive_read_versions" USING btree ("edition_slug","configuration_version","projector_version","source_hash");--> statement-breakpoint
-- Preserve the exact current JSONB before any operator correction. Hashes only
-- deduplicate identical saved rows; they never authorize a publication.
INSERT INTO public.historical_statistics_revisions (edition_slug, mp_id, version, content_hash, fixture_id, draft, published, published_at, source_updated_at)
SELECT s.edition_slug, s.mp_id, s.version, encode(sha256(convert_to(to_jsonb(s)::text, 'UTF8')), 'hex'), s.fixture_id, s.draft, s.published, s.published_at, s.updated_at
FROM public.historical_statistics s ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION public.retain_historical_statistics_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    INSERT INTO public.historical_statistics_revisions (edition_slug, mp_id, version, content_hash, fixture_id, draft, published, published_at, source_updated_at)
    VALUES (OLD.edition_slug, OLD.mp_id, OLD.version, encode(sha256(convert_to(to_jsonb(OLD)::text, 'UTF8')), 'hex'), OLD.fixture_id, OLD.draft, OLD.published, OLD.published_at, OLD.updated_at)
    ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    INSERT INTO public.historical_statistics_revisions (edition_slug, mp_id, version, content_hash, fixture_id, draft, published, published_at, source_updated_at)
    VALUES (NEW.edition_slug, NEW.mp_id, NEW.version, encode(sha256(convert_to(to_jsonb(NEW)::text, 'UTF8')), 'hex'), NEW.fixture_id, NEW.draft, NEW.published, NEW.published_at, NEW.updated_at)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER historical_statistics_revision_history AFTER INSERT OR UPDATE OR DELETE ON public.historical_statistics
FOR EACH ROW EXECUTE FUNCTION public.retain_historical_statistics_revision();

--> statement-breakpoint
CREATE FUNCTION public.protect_historical_statistics_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Historical statistics revisions are immutable' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER historical_statistics_revision_immutable BEFORE UPDATE OR DELETE ON public.historical_statistics_revisions
FOR EACH ROW EXECUTE FUNCTION public.protect_historical_statistics_revision();
