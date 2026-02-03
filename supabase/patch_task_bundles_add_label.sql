-- Patch: add label column to task_bundles to store Person X labels
ALTER TABLE task_bundles ADD COLUMN IF NOT EXISTS label text NULL;
CREATE INDEX IF NOT EXISTS idx_task_bundles_label ON task_bundles(label);


