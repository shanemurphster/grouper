-- Patch: add group_size to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS group_size integer NOT NULL DEFAULT 1;

-- Ensure updated_at trigger exists (no-op if present)
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


