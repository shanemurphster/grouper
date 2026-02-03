-- Enable required extensions
create extension if not exists "pgcrypto";

-- Projects table
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timeframe text not null,
  join_code text unique,
  assignment_title text,
  assignment_details text,
  created_at timestamptz default now()
);

-- Project members
create table if not exists project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  user_id uuid not null,
  display_name text,
  contact jsonb,
  created_at timestamptz default now(),
  unique(project_id, user_id)
);

-- Tasks
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  details text,
  category text,
  status text,
  size text,
  due_date timestamptz,
  owner_member_id uuid references project_members(id),
  blocked boolean default false,
  blocked_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Deliverables
create table if not exists deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  url text,
  created_at timestamptz default now()
);

-- Requests
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  from_member_id uuid references project_members(id),
  to_member_id uuid references project_members(id),
  task_id uuid references tasks(id),
  type text,
  message text,
  status text,
  created_at timestamptz default now()
);

-- Enable RLS and policies
alter table projects enable row level security;
alter table project_members enable row level security;
alter table tasks enable row level security;
alter table deliverables enable row level security;
alter table requests enable row level security;

-- Policies
-- project_members: users can insert/select/update their own membership rows
create policy "project_members_own" on project_members
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- projects: allow select if user is a member of the project
create policy "projects_select_for_members" on projects
  for select
  using (exists (select 1 from project_members pm where pm.project_id = projects.id and pm.user_id = auth.uid()));

-- tasks/deliverables/requests: allow access if user is a member of the project
create policy "project_objects_members" on tasks
  for all
  using (exists (select 1 from project_members pm where pm.project_id = tasks.project_id and pm.user_id = auth.uid()))
  with check (exists (select 1 from project_members pm where pm.project_id = tasks.project_id and pm.user_id = auth.uid()));

create policy "project_objects_members_deliverables" on deliverables
  for all
  using (exists (select 1 from project_members pm where pm.project_id = deliverables.project_id and pm.user_id = auth.uid()))
  with check (exists (select 1 from project_members pm where pm.project_id = deliverables.project_id and pm.user_id = auth.uid()));

create policy "project_objects_members_requests" on requests
  for all
  using (exists (select 1 from project_members pm where pm.project_id = requests.project_id and pm.user_id = auth.uid()))
  with check (exists (select 1 from project_members pm where pm.project_id = requests.project_id and pm.user_id = auth.uid()));

-- RPC to join project by join_code
create or replace function join_project_by_code(p_code text, p_display_name text)
returns uuid as $$
declare
  proj_id uuid;
  uid uuid := auth.uid();
begin
  select id into proj_id from projects where join_code = p_code limit 1;
  if proj_id is null then
    raise exception 'Project not found';
  end if;
  -- insert membership if not exists
  insert into project_members (project_id, user_id, display_name)
    select proj_id, uid, p_display_name
    where not exists (select 1 from project_members where project_id = proj_id and user_id = uid);
  return proj_id;
end;
$$ language plpgsql security definer;

