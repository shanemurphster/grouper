-- Patch: add plan_status, plan_error, plan_payload to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS plan_status text NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS plan_error text NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS plan_payload jsonb NULL;

-- Optionally index plan_status for quick queries
CREATE INDEX IF NOT EXISTS idx_projects_plan_status ON projects(plan_status);


