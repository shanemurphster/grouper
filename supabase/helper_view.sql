create or replace view my_open_tasks as
select
  t.*,
  p.name as project_name,
  p.timeframe as project_timeframe
from tasks t
join project_members pm on pm.id = t.owner_member_id
join projects p on p.id = t.project_id
where pm.user_id = auth.uid()
  and coalesce(t.status, 'todo') != 'done';

create or replace view my_projects as
select
  p.*,
  pm.id as my_member_id,
  pm.is_archived,
  pm.created_at as joined_at
from projects p
join project_members pm on pm.project_id = p.id
where pm.user_id = auth.uid();
