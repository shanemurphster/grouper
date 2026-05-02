-- Migration 2026-02-18: Hardening bundle/task constraints.

-- Enforce one claimed bundle per member per project.
create unique index if not exists idx_task_bundles_project_claimed
	on task_bundles(project_id, claimed_by_member_id)
	where claimed_by_member_id is not null;

-- Make sure every task has a project_id before making the column NOT NULL.
do $$
declare
	missing integer;
begin
	select count(*) into missing from tasks where project_id is null;
	if missing > 0 then
		update tasks
		set project_id = tb.project_id
		from task_bundles tb
		where tasks.bundle_id = tb.id
			and tasks.project_id is null;
		if exists (select 1 from tasks where project_id is null) then
			raise notice 'Tasks still missing project_id after propagation; manual cleanup required.';
			raise exception 'Cannot set tasks.project_id NOT NULL because % rows remain null', missing;
		end if;
	end if;
end;
$$;

alter table tasks
	alter column project_id set not null;

-- Add indexes that mirror the app's queries for bundles and tasks.
create index if not exists idx_tasks_project_bundle on tasks(project_id, bundle_id);
create index if not exists idx_tasks_owner_member on tasks(owner_member_id);
create index if not exists idx_task_bundles_project on task_bundles(project_id);
