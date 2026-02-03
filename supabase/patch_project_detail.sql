-- Patch: add timestamps, resources, links, trigger, and indexes

-- 1) add updated_at to projects and project_members if missing
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2) ensure tasks/deliverables/requests have updated_at
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE requests ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 3) create project_resources
create table if not exists project_resources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  label text not null,
  url text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4) create task_links
create table if not exists task_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  task_id uuid references tasks(id) on delete cascade not null,
  label text not null,
  url text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5) reusable trigger function to set updated_at
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- attach trigger to tables
drop trigger if exists trg_set_updated_at_projects on projects;
create trigger trg_set_updated_at_projects before update on projects for each row execute procedure set_updated_at();

drop trigger if exists trg_set_updated_at_project_members on project_members;
create trigger trg_set_updated_at_project_members before update on project_members for each row execute procedure set_updated_at();

drop trigger if exists trg_set_updated_at_tasks on tasks;
create trigger trg_set_updated_at_tasks before update on tasks for each row execute procedure set_updated_at();

drop trigger if exists trg_set_updated_at_deliverables on deliverables;
create trigger trg_set_updated_at_deliverables before update on deliverables for each row execute procedure set_updated_at();

drop trigger if exists trg_set_updated_at_requests on requests;
create trigger trg_set_updated_at_requests before update on requests for each row execute procedure set_updated_at();

drop trigger if exists trg_set_updated_at_project_resources on project_resources;
create trigger trg_set_updated_at_project_resources before update on project_resources for each row execute procedure set_updated_at();

drop trigger if exists trg_set_updated_at_task_links on task_links;
create trigger trg_set_updated_at_task_links before update on task_links for each row execute procedure set_updated_at();

-- 6) RLS: enable and policies for project_resources and task_links
alter table project_resources enable row level security;
alter table task_links enable row level security;

create policy "project_resources_members" on project_resources
  for all
  using (exists (select 1 from project_members pm where pm.project_id = project_resources.project_id and pm.user_id = auth.uid()))
  with check (exists (select 1 from project_members pm where pm.project_id = project_resources.project_id and pm.user_id = auth.uid()));

create policy "task_links_members" on task_links
  for all
  using (exists (select 1 from project_members pm where pm.project_id = task_links.project_id and pm.user_id = auth.uid()))
  with check (exists (select 1 from project_members pm where pm.project_id = task_links.project_id and pm.user_id = auth.uid()));

-- 7) Indexes
create index if not exists idx_project_resources_project on project_resources(project_id);
create index if not exists idx_task_links_task on task_links(task_id);
create index if not exists idx_task_links_project on task_links(project_id);
create index if not exists idx_tasks_project on tasks(project_id);
create index if not exists idx_tasks_owner_member on tasks(owner_member_id);

