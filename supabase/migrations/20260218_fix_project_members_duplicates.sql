-- Migration: deduplicate project_members rows and enforce uniqueness.
-- Keeps the earliest row (by created_at, then id) for each (project_id, user_id).

-- Step 1: delete duplicates, keeping the earliest row per (project_id, user_id).
with ranked as (
	select id,
		row_number() over (
			partition by project_id, user_id
			order by created_at asc, id asc
		) as rn
	from project_members
)
delete from project_members
where id in (select id from ranked where rn > 1);

-- Step 2: prevent future duplicates.
create unique index if not exists uniq_project_member
	on public.project_members (project_id, user_id);

-- Verification (run manually to confirm no duplicates remain):
-- select project_id, user_id, count(*)
-- from project_members
-- group by 1, 2
-- having count(*) > 1;
