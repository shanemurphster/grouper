-- Migration 2026-02-18: tighten RLS on task-related tables.

alter table public.task_bundles enable row level security;
alter table public.tasks enable row level security;

-- Helper: check membership for project context.
create or replace function public.is_member_of_project(p_project_id uuid)
returns boolean
language sql
stable
as $$
	select exists (
		select 1
		from public.project_members pm
		where pm.project_id = p_project_id
		  and pm.user_id = auth.uid()
	);
$$;

-- ========================
-- DROP EXISTING POLICIES
-- ========================

drop policy if exists task_bundles_select on public.task_bundles;
drop policy if exists tasks_select on public.tasks;
drop policy if exists task_bundles_update on public.task_bundles;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
drop policy if exists task_bundles_delete on public.task_bundles;

-- ========================
-- RECREATE POLICIES
-- ========================

-- Allow members to select bundles/tasks.
create policy task_bundles_select
on public.task_bundles
for select
using (public.is_member_of_project(project_id));

create policy tasks_select
on public.tasks
for select
using (public.is_member_of_project(project_id));

-- Limit updates to bundles to members.
create policy task_bundles_update
on public.task_bundles
for update
using (public.is_member_of_project(project_id));

-- Allow inserting tasks only when caller belongs to project.
create policy tasks_insert
on public.tasks
for insert
with check (public.is_member_of_project(project_id));

-- Allow updates when caller belongs to same project.
create policy tasks_update
on public.tasks
for update
using (public.is_member_of_project(project_id));

-- Delete policy (restrict to project members).
create policy tasks_delete
on public.tasks
for delete
using (public.is_member_of_project(project_id));

create policy task_bundles_delete
on public.task_bundles
for delete
using (public.is_member_of_project(project_id));
