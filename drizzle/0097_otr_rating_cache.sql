CREATE TABLE "otr_rating_cache" (
	"osu_id" bigint PRIMARY KEY NOT NULL,
	"rating" jsonb,
	"retry_at" timestamp with time zone NOT NULL
);
