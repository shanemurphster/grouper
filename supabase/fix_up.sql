-- Allow authenticated users to create projects
create policy "projects_insert_authenticated" on projects
  for insert
  with check (auth.uid() is not null);

-- Allow members to update/delete project (optional; you can restrict to “owner” later)
create policy "projects_update_members" on projects
  for update
  using (
    exists (select 1 from project_members pm
            where pm.project_id = projects.id and pm.user_id = auth.uid())
  )
  with check (
    exists (select 1 from project_members pm
            where pm.project_id = projects.id and pm.user_id = auth.uid())
  );

create policy "projects_delete_members" on projects
  for delete
  using (
    exists (select 1 from project_members pm
            where pm.project_id = projects.id and pm.user_id = auth.uid())
  );

alter table requests
  drop constraint if exists requests_task_id_fkey;

alter table requests
  add constraint requests_task_id_fkey
  foreign key (task_id) references tasks(id) on delete set null;

create index if not exists idx_project_members_user on project_members(user_id);
create index if not exists idx_project_members_project on project_members(project_id);

create index if not exists idx_tasks_project on tasks(project_id);
create index if not exists idx_tasks_owner on tasks(owner_member_id);

create index if not exists idx_deliverables_project on deliverables(project_id);

create index if not exists idx_requests_project on requests(project_id);
create index if not exists idx_requests_to_status on requests(to_member_id, status);

alter table project_members
  add column if not exists is_archived boolean default false;

create or replace function create_project_with_member(
  p_name text,
  p_timeframe text,
  p_join_code text,
  p_display_name text,
  p_assignment_title text default null,
  p_assignment_details text default null
) returns uuid as $$
declare
  proj_id uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into projects (name, timeframe, join_code, assignment_title, assignment_details)
  values (p_name, p_timeframe, p_join_code, p_assignment_title, p_assignment_details)
  returning id into proj_id;

  insert into project_members (project_id, user_id, display_name)
  values (proj_id, uid, p_display_name);

  return proj_id;
end;
$$ language plpgsql security definer;
