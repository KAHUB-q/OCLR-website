CREATE TABLE "pickem_picks" (
	"window_id" uuid NOT NULL,
	"user_id" bigint NOT NULL,
	"outcome_key" text NOT NULL,
	"home_wins" integer,
	"away_wins" integer,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pickem_picks_window_id_user_id_pk" PRIMARY KEY("window_id","user_id"),
	CONSTRAINT "pickem_picks_outcome" CHECK ("pickem_picks"."outcome_key" in ('home', 'away', 'draw')),
	CONSTRAINT "pickem_picks_score" CHECK (("pickem_picks"."home_wins" is null and "pickem_picks"."away_wins" is null) or ("pickem_picks"."home_wins" is not null and "pickem_picks"."away_wins" is not null and "pickem_picks"."home_wins" between 0 and 99 and "pickem_picks"."away_wins" between 0 and 99))
);
--> statement-breakpoint
CREATE TABLE "pickem_receipts" (
	"window_id" uuid NOT NULL,
	"user_id" bigint NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"receipt" jsonb NOT NULL,
	CONSTRAINT "pickem_receipts_window_id_user_id_request_id_pk" PRIMARY KEY("window_id","user_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "pickem_settings" (
	"edition_slug" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickem_visibility" (
	"edition_slug" text NOT NULL,
	"user_id" bigint NOT NULL,
	"listed" boolean NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "pickem_visibility_edition_slug_user_id_pk" PRIMARY KEY("edition_slug","user_id")
);
--> statement-breakpoint
CREATE TABLE "pickem_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_slug" text NOT NULL,
	"fixture_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"home_team_id" uuid NOT NULL,
	"away_team_id" uuid NOT NULL,
	"rules" jsonb NOT NULL,
	"rule_version" text NOT NULL,
	"scoring_version" integer NOT NULL,
	"score_enabled" boolean NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"void_reason" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickem_windows_sides" CHECK ("pickem_windows"."home_team_id" <> "pickem_windows"."away_team_id"),
	CONSTRAINT "pickem_windows_void_reason" CHECK ("pickem_windows"."void_reason" in ('admin', 'fixture_changed', 'round_changed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "oauth_states" ADD COLUMN "pickem_return_to" text;--> statement-breakpoint
ALTER TABLE "pickem_picks" ADD CONSTRAINT "pickem_picks_window_id_pickem_windows_id_fk" FOREIGN KEY ("window_id") REFERENCES "public"."pickem_windows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_picks" ADD CONSTRAINT "pickem_picks_user_id_users_osu_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("osu_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_receipts" ADD CONSTRAINT "pickem_receipts_window_id_user_id_pickem_picks_window_id_user_id_fk" FOREIGN KEY ("window_id","user_id") REFERENCES "public"."pickem_picks"("window_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_settings" ADD CONSTRAINT "pickem_settings_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_visibility" ADD CONSTRAINT "pickem_visibility_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_visibility" ADD CONSTRAINT "pickem_visibility_user_id_users_osu_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("osu_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_windows" ADD CONSTRAINT "pickem_windows_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_windows" ADD CONSTRAINT "pickem_windows_fixture_id_edition_slug_fixtures_id_edition_slug_fk" FOREIGN KEY ("fixture_id","edition_slug") REFERENCES "public"."fixtures"("id","edition_slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_windows" ADD CONSTRAINT "pickem_windows_round_id_edition_slug_tournament_rounds_id_edition_slug_fk" FOREIGN KEY ("round_id","edition_slug") REFERENCES "public"."tournament_rounds"("id","edition_slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_windows" ADD CONSTRAINT "pickem_windows_home_team_id_edition_slug_teams_id_edition_slug_fk" FOREIGN KEY ("home_team_id","edition_slug") REFERENCES "public"."teams"("id","edition_slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_windows" ADD CONSTRAINT "pickem_windows_away_team_id_edition_slug_teams_id_edition_slug_fk" FOREIGN KEY ("away_team_id","edition_slug") REFERENCES "public"."teams"("id","edition_slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pickem_picks_user" ON "pickem_picks" USING btree ("user_id","window_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pickem_windows_active_fixture" ON "pickem_windows" USING btree ("fixture_id") WHERE "pickem_windows"."void_reason" is null;--> statement-breakpoint
CREATE INDEX "pickem_windows_edition" ON "pickem_windows" USING btree ("edition_slug");
--> statement-breakpoint
CREATE FUNCTION pickem_track_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD.home_team_id, OLD.away_team_id, OLD.round_id,
         OLD.home_source_id, OLD.away_source_id, OLD.home_source_outcome, OLD.away_source_outcome)
     IS DISTINCT FROM
     ROW(NEW.home_team_id, NEW.away_team_id, NEW.round_id,
         NEW.home_source_id, NEW.away_source_id, NEW.home_source_outcome, NEW.away_source_outcome)
     OR NEW.status = 'cancelled' THEN
    UPDATE pickem_windows
    SET void_reason = CASE WHEN NEW.status = 'cancelled' THEN 'cancelled' ELSE 'fixture_changed' END,
        version = version + 1
    WHERE fixture_id = NEW.id AND void_reason IS NULL;
  ELSIF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at
        OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('in_progress', 'ended')) THEN
    UPDATE pickem_windows
    SET closes_at = LEAST(closes_at, CASE
          WHEN NEW.status <> 'scheduled' OR NEW.scheduled_at IS NULL
          THEN clock_timestamp() ELSE NEW.scheduled_at END),
        version = version + 1
    WHERE fixture_id = NEW.id AND void_reason IS NULL
      AND closes_at > CASE WHEN NEW.status <> 'scheduled' OR NEW.scheduled_at IS NULL
                          THEN clock_timestamp() ELSE NEW.scheduled_at END;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER pickem_fixture_changed
AFTER UPDATE OF home_team_id, away_team_id, round_id, home_source_id, away_source_id,
    home_source_outcome, away_source_outcome, scheduled_at, status ON fixtures
FOR EACH ROW EXECUTE FUNCTION pickem_track_fixture();
--> statement-breakpoint
CREATE FUNCTION pickem_track_round() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD.scoring_rules -> 'series', OLD.scoring_rules -> 'tiedMapPolicy')
     IS DISTINCT FROM ROW(NEW.scoring_rules -> 'series', NEW.scoring_rules -> 'tiedMapPolicy') THEN
    UPDATE pickem_windows
    SET void_reason = 'round_changed', version = version + 1
    WHERE round_id = NEW.id AND void_reason IS NULL;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER pickem_round_changed AFTER UPDATE OF scoring_rules ON tournament_rounds
FOR EACH ROW EXECUTE FUNCTION pickem_track_round();
