-- Migration 2026-02-18: RPC for reassigning a task within a project.

create or replace function public.reassign_task(p_task_id uuid, p_target_member_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
	v_task tasks%rowtype;
	v_caller_member uuid;
	v_target_member uuid;
	v_target_bundle task_bundles%rowtype;
	v_bundle_id uuid;
begin
	select * into v_task from tasks where id = p_task_id for update;
	if not found then
		raise exception 'task not found';
	end if;

	select id into v_caller_member
	from project_members
	where project_id = v_task.project_id
	  and user_id = auth.uid()
	limit 1;
	if v_caller_member is null then
		raise exception 'caller is not a member of the task project';
	end if;

	select id into v_target_member
	from project_members
	where project_id = v_task.project_id
	  and id = p_target_member_id
	limit 1;
	if v_target_member is null then
		raise exception 'target member is not part of the project';
	end if;

	select * into v_target_bundle
	from task_bundles
	where project_id = v_task.project_id
	  and claimed_by_member_id = v_target_member
	limit 1;

	if v_target_bundle is not null then
		v_bundle_id := v_target_bundle.id;
	else
		v_bundle_id := v_task.bundle_id;
	end if;

	update tasks
	set owner_member_id = v_target_member,
		bundle_id = v_bundle_id,
		updated_at = now()
	where id = p_task_id;

	return jsonb_build_object(
		'task_id', p_task_id,
		'owner_member_id', v_target_member,
		'bundle_id', v_bundle_id
	);
end;
$$;

revoke all on function public.reassign_task(uuid, uuid) from public;
grant execute on function public.reassign_task(uuid, uuid) to authenticated;
