-- Migration 2026-02-21: deduplicate project_members and enforce uniqueness.

with ranked as (
	select id,
		row_number() over (partition by project_id, user_id order by created_at asc, id asc) as rn
	from project_members
)
delete from project_members
where id in (
	select id from ranked where rn > 1
);

create unique index if not exists uniq_project_member on project_members(project_id, user_id);
