CREATE TABLE "chat_prompt_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" bigint,
	"revision" integer NOT NULL,
	"before_length" integer NOT NULL,
	"after_length" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_prompt_events_revision_unique" UNIQUE("revision")
);
--> statement-breakpoint
CREATE TABLE "chat_prompt_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "chat_prompt_settings_singleton" CHECK ("chat_prompt_settings"."id" = 1),
	CONSTRAINT "chat_prompt_settings_revision" CHECK ("chat_prompt_settings"."revision" >= 0),
	CONSTRAINT "chat_prompt_settings_length" CHECK (char_length("chat_prompt_settings"."prompt") <= 3000)
);
--> statement-breakpoint
ALTER TABLE "chat_prompt_events" ADD CONSTRAINT "chat_prompt_events_actor_id_users_osu_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("osu_id") ON DELETE set null ON UPDATE no action;