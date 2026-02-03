-- Add per-user last_opened_at timestamp to project_members
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS last_opened_at timestamptz;

-- Add index for faster recent lookups
CREATE INDEX IF NOT EXISTS idx_project_members_last_opened ON project_members(project_id, last_opened_at);

