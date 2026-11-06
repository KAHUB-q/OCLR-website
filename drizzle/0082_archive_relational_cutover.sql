CREATE TABLE "historical_archive_sources" (
	"edition_slug" text PRIMARY KEY NOT NULL,
	"source_hash" text NOT NULL,
	CONSTRAINT "historical_archive_source_hash" CHECK ("historical_archive_sources"."source_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "archive_relation_heads" ADD COLUMN "archive_source_digest" text;--> statement-breakpoint
ALTER TABLE "historical_archive_sources" ADD CONSTRAINT "historical_archive_sources_edition_slug_edition_state_slug_fk" FOREIGN KEY ("edition_slug") REFERENCES "public"."edition_state"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "archive_relation_heads" ADD CONSTRAINT "archive_relation_head_digest" CHECK ("archive_relation_heads"."archive_source_digest" IS NULL OR ("archive_relation_heads"."document_key" = 'archive' AND "archive_relation_heads"."archive_source_digest" ~ '^[a-f0-9]{64}$'));
--> statement-breakpoint
-- Initialize identities without rewriting source configurations or revisions.
INSERT INTO public.historical_archive_sources(edition_slug,source_hash)
SELECT slug,encode(sha256(convert_to((configuration->'archive')::text,'UTF8')),'hex')
FROM public.edition_state WHERE jsonb_typeof(configuration->'archive') = 'object';
--> statement-breakpoint
CREATE FUNCTION public.refresh_historical_archive_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.configuration->'archive' IS NOT DISTINCT FROM OLD.configuration->'archive' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(NEW.configuration->'archive') = 'object' THEN
    INSERT INTO public.historical_archive_sources(edition_slug,source_hash)
    VALUES(NEW.slug,encode(sha256(convert_to((NEW.configuration->'archive')::text,'UTF8')),'hex'))
    ON CONFLICT(edition_slug) DO UPDATE SET source_hash=EXCLUDED.source_hash;
  ELSE
    DELETE FROM public.historical_archive_sources WHERE edition_slug=NEW.slug;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER historical_archive_source_manifest AFTER INSERT OR UPDATE OF configuration ON public.edition_state
FOR EACH ROW EXECUTE FUNCTION public.refresh_historical_archive_source();
