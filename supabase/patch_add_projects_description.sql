-- Patch: add projects.description column
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description text NULL;

-- ensure updated_at trigger exists for projects (no-op if already present)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_updated_at_projects') THEN
    CREATE TRIGGER trg_set_updated_at_projects BEFORE UPDATE ON projects FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
  END IF;
END;
$$;


