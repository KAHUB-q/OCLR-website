CREATE TABLE "archive_relation_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_slug" text NOT NULL,
	"document_key" text NOT NULL,
	"kind" text NOT NULL,
	"mp_id" bigint,
	"snapshot_kind" text,
	"content_hash" text NOT NULL,
	"codec_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "archive_relation_document_scope" UNIQUE("edition_slug","document_key","id"),
	CONSTRAINT "archive_relation_document_kind" CHECK ("archive_relation_documents"."kind" IN ('archive','statistics')),
	CONSTRAINT "archive_relation_document_source" CHECK (("archive_relation_documents"."kind"='archive' AND "archive_relation_documents"."mp_id" IS NULL AND "archive_relation_documents"."snapshot_kind" IS NULL) OR ("archive_relation_documents"."kind"='statistics' AND "archive_relation_documents"."mp_id" IS NOT NULL AND "archive_relation_documents"."snapshot_kind" IS NOT NULL AND "archive_relation_documents"."mp_id">0 AND "archive_relation_documents"."snapshot_kind" IN ('draft','published'))),
	CONSTRAINT "archive_relation_document_hash" CHECK ("archive_relation_documents"."content_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "archive_relation_heads" (
	"edition_slug" text NOT NULL,
	"document_key" text NOT NULL,
	"document_id" uuid NOT NULL,
	"source_hash" text NOT NULL,
	CONSTRAINT "archive_relation_heads_edition_slug_document_key_pk" PRIMARY KEY("edition_slug","document_key")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_format_version" double precision,
	"value_edition_slug" text,
	"value_source_url" text,
	"value_captured_on" text,
	"value_season_starts_at" text,
	"value_season_ends_at" text,
	"value_season_time_zone" text,
	"value_season_precision" text,
	"value_notes" text[],
	"value_draft_mode" text,
	CONSTRAINT "archive_rel_archive_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_order_key" UNIQUE("document_id","parent_id","position"),
	CONSTRAINT "archive_rel_archive_root" CHECK ("archive_rel_archive"."id"=0 AND "archive_rel_archive"."parent_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_final_placements" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_team_id" text,
	"value_placement_start" bigint,
	"value_placement_end" bigint,
	"value_tied" boolean,
	"value_qualified" boolean,
	"value_official" boolean,
	"value_note" text,
	"value_scope" text,
	"value_source" text,
	CONSTRAINT "archive_rel_archive_final_placements_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_final_placements_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_links" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_label" text,
	"value_url" text,
	CONSTRAINT "archive_rel_archive_links_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_links_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_matches" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_id" text,
	"value_label" text,
	"value_stage" text,
	"value_round_phase" text,
	"value_round_index" bigint,
	"value_format_best_of" bigint,
	"value_format_max_games" bigint,
	"value_format_wins_required" bigint,
	"value_time_zone" text,
	"value_adjudication_kind" text,
	"value_adjudication_note" text,
	"value_adjudication_evidence_url" text,
	"value_pool_id" text,
	"value_team_a" text,
	"value_team_b" text,
	"value_scheduled_at" text,
	"value_room_opened_at" text,
	"value_score" bigint[],
	"value_review_status" text,
	"value_review_approval_approved_on" text,
	"value_review_approval_approved_by" text,
	"value_review_approval_evidence_url" text,
	"value_review_approval_source" text,
	"value_review_working_score" bigint[],
	"value_review_raw_score" bigint[],
	"value_review_possible_score" bigint[],
	"value_review_note" text,
	"value_review_started_at" text,
	"value_review_red_team_id" text,
	"value_review_blue_team_id" text,
	"value_forfeit_winner" double precision,
	"value_mp_urls" text[],
	"value_vod_url" text,
	"value_referee" text,
	"value_streamer" text,
	"value_commentators" text,
	"value_bans_a" text,
	"value_bans_b" text,
	"value_source" text,
	CONSTRAINT "archive_rel_archive_matches_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_matches_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_matches_review_games" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_game_id" bigint,
	"value_beatmap_id" bigint,
	"value_pool_slot" text,
	"value_start_time" text,
	"value_end_time" text,
	"value_disposition" text,
	"value_totals_red" bigint,
	"value_totals_blue" bigint,
	"value_positive_players_red" bigint,
	"value_positive_players_blue" bigint,
	"value_team_fail_red" boolean,
	"value_team_fail_blue" boolean,
	"value_winning_color" text,
	"value_interpretation_status" text,
	CONSTRAINT "archive_rel_archive_matches_review_games_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_matches_review_games_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_picks" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_round" bigint,
	"value_pick" bigint,
	"value_team_id" text,
	"value_osu_id" bigint,
	"value_source" text,
	CONSTRAINT "archive_rel_archive_picks_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_picks_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_players" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_osu_id" bigint,
	"value_username" text,
	"value_team_id" text,
	"value_role" text,
	"value_source_role" text,
	"value_tier" bigint,
	"value_source" text,
	CONSTRAINT "archive_rel_archive_players_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_players_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_pools" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_id" text,
	"value_name" text,
	"value_source" text,
	CONSTRAINT "archive_rel_archive_pools_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_pools_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_pools_maps" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_slot" text,
	"value_beatmap_id" bigint,
	"value_difficulty_snapshot_beatmap_id" bigint,
	"value_difficulty_snapshot_ruleset" text,
	"value_difficulty_snapshot_checksum" text,
	"value_difficulty_snapshot_fetched_at" text,
	"value_difficulty_snapshot_base_stars" double precision,
	"value_difficulty_snapshot_base_bpm" double precision,
	"value_difficulty_snapshot_base_duration" double precision,
	"value_difficulty_snapshot_base_ar" double precision,
	"value_difficulty_snapshot_base_od" double precision,
	"value_difficulty_snapshot_base_cs" double precision,
	"value_difficulty_snapshot_base_hp" double precision,
	"value_original_id" bigint,
	"value_title" text,
	"value_mapper" text,
	"value_stars" double precision,
	"value_bpm" double precision,
	"value_drain_seconds" double precision,
	"value_cs" double precision,
	"value_ar" double precision,
	"value_od" double precision,
	"value_source" text,
	CONSTRAINT "archive_rel_archive_pools_maps_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_pools_maps_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_pools_maps_difficulty_snapsh_00b1b39990" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_item" double precision,
	CONSTRAINT "archive_rel_archive_pools_maps_difficulty_snapsh_ff0bb57ac4" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_pools_maps_difficulty_snapsh_5d746eba63" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_pools_maps_difficulty_snapshot_variants" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_configuration" text,
	"value_mods" text[],
	"value_ruleset" text,
	"value_stars" double precision,
	"value_max_combo" bigint,
	"value_fetched_at" text,
	CONSTRAINT "archive_rel_archive_pools_maps_difficulty_snapsh_41bbaa2a3a" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_pools_maps_difficulty_snapsh_201f1d6b5e" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_qualifiers" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_name" text,
	"value_pool_id" text,
	"value_source" text,
	CONSTRAINT "archive_rel_archive_qualifiers_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_qualifiers_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_qualifiers_records" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_username" text,
	"value_source" text,
	CONSTRAINT "archive_rel_archive_qualifiers_records_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_qualifiers_records_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_qualifiers_records_scores" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_slot" text,
	"value_score" bigint,
	CONSTRAINT "archive_rel_archive_qualifiers_records_scores_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_qualifiers_records_scores_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_review_tables" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_name" text,
	"value_note" text,
	CONSTRAINT "archive_rel_archive_review_tables_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_review_tables_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_review_tables_rows" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_team_id" text,
	"value_wins" bigint,
	"value_losses" bigint,
	"value_maps_won" bigint,
	"value_maps_lost" bigint,
	CONSTRAINT "archive_rel_archive_review_tables_rows_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_review_tables_rows_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_roster_replacements" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_id" text,
	"value_team_id" text,
	"value_tier" bigint,
	"value_replaced_at" text,
	"value_note" text,
	"value_source" text,
	CONSTRAINT "archive_rel_archive_roster_replacements_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_roster_replacements_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_roster_replacements_people" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_osu_id" bigint,
	"value_username" text,
	"value_source" text,
	CONSTRAINT "archive_rel_archive_roster_replacements_people_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_roster_replacements_people_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_source_facts" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_category" text,
	"value_label" text,
	"value_text" text,
	"value_source" text,
	CONSTRAINT "archive_rel_archive_source_facts_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_source_facts_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_staff" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_osu_id" bigint,
	"value_username" text,
	"value_position" text,
	"value_source" text,
	CONSTRAINT "archive_rel_archive_staff_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_staff_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_standings" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_group" text,
	"value_placement_start" bigint,
	"value_placement_end" bigint,
	"value_tied" boolean,
	"value_qualified" boolean,
	"value_official" boolean,
	"value_note" text,
	"value_scope" text,
	"value_team_id" text,
	"value_rank" bigint,
	"value_wins" bigint,
	"value_losses" bigint,
	"value_maps_won" bigint,
	"value_maps_lost" bigint,
	"value_source" text,
	CONSTRAINT "archive_rel_archive_standings_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_standings_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_teams" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_id" text,
	"value_name" text,
	"value_source" text,
	CONSTRAINT "archive_rel_archive_teams_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_teams_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_archive_unresolved_players" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_id" text,
	"value_username" text,
	"value_team_id" text,
	"value_role" text,
	"value_tier" bigint,
	"value_source_role" text,
	"value_source" text,
	CONSTRAINT "archive_rel_archive_unresolved_players_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_archive_unresolved_players_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_statistics" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_archive_key" text,
	"value_source_schema_version" double precision,
	"value_source_api_version" text,
	"value_source_fetched_at" text,
	"value_source_fingerprint" text,
	"value_source_match_id" bigint,
	"value_source_match_title" text,
	"value_source_match_start_time" text,
	"value_source_match_end_time" text,
	"value_source_first_event_id" bigint,
	"value_source_latest_event_id" bigint,
	"value_source_current_game_id" bigint,
	"value_source_pages" bigint,
	"value_source_complete" boolean,
	"value_source_warnings" text[],
	"value_pool_id" text,
	"value_included" bigint[],
	"value_allow_unlisted_maps" boolean,
	"value_roster_team_games" bigint[],
	"value_technical_adjudication" boolean,
	"value_adjudication_kind" text,
	"value_adjudication_note" text,
	"value_adjudication_evidence_url" text,
	"value_reviewed_by" bigint,
	"value_reviewed_at" text,
	"value_evidence_url" text,
	CONSTRAINT "archive_rel_statistics_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_statistics_order_key" UNIQUE("document_id","parent_id","position"),
	CONSTRAINT "archive_rel_statistics_root" CHECK ("archive_rel_statistics"."id"=0 AND "archive_rel_statistics"."parent_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "archive_rel_statistics_excluded_games" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_game_id" bigint,
	"value_reason" text,
	CONSTRAINT "archive_rel_statistics_excluded_games_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_statistics_excluded_games_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_statistics_excluded_scores" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_game_id" bigint,
	"value_osu_id" bigint,
	"value_reason" text,
	CONSTRAINT "archive_rel_statistics_excluded_scores_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_statistics_excluded_scores_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_statistics_source_events" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_id" bigint,
	"value_at" text,
	"value_type" text,
	"value_actor_osu_id" bigint,
	"value_game_id" bigint,
	CONSTRAINT "archive_rel_statistics_source_events_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_statistics_source_events_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_statistics_source_games" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_id" bigint,
	"value_beatmap_id" bigint,
	"value_start_time" text,
	"value_end_time" text,
	"value_mode" text,
	"value_team_type" text,
	"value_scoring_type" text,
	"value_mods" text[],
	"value_problems" text[],
	"value_beatmap_set_id" bigint,
	"value_beatmap_title" text,
	"value_beatmap_artist" text,
	"value_beatmap_difficulty" text,
	CONSTRAINT "archive_rel_statistics_source_games_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_statistics_source_games_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_statistics_source_games_scores" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_osu_id" bigint,
	"value_total" bigint,
	"value_team" text,
	"value_slot" bigint,
	"value_passed" boolean,
	"value_mods" text[],
	"value_accuracy" double precision,
	"value_combo" bigint,
	"value_hit_counts_great" bigint,
	"value_hit_counts_ok" bigint,
	"value_hit_counts_meh" bigint,
	"value_hit_counts_miss" bigint,
	"value_problems" text[],
	CONSTRAINT "archive_rel_statistics_source_games_scores_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_statistics_source_games_scores_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_statistics_source_games_scores_provider_fields" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_item_type" text,
	"value_item_string" text,
	"value_item_number" double precision,
	"value_item_boolean" boolean,
	CONSTRAINT "archive_rel_statistics_source_games_scores_provi_8492d0c854" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_statistics_source_games_scores_provi_46e7a4ec41" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
CREATE TABLE "archive_rel_statistics_source_players" (
	"document_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"position" integer NOT NULL,
	"record_key" text,
	"present" text[] NOT NULL,
	"nulls" text[] NOT NULL,
	"value_osu_id" bigint,
	"value_username" text,
	CONSTRAINT "archive_rel_statistics_source_players_pk" PRIMARY KEY("document_id","id"),
	CONSTRAINT "archive_rel_statistics_source_players_order_key" UNIQUE("document_id","parent_id","position")
);
--> statement-breakpoint
ALTER TABLE "archive_relation_documents" ADD CONSTRAINT "archive_relation_documents_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_relation_heads" ADD CONSTRAINT "archive_relation_heads_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_relation_heads" ADD CONSTRAINT "archive_relation_heads_edition_slug_document_key_document_id_archive_relation_documents_edition_slug_document_key_id_fk" FOREIGN KEY ("edition_slug","document_key","document_id") REFERENCES "public"."archive_relation_documents"("edition_slug","document_key","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive" ADD CONSTRAINT "archive_rel_archive_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_final_placements" ADD CONSTRAINT "archive_rel_archive_final_placements_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_final_placements" ADD CONSTRAINT "archive_rel_archive_final_placements_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_links" ADD CONSTRAINT "archive_rel_archive_links_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_links" ADD CONSTRAINT "archive_rel_archive_links_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_matches" ADD CONSTRAINT "archive_rel_archive_matches_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_matches" ADD CONSTRAINT "archive_rel_archive_matches_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_matches_review_games" ADD CONSTRAINT "archive_rel_archive_matches_review_games_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_matches_review_games" ADD CONSTRAINT "archive_rel_archive_matches_review_games_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive_matches"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_picks" ADD CONSTRAINT "archive_rel_archive_picks_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_picks" ADD CONSTRAINT "archive_rel_archive_picks_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_players" ADD CONSTRAINT "archive_rel_archive_players_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_players" ADD CONSTRAINT "archive_rel_archive_players_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_pools" ADD CONSTRAINT "archive_rel_archive_pools_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_pools" ADD CONSTRAINT "archive_rel_archive_pools_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_pools_maps" ADD CONSTRAINT "archive_rel_archive_pools_maps_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_pools_maps" ADD CONSTRAINT "archive_rel_archive_pools_maps_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive_pools"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_pools_maps_difficulty_snapsh_00b1b39990" ADD CONSTRAINT "archive_rel_archive_pools_maps_difficulty_snapsh_21a940214f" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_pools_maps_difficulty_snapsh_00b1b39990" ADD CONSTRAINT "archive_rel_archive_pools_maps_difficulty_snapsh_951b751a12" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive_pools_maps_difficulty_snapshot_variants"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_pools_maps_difficulty_snapshot_variants" ADD CONSTRAINT "archive_rel_archive_pools_maps_difficulty_snapsh_5f5c86a7e8" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_pools_maps_difficulty_snapshot_variants" ADD CONSTRAINT "archive_rel_archive_pools_maps_difficulty_snapsh_c5878c586b" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive_pools_maps"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_qualifiers" ADD CONSTRAINT "archive_rel_archive_qualifiers_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_qualifiers" ADD CONSTRAINT "archive_rel_archive_qualifiers_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_qualifiers_records" ADD CONSTRAINT "archive_rel_archive_qualifiers_records_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_qualifiers_records" ADD CONSTRAINT "archive_rel_archive_qualifiers_records_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive_qualifiers"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_qualifiers_records_scores" ADD CONSTRAINT "archive_rel_archive_qualifiers_records_scores_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_qualifiers_records_scores" ADD CONSTRAINT "archive_rel_archive_qualifiers_records_scores_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive_qualifiers_records"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_review_tables" ADD CONSTRAINT "archive_rel_archive_review_tables_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_review_tables" ADD CONSTRAINT "archive_rel_archive_review_tables_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_review_tables_rows" ADD CONSTRAINT "archive_rel_archive_review_tables_rows_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_review_tables_rows" ADD CONSTRAINT "archive_rel_archive_review_tables_rows_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive_review_tables"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_roster_replacements" ADD CONSTRAINT "archive_rel_archive_roster_replacements_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_roster_replacements" ADD CONSTRAINT "archive_rel_archive_roster_replacements_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_roster_replacements_people" ADD CONSTRAINT "archive_rel_archive_roster_replacements_people_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_roster_replacements_people" ADD CONSTRAINT "archive_rel_archive_roster_replacements_people_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive_roster_replacements"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_source_facts" ADD CONSTRAINT "archive_rel_archive_source_facts_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_source_facts" ADD CONSTRAINT "archive_rel_archive_source_facts_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_staff" ADD CONSTRAINT "archive_rel_archive_staff_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_staff" ADD CONSTRAINT "archive_rel_archive_staff_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_standings" ADD CONSTRAINT "archive_rel_archive_standings_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_standings" ADD CONSTRAINT "archive_rel_archive_standings_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_teams" ADD CONSTRAINT "archive_rel_archive_teams_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_teams" ADD CONSTRAINT "archive_rel_archive_teams_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_unresolved_players" ADD CONSTRAINT "archive_rel_archive_unresolved_players_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_archive_unresolved_players" ADD CONSTRAINT "archive_rel_archive_unresolved_players_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_archive"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_statistics" ADD CONSTRAINT "archive_rel_statistics_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_statistics_excluded_games" ADD CONSTRAINT "archive_rel_statistics_excluded_games_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_statistics_excluded_games" ADD CONSTRAINT "archive_rel_statistics_excluded_games_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_statistics"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_statistics_excluded_scores" ADD CONSTRAINT "archive_rel_statistics_excluded_scores_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_statistics_excluded_scores" ADD CONSTRAINT "archive_rel_statistics_excluded_scores_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_statistics"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_statistics_source_events" ADD CONSTRAINT "archive_rel_statistics_source_events_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_statistics_source_events" ADD CONSTRAINT "archive_rel_statistics_source_events_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_statistics"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_statistics_source_games" ADD CONSTRAINT "archive_rel_statistics_source_games_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_statistics_source_games" ADD CONSTRAINT "archive_rel_statistics_source_games_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_statistics"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_statistics_source_games_scores" ADD CONSTRAINT "archive_rel_statistics_source_games_scores_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_statistics_source_games_scores" ADD CONSTRAINT "archive_rel_statistics_source_games_scores_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_statistics_source_games"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_statistics_source_games_scores_provider_fields" ADD CONSTRAINT "archive_rel_statistics_source_games_scores_provi_acc6f6d9d5" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_statistics_source_games_scores_provider_fields" ADD CONSTRAINT "archive_rel_statistics_source_games_scores_provi_5bff5e5ba0" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_statistics_source_games_scores"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_statistics_source_players" ADD CONSTRAINT "archive_rel_statistics_source_players_document_fk" FOREIGN KEY ("document_id") REFERENCES "public"."archive_relation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_rel_statistics_source_players" ADD CONSTRAINT "archive_rel_statistics_source_players_parent_fk" FOREIGN KEY ("document_id","parent_id") REFERENCES "public"."archive_rel_statistics"("document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "archive_relation_document_content_idx" ON "archive_relation_documents" USING btree ("edition_slug","document_key","codec_version","content_hash");--> statement-breakpoint
CREATE INDEX "archive_relation_document_mp_idx" ON "archive_relation_documents" USING btree ("edition_slug","mp_id","snapshot_kind");--> statement-breakpoint
CREATE INDEX "archive_rel_archive_final_placements_value_team_id_idx" ON "archive_rel_archive_final_placements" USING btree ("value_team_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_archive_matches_review_games_value_b_675fc3b21f" ON "archive_rel_archive_matches_review_games" USING btree ("value_beatmap_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_archive_picks_value_team_id_idx" ON "archive_rel_archive_picks" USING btree ("value_team_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_archive_picks_value_osu_id_idx" ON "archive_rel_archive_picks" USING btree ("value_osu_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_archive_players_value_osu_id_idx" ON "archive_rel_archive_players" USING btree ("value_osu_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_archive_players_value_team_id_idx" ON "archive_rel_archive_players" USING btree ("value_team_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_archive_pools_maps_value_slot_idx" ON "archive_rel_archive_pools_maps" USING btree ("value_slot","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_archive_pools_maps_value_beatmap_id_idx" ON "archive_rel_archive_pools_maps" USING btree ("value_beatmap_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_archive_qualifiers_records_scores_value_slot_idx" ON "archive_rel_archive_qualifiers_records_scores" USING btree ("value_slot","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_archive_review_tables_rows_value_team_id_idx" ON "archive_rel_archive_review_tables_rows" USING btree ("value_team_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_archive_roster_replacements_value_team_id_idx" ON "archive_rel_archive_roster_replacements" USING btree ("value_team_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_archive_roster_replacements_people_v_c8d688ad6a" ON "archive_rel_archive_roster_replacements_people" USING btree ("value_osu_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_archive_staff_value_osu_id_idx" ON "archive_rel_archive_staff" USING btree ("value_osu_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_archive_standings_value_team_id_idx" ON "archive_rel_archive_standings" USING btree ("value_team_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_archive_unresolved_players_value_team_id_idx" ON "archive_rel_archive_unresolved_players" USING btree ("value_team_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_statistics_excluded_scores_value_osu_id_idx" ON "archive_rel_statistics_excluded_scores" USING btree ("value_osu_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_statistics_source_games_value_beatmap_id_idx" ON "archive_rel_statistics_source_games" USING btree ("value_beatmap_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_statistics_source_games_scores_value_osu_id_idx" ON "archive_rel_statistics_source_games_scores" USING btree ("value_osu_id","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_statistics_source_games_scores_value_slot_idx" ON "archive_rel_statistics_source_games_scores" USING btree ("value_slot","document_id");--> statement-breakpoint
CREATE INDEX "archive_rel_statistics_source_players_value_osu_id_idx" ON "archive_rel_statistics_source_players" USING btree ("value_osu_id","document_id");
--> statement-breakpoint
CREATE FUNCTION public.protect_archive_relation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Historical typed evidence is immutable' USING ERRCODE='55000'; END; $$;
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_relation_documents FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_final_placements FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_links FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_teams FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_players FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_unresolved_players FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_roster_replacements FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_roster_replacements_people FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_qualifiers FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_qualifiers_records FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_qualifiers_records_scores FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_review_tables FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_review_tables_rows FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_source_facts FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_picks FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_staff FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_standings FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_matches FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_matches_review_games FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_pools FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_pools_maps FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_pools_maps_difficulty_snapshot_variants FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_archive_pools_maps_difficulty_snapsh_00b1b39990 FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_statistics FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_statistics_source_players FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_statistics_source_events FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_statistics_source_games FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_statistics_source_games_scores FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_statistics_source_games_scores_provider_fields FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_statistics_excluded_scores FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER archive_relation_immutable BEFORE UPDATE OR DELETE ON public.archive_rel_statistics_excluded_games FOR EACH ROW EXECUTE FUNCTION public.protect_archive_relation();
