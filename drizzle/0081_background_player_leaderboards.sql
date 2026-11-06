CREATE TABLE "player_leaderboard_rows" (
	"generation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"osu_id" bigint NOT NULL,
	"username" text NOT NULL,
	"team" text,
	"mra" double precision NOT NULL,
	"rws" double precision,
	"class_category" text,
	"class_code" text,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"draws" integer NOT NULL,
	"appearances" integer NOT NULL,
	"win_rate" double precision,
	"participation" double precision,
	"nm" double precision NOT NULL,
	"mod" double precision NOT NULL,
	"hd" double precision NOT NULL,
	"hr" double precision NOT NULL,
	"dt" double precision NOT NULL,
	CONSTRAINT "player_leaderboard_rows_generation_id_osu_id_pk" PRIMARY KEY("generation_id","osu_id"),
	CONSTRAINT "player_leaderboard_order_key" UNIQUE("generation_id","position"),
	CONSTRAINT "player_leaderboard_row_identity" CHECK ("player_leaderboard_rows"."osu_id" > 0 AND "player_leaderboard_rows"."osu_id" <= 9007199254740991 AND "player_leaderboard_rows"."position" >= 0),
	CONSTRAINT "player_leaderboard_row_class" CHECK (("player_leaderboard_rows"."class_category" IS NULL) = ("player_leaderboard_rows"."class_code" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "player_leaderboard_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_hash" text NOT NULL,
	"projector_version" integer NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"editions" integer NOT NULL,
	"unavailable_editions" integer NOT NULL,
	"maps" integer NOT NULL,
	"skipped_maps" integer NOT NULL,
	"players" integer NOT NULL,
	CONSTRAINT "player_leaderboard_source_hash" CHECK ("player_leaderboard_versions"."source_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "player_leaderboard_counts" CHECK ("player_leaderboard_versions"."editions" >= 0 AND "player_leaderboard_versions"."unavailable_editions" >= 0 AND "player_leaderboard_versions"."maps" >= 0 AND "player_leaderboard_versions"."skipped_maps" >= 0 AND "player_leaderboard_versions"."players" >= 0)
);
--> statement-breakpoint
ALTER TABLE "player_leaderboard_rows" ADD CONSTRAINT "player_leaderboard_rows_generation_id_player_leaderboard_versions_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."player_leaderboard_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_leaderboard_source_idx" ON "player_leaderboard_versions" USING btree ("source_hash","projector_version","calculated_at");
--> statement-breakpoint
CREATE TRIGGER protect_player_leaderboard_versions BEFORE UPDATE OR DELETE ON player_leaderboard_versions
  FOR EACH ROW EXECUTE FUNCTION protect_archive_relation();
--> statement-breakpoint
CREATE TRIGGER protect_player_leaderboard_rows BEFORE UPDATE OR DELETE ON player_leaderboard_rows
  FOR EACH ROW EXECUTE FUNCTION protect_archive_relation();
