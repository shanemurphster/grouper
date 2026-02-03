-- Patch v2: extend project_resources to support TEXT and FILE resources, storage bucket and policies
-- 1) Add columns to project_resources
ALTER TABLE project_resources ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'link';
ALTER TABLE project_resources ADD COLUMN IF NOT EXISTS text_content text NULL;
ALTER TABLE project_resources ADD COLUMN IF NOT EXISTS file_path text NULL;
ALTER TABLE project_resources ADD COLUMN IF NOT EXISTS mime_type text NULL;
ALTER TABLE project_resources ADD COLUMN IF NOT EXISTS size_bytes bigint NULL;

-- Make url nullable (only used for type = 'link')
ALTER TABLE project_resources ALTER COLUMN url DROP NOT NULL;

-- 2) Ensure updated_at trigger exists (re-uses set_updated_at if present)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_updated_at_project_resources') THEN
    CREATE TRIGGER trg_set_updated_at_project_resources BEFORE UPDATE ON project_resources FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
  END IF;
END;
$$;

-- 3) Enable RLS (keeps existing membership-based policy)
ALTER TABLE project_resources ENABLE ROW LEVEL SECURITY;

-- 4) Ensure membership policy exists (no-op if already present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'project_resources_members') THEN
    CREATE POLICY project_resources_members ON project_resources
      FOR ALL
      USING (EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = project_resources.project_id AND pm.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = project_resources.project_id AND pm.user_id = auth.uid()));
  END IF;
END;
$$;

-- 5) Indexes
CREATE INDEX IF NOT EXISTS idx_project_resources_project ON project_resources(project_id);


-- 7) Storage policies: allow authenticated members to operate on objects under projectId/...
-- These policies apply to storage.objects and check project membership by extracting projectId from object name prefix.
-- Read (select)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'project_files_select_by_member') THEN
    CREATE POLICY project_files_select_by_member ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'project_files' AND
        EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = (split_part(name, '/', 1))::uuid
            AND pm.user_id = auth.uid()
        )
      );
  END IF;
END;
$$;

-- Insert policy: allow authenticated project members to SELECT objects in project_files where object path starts with projectId
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'project_files_select_by_member') THEN
    CREATE POLICY project_files_select_by_member ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'project_files' AND
        EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = (split_part(name, '/', 1))::uuid
            AND pm.user_id = auth.uid()
        )
      );
  END IF;
END;
$$;

-- Insert policy: allow authenticated project members to INSERT objects under project_files for projects they belong to
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'project_files_insert_by_member') THEN
    EXECUTE $sql$
      CREATE POLICY project_files_insert_by_member ON storage.objects
        FOR INSERT
        WITH CHECK (
          bucket_id = 'project_files' AND
          EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = (split_part(name, '/', 1))::uuid
              AND pm.user_id = auth.uid()
          )
        );
    $sql$;
  END IF;
END;
$$;

-- Update policy: allow authenticated project members to UPDATE objects under project_files for projects they belong to
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'project_files_update_by_member') THEN
    EXECUTE $sql$
      CREATE POLICY project_files_update_by_member ON storage.objects
        FOR UPDATE
        USING (
          bucket_id = 'project_files' AND
          EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = (split_part(name, '/', 1))::uuid
              AND pm.user_id = auth.uid()
          )
        )
        WITH CHECK (
          bucket_id = 'project_files' AND
          EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = (split_part(name, '/', 1))::uuid
              AND pm.user_id = auth.uid()
          )
        );
    $sql$;
  END IF;
END;
$$;

-- Delete policy: allow authenticated project members to DELETE objects under project_files for projects they belong to
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'project_files_delete_by_member') THEN
    CREATE POLICY project_files_delete_by_member ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'project_files' AND
        EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = (split_part(name, '/', 1))::uuid
            AND pm.user_id = auth.uid()
        )
      );
  END IF;
END;
$$;

-- Notes:
-- - Upload path convention should be: {projectId}/{userId}/{uuid}-{filename}
-- - If your Supabase instance doesn't expose storage.* SQL functions, create the bucket via the Dashboard or CLI.
-- - These policies assume object names start with the projectId as the first path segment.

