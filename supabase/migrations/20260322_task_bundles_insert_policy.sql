-- Migration 2026-03-22: add missing INSERT policy for task_bundles.
-- The 2026-02-18 RLS migration created SELECT / UPDATE / DELETE policies but
-- omitted INSERT, so any client NOT using the service-role key cannot insert
-- bundles (edge functions use service-role and bypass RLS, but this is a
-- defence-in-depth fix and resolves the failure mode when the service-role
-- key is unavailable).

create policy if not exists task_bundles_insert
on public.task_bundles
for insert
with check (
  exists (
    select 1
    from public.project_members pm
    where pm.project_id = task_bundles.project_id
      and pm.user_id = auth.uid()
  )
);
