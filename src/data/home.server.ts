import { getSupabaseClient } from "../api/supabase";
import { listMyMemberships } from "./memberships.server";

const supabase = getSupabaseClient();

export async function fetchHomeDashboard() {
	// Step 1: get memberships
	const memberships = await listMyMemberships();
	const memberIds = memberships.map((m) => m.id);
	const projectIds = memberships.map((m) => m.project_id);

	// Step 2: tasks owned by me and not done
	let myOpenTasks: any[] = [];
	if (memberIds.length > 0) {
		const { data: tasksData, error: tasksErr } = await supabase
			.from("tasks")
			.select("*")
			.in("owner_member_id", memberIds)
			.neq("status", "done")
			.order("updated_at", { ascending: false })
			.limit(10);
		if (tasksErr) throw tasksErr;
		myOpenTasks = tasksData ?? [];
	}

	// enrich tasks with project name map
	let projectMap: Record<string, any> = {};
	if (projectIds.length > 0) {
		const { data: projectsData } = await supabase.from("projects").select("id,name").in("id", projectIds);
		(projectsData ?? []).forEach((p: any) => (projectMap[p.id] = p));
	}
	myOpenTasks = myOpenTasks.map((t) => ({ ...t, projectName: projectMap[t.project_id]?.name ?? "" }));

	// Step 3: my projects summary (only non-archived memberships -> recent projects)
	let myProjects: any[] = [];
	const activeMemberships = memberships.filter((m) => !m.is_archived);
	if (activeMemberships.length > 0) {
		const activeProjectIds = activeMemberships.map((m) => m.project_id);
		const { data: projData, error: projErr } = await supabase
			.from("projects")
			.select("id,name,timeframe,created_at,updated_at")
			.in("id", activeProjectIds);
		if (projErr) throw projErr;

		const projectById: Record<string, any> = {};
		(projData ?? []).forEach((p: any) => (projectById[p.id] = p));

		// Map each active membership to a project summary including lastOpenedAt
		const mapped = activeMemberships
			.map((m) => {
				const proj = projectById[m.project_id] ?? {};
				return {
					id: proj.id,
					name: proj.name,
					timeframe: proj.timeframe,
					createdAt: proj.created_at ?? null,
					projectUpdatedAt: proj.updated_at ?? proj.created_at ?? null,
					lastOpenedAt: m.last_opened_at ?? null,
				};
			})
			// sort by COALESCE(lastOpenedAt, projectUpdatedAt, createdAt) desc
			.sort((a, b) => {
				const aTime = new Date(a.lastOpenedAt ?? a.projectUpdatedAt ?? a.createdAt ?? 0).getTime();
				const bTime = new Date(b.lastOpenedAt ?? b.projectUpdatedAt ?? b.createdAt ?? 0).getTime();
				return bTime - aTime;
			})
			.slice(0, 5);

		myProjects = mapped;
	}

	return {
		myOpenTasks,
		myProjects,
		memberships,
	};
}

export default {
	fetchHomeDashboard,
};

