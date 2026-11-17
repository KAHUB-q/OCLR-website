-- A complete season transfer restores the exact name observations in this
-- transaction. Ordinary archive edits/publication and account/provider
-- observations keep their existing triggers.
CREATE OR REPLACE FUNCTION oclr_capture_identity_names() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF TG_OP = 'UPDATE' THEN
      PERFORM oclr_observe_name(OLD.osu_id, OLD.username, 'account', '', '', NULL);
    END IF;
    PERFORM oclr_observe_name(NEW.osu_id, NEW.username, 'account', '', '', clock_timestamp());
  ELSIF TG_TABLE_NAME = 'user_profile_cache' THEN
    IF TG_OP = 'UPDATE' THEN
      PERFORM oclr_observe_profile(OLD.osu_id, OLD.mode, OLD.profile, NULL);
    END IF;
    PERFORM oclr_observe_profile(NEW.osu_id, NEW.mode, NEW.profile, clock_timestamp());
  ELSIF current_setting('oclr.historical_name_transfer', true) IS DISTINCT FROM NEW.slug THEN
    PERFORM oclr_observe_archive(NEW.slug, NEW.configuration->'archive', clock_timestamp(), coalesce(NEW.configuration->>'published' = 'true', false));
  END IF;
  RETURN NEW;
END;
$$;
