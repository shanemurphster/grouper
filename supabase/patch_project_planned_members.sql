-- Patch: create project_planned_members table to track planned (not-yet-joined) members
CREATE TABLE IF NOT EXISTS project_planned_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_planned_members_project ON project_planned_members(project_id);


