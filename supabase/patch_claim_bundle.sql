-- Patch: create RPC to claim a bundle atomically
-- Usage: select * from claim_bundle(p_project_id := '...', p_bundle_id := '...');

CREATE OR REPLACE FUNCTION claim_bundle(p_project_id uuid, p_bundle_id uuid)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  title text,
  summary text,
  total_points integer,
  claimed_by_member_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  claimed_tasks integer
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  my_member_id uuid;
  updated_row task_bundles%ROWTYPE;
  v_claimed_count integer := 0;
BEGIN
  -- ensure caller is a project member and get their project_members.id
  SELECT id INTO my_member_id FROM project_members WHERE project_id = p_project_id AND user_id = auth.uid() LIMIT 1;
  IF my_member_id IS NULL THEN
    RAISE EXCEPTION 'Not a member of project' USING ERRCODE = 'P0001';
  END IF;

  -- Attempt to claim the bundle atomically. Only succeeds if currently unclaimed.
  UPDATE task_bundles
    SET claimed_by_member_id = my_member_id,
        updated_at = now()
    WHERE id = p_bundle_id
      AND project_id = p_project_id
      AND claimed_by_member_id IS NULL
    RETURNING * INTO updated_row;

  IF updated_row.id IS NULL THEN
    RAISE EXCEPTION 'Bundle already claimed or not found' USING ERRCODE = 'P0002';
  END IF;

  -- bump project updated_at to mark recent activity
  UPDATE projects SET updated_at = now() WHERE id = p_project_id;

  -- Assign any unowned tasks in the bundle to this member
  UPDATE tasks
    SET owner_member_id = my_member_id,
        updated_at = now()
    WHERE bundle_id = p_bundle_id
      AND project_id = p_project_id
      AND owner_member_id IS NULL;
  GET DIAGNOSTICS v_claimed_count = ROW_COUNT;

  -- Return the updated bundle and claimed task count
  id := updated_row.id;
  project_id := updated_row.project_id;
  title := updated_row.title;
  summary := updated_row.summary;
  total_points := updated_row.total_points;
  claimed_by_member_id := updated_row.claimed_by_member_id;
  created_at := updated_row.created_at;
  updated_at := updated_row.updated_at;
  claimed_tasks := v_claimed_count;
  RETURN NEXT;
  RETURN;
END;
$$;

-- Grant execute to authenticated users (so callers with valid JWT can call)
GRANT EXECUTE ON FUNCTION claim_bundle(uuid, uuid) TO authenticated;


