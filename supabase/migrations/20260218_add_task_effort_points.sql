-- Migration 2026-02-18: track effort points per task for AI scoring.

-- Add the column with default 0 so existing rows stay valid.
alter table tasks
	add column if not exists effort_points integer not null default 0;

-- Backfill in case older rows somehow bypassed the default.
update tasks set effort_points = 0 where effort_points is null;

-- Optional index to speed grouping by project for effort balancing.
create index if not exists idx_tasks_effort_points_project on tasks(project_id, effort_points);
