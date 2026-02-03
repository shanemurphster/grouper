-- Patch: add task_bundles table, index, policies and link tasks.bundle_id

-- 1) Create task_bundles table
CREATE TABLE IF NOT EXISTS task_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  summary text,
  total_points integer DEFAULT 0,
  claimed_by_member_id uuid REFERENCES project_members(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2) Ensure updated_at trigger exists (re-uses set_updated_at if present)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_updated_at_task_bundles') THEN
    CREATE TRIGGER trg_set_updated_at_task_bundles BEFORE UPDATE ON task_bundles FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
  END IF;
END;
$$;

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_task_bundles_project ON task_bundles(project_id);
CREATE INDEX IF NOT EXISTS idx_task_bundles_project_claimed ON task_bundles(project_id, claimed_by_member_id);

-- 4) Enable RLS and policies for task_bundles
ALTER TABLE task_bundles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'task_bundles_members') THEN
    CREATE POLICY task_bundles_members ON task_bundles
      FOR ALL
      USING (EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = task_bundles.project_id AND pm.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = task_bundles.project_id AND pm.user_id = auth.uid()));
  END IF;
END;
$$;

-- 5) Add bundle_id to tasks table if missing
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS bundle_id uuid NULL REFERENCES task_bundles(id) ON DELETE SET NULL;

-- 6) Ensure tasks RLS policy exists to allow project members to operate on tasks
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tasks_members') THEN
    CREATE POLICY tasks_members ON tasks
      FOR ALL
      USING (EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = tasks.project_id AND pm.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = tasks.project_id AND pm.user_id = auth.uid()));
  END IF;
END;
$$;

-- 7) Optional: index tasks by bundle_id for fast lookup
CREATE INDEX IF NOT EXISTS idx_tasks_bundle_id ON tasks(bundle_id);


