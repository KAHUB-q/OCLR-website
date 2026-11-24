CREATE TABLE "chat_source_vectors" (
	"edition_slug" text NOT NULL,
	"digest" text NOT NULL,
	"collection" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"content" text NOT NULL,
	"model" text,
	"keywords" text[] NOT NULL,
	"embedding" double precision[],
	CONSTRAINT "chat_source_vectors_edition_slug_digest_pk" PRIMARY KEY("edition_slug","digest")
);
--> statement-breakpoint
ALTER TABLE "chat_source_vectors" ADD CONSTRAINT "chat_source_vectors_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_source_keywords_idx" ON "chat_source_vectors" USING gin ("keywords");