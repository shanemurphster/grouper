-- Patch: add is_ai_generated flag to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_ai_generated boolean NOT NULL DEFAULT false;

-- Index for quick lookup when replacing AI tasks
CREATE INDEX IF NOT EXISTS idx_tasks_ai_generated ON tasks(project_id, bundle_id, is_ai_generated);


