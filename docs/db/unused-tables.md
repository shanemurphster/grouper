## Unused tables / views (2026-02-18)

We intentionally leave these structures in the schema for future workflows, but they are currently unused or unpopulated in the app logic:

- **`deliverables`** – defined in Supabase schema and surfaced in docs, but the UI/platform does not rely on persisted rows yet (AI plans still use `project_resources`). Keep table around for future deliverable tracking.
- **`my_open_tasks`** – a helper view/table that is not referenced anywhere in the codebase (search returns no hits). Can be reactivated when we need precomputed “open task” lists.
- **`my_projects`** – similar to `my_open_tasks`, unused view/table. Remains for potential dashboard reporting but no active queries touch it.
- **`project_planned_members`** – schema entry that isn’t populated by the current flows; we keep it “quarantined” until planned members become part of the workflow.
- **`requests`** – this table is used (reassign requests, assignment proposals). It’s actively referenced, so it remains part of RLS policies. No action required.
