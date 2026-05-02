## RLS Plan (2026-02-18)

### Tables and intuitive access

| Table | Description | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- | --- |
| `projects` | Core project metadata | Any member of the project | Project owners/automation | Project owners/automation | Owners/automation |
| `project_members` | Membership rows tying users to projects | Member themselves | Signup flows (auth) | Member themselves | Member themselves |
| `task_bundles` | Bundles generated per project, claimable by members | Only project members who sit in `project_members` | N/A | Only members of that project claiming/unclaiming | (Optional) Only members |
| `tasks` | Individual task rows | Only project members | Only project members for that project | Only project members | Only project members (or more restrictive) |

### Notes
- `deliverables`, `my_open_tasks`, `my_projects`, `project_planned_members` currently unused or unpublished; RLS plans focus on projects / membership / tasks / bundles.
- SECURITY DEFINER RPCs (`claim_bundle`, `reassign_task`) bypass RLS but enforce membership checks with `project_members`.
