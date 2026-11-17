CREATE TABLE "transferred_historical_statistics_releases" (
	"edition_slug" text NOT NULL,
	"mp_id" bigint NOT NULL,
	"snapshot" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "transferred_historical_statistics_releases_edition_slug_mp_id_pk" PRIMARY KEY("edition_slug","mp_id")
);
--> statement-breakpoint
ALTER TABLE "transferred_historical_statistics_releases" ADD CONSTRAINT "transferred_historical_statistics_release_source_fk" FOREIGN KEY ("edition_slug","mp_id") REFERENCES "public"."historical_statistics"("edition_slug","mp_id") ON DELETE no action ON UPDATE no action;