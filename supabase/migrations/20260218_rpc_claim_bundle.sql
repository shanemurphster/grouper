-- Migration 2026-02-18: RPC for atomic bundle claim.

create or replace function public.claim_bundle(p_bundle_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
	v_bundle task_bundles%rowtype;
	v_member_id uuid;
	v_assigned_count integer;
begin
	select *
	into v_bundle
	from task_bundles
	where id = p_bundle_id
	for update;

	if not found then
		raise exception 'bundle not found';
	end if;

	if v_bundle.claimed_by_member_id is not null then
		select id into v_member_id
		from project_members
		where project_id = v_bundle.project_id
		  and id = v_bundle.claimed_by_member_id
		limit 1;
		if v_member_id is not null then
			if v_member_id != (select id from project_members where project_id = v_bundle.project_id and user_id = auth.uid() limit 1) then
				raise exception 'bundle already claimed';
			end if;
		end if;
	end if;

	select id into v_member_id
	from project_members
	where project_id = v_bundle.project_id
	  and user_id = auth.uid()
	limit 1;

	if v_member_id is null then
		raise exception 'authenticated user is not a member of the bundle''s project';
	end if;

	if v_bundle.claimed_by_member_id is null then
		update task_bundles
		set claimed_by_member_id = v_member_id,
			updated_at = now()
		where id = p_bundle_id;
	else
		update task_bundles
		set updated_at = now()
		where id = p_bundle_id;
	end if;

	update tasks
	set owner_member_id = v_member_id,
		updated_at = now()
	where bundle_id = p_bundle_id
	  and owner_member_id is null
	returning 1
	into v_assigned_count;

	-- count rows affected by update
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
