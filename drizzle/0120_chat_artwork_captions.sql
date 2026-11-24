CREATE TABLE "chat_artwork_captions" (
	"image" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"digest" text,
	"caption" text,
	"checked_at" timestamp with time zone NOT NULL
);
