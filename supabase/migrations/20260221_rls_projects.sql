-- Migration 2026-02-21: Enable RLS on projects so notes updates succeed.

alter table projects enable row level security;

drop policy if exists projects_select on projects;
drop policy if exists projects_update on projects;

create policy projects_select on projects
	for select
	using (exists (
		select 1 from project_members pm
		where pm.project_id = projects.id
		  and pm.user_id = auth.uid()
	));

create policy projects_update on projects
	for update
	using (exists (
		select 1 from project_members pm
		where pm.project_id = projects.id
		  and pm.user_id = auth.uid()
	));
