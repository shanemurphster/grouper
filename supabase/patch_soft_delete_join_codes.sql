-- Patch: soft delete + reusable join codes
-- Run in Supabase SQL Editor

-- 1) Add deleted_at column for soft delete
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- 2) Drop the old simple unique constraint on join_code
--    (may fail if it doesn't exist by this name — safe to ignore)
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_join_code_key;
DROP INDEX IF EXISTS projects_join_code_key;

-- 3) Create partial unique index: join_code must be unique among active (non-deleted) projects
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_join_code_active
  ON projects (join_code)
  WHERE deleted_at IS NULL;

-- 4) Update join_project_by_code RPC to only find active projects
CREATE OR REPLACE FUNCTION join_project_by_code(p_code text, p_display_name text)
RETURNS uuid AS $$
DECLARE
  proj_id uuid;
  uid uuid := auth.uid();
BEGIN
  SELECT id INTO proj_id FROM projects WHERE join_code = p_code AND deleted_at IS NULL LIMIT 1;
  IF proj_id IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  INSERT INTO project_members (project_id, user_id, display_name)
    SELECT proj_id, uid, p_display_name
    WHERE NOT EXISTS (SELECT 1 FROM project_members WHERE project_id = proj_id AND user_id = uid);
  RETURN proj_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) Update projects SELECT policy to exclude soft-deleted projects
DROP POLICY IF EXISTS "projects_select_for_members" ON projects;
CREATE POLICY "projects_select_for_members" ON projects
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = projects.id AND pm.user_id = auth.uid())
  );
