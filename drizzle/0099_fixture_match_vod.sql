CREATE TABLE "fixture_recordings" (
	"fixture_id" uuid PRIMARY KEY NOT NULL,
	"vod_url" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fixture_recordings" ADD CONSTRAINT "fixture_recordings_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;