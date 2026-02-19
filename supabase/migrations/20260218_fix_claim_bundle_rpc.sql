-- Migration: fix claim_bundle RPC to never throw P0003.
-- Every SELECT INTO uses ORDER BY created_at ASC LIMIT 1.
-- Removed RETURNING ... INTO on multi-row UPDATE (was the P0003 source).

create or replace function public.claim_bundle(p_bundle_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
	v_bundle   task_bundles%rowtype;
	v_project  uuid;
	v_member_id uuid;
	v_assigned_count integer := 0;
begin
	-- 1. Lock the bundle row
	select *
	into v_bundle
	from task_bundles
	where id = p_bundle_id
	for update;

	if not found then
		raise exception 'bundle not found';
	end if;

	v_project := v_bundle.project_id;

	-- 2. Resolve the caller's member id (deterministic: earliest row)
	select pm.id into v_member_id
	from public.project_members pm
	where pm.project_id = v_project
	  and pm.user_id = auth.uid()
	order by pm.created_at asc
	limit 1;

	if v_member_id is null then
		raise exception 'authenticated user is not a member of the bundle''s project';
	end if;

	-- 3. If already claimed by someone else, reject
	if v_bundle.claimed_by_member_id is not null
	   and v_bundle.claimed_by_member_id is distinct from v_member_id then
		raise exception 'bundle already claimed';
	end if;

	-- 4. Claim the bundle
	update task_bundles
	set claimed_by_member_id = v_member_id,
		updated_at = now()
	where id = p_bundle_id;

	-- 5. Assign unowned tasks in the bundle to the claimer.
	--    Do NOT use RETURNING ... INTO here; it triggers P0003
	--    when multiple tasks match. GET DIAGNOSTICS is safe.
	update tasks
	set owner_member_id = v_member_id,
		updated_at = now()
	where bundle_id = p_bundle_id
	  and (owner_member_id is null);

	get diagnostics v_assigned_count = row_count;

	return jsonb_build_object(
		'bundle_id', p_bundle_id,
		'claimed_by_member_id', v_member_id,
		'assigned_count', coalesce(v_assigned_count, 0)
	);
end;
$$;

revoke all on function public.claim_bundle(uuid) from public;
grant execute on function public.claim_bundle(uuid) to authenticated;

-- Verification: confirm no duplicates in project_members
-- select project_id, user_id, count(*) from project_members group by 1,2 having count(*)>1;
