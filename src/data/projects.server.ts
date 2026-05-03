import { supabase, getUser, requireUser } from "./supabaseClient";
import { Project } from "../models/types";

type CreateInput = {
	name: string;
	timeframe: "twoDay" | "oneWeek" | "long";
	joinCode: string;
	displayName?: string;
	assignmentTitle?: string;
	assignmentDetails?: string;
	description?: string;
	groupSize?: number;
	trace_id?: string;
	debug_skip_openai?: boolean;
};

export async function createProjectServer(input: CreateInput, _options?: { signal?: AbortSignal }): Promise<string> {
	// Verify we have a valid session before calling the edge function
	const { data: { session } } = await supabase.auth.getSession();
	if (!session?.access_token) throw new Error("Not authenticated — please log in");

	console.log("createProjectServer: session exists, token prefix:", session.access_token.slice(0, 10) + "...");

	const body = {
		name: input.name,
		description: input.description ?? null,
		timeframe: input.timeframe,
		assignment_details: input.assignmentDetails ?? "",
		group_size: input.groupSize ?? 1,
		trace_id: input.trace_id ?? undefined,
		debug_skip_openai: input.debug_skip_openai ?? undefined,
		member_names: [],
	};

	console.log("createProjectServer: invoking create-project-with-ai", {
		bodyKeys: Object.keys(body),
		assignmentLen: (body.assignment_details ?? "").length,
		debug_skip_openai: body.debug_skip_openai,
	});

	// Use supabase.functions.invoke which automatically attaches
	// Authorization (user JWT) and apikey headers
	const { data, error } = await supabase.functions.invoke("create-project-with-ai", { body });

	if (error) {
		console.error("createProjectServer: invoke error", error);
		throw new Error(`Create project failed: ${error.message ?? String(error)}`);
	}

	console.log("createProjectServer: response", data);

	if (!data?.project_id) {
		throw new Error(`No project_id returned: ${JSON.stringify(data)}`);
	}
	return data.project_id as string;
}

export async function joinProjectServer({ joinCode, displayName }: { joinCode: string; displayName?: string }): Promise<string> {
	const normalized = joinCode.trim().toUpperCase();
	const { data, error } = await supabase.rpc("join_project_by_code", { p_code: normalized, p_display_name: displayName ?? null });
	if (error) throw error;
	const projId = data as string;
	// ensure display_name updated on the membership row for current user
	try {
		const { data: userData } = await supabase.auth.getUser();
		const uid = userData?.user?.id;
		if (uid && projId && displayName) {
			await supabase
				.from("project_members")
				.update({ display_name: displayName, updated_at: new Date().toISOString() })
				.eq("project_id", projId)
				.eq("user_id", uid);
		}
	} catch (e) {
		// not fatal; return projId but log
		console.error("joinProjectServer: failed to update display_name", e);
	}
	return projId;
}

export type ProjectSummary = {
	id: string;
	name: string;
	timeframe: string;
	joinCode?: string | null;
	assignmentTitle?: string | null;
	createdAt?: string | null;
	isArchived?: boolean;
	plan_status?: string | null;
};

export async function listMyProjectsServer({ includeArchived = false }: { includeArchived?: boolean } = {}) {
	// need current user id
	const user = await getUser();
	const uid = user?.id;
	if (!uid) return [];

	// select from project_members join projects
	const { data, error } = await supabase
		.from("project_members")
		.select("id,project:projects(id,name,timeframe,join_code,assignment_title,created_at,updated_at,plan_status),is_archived,last_opened_at")
		.eq("user_id", uid);
	if (error) throw error;

	const rows = (data ?? []) as any[];

	// map to ProjectSummary including myMemberId and lastOpenedAt
	const mapped = rows.map((row) => {
		const proj = row.project;
		return {
			id: proj.id,
			name: proj.name,
			timeframe: proj.timeframe,
			joinCode: proj.join_code ?? proj.joinCode ?? null,
			assignmentTitle: proj.assignment_title ?? null,
			createdAt: proj.created_at ?? null,
			isArchived: row.is_archived ?? false,
			myMemberId: row.id,
			lastOpenedAt: row.last_opened_at ?? null,
			projectUpdatedAt: proj.updated_at ?? proj.created_at ?? null,
			plan_status: proj.plan_status ?? null,
		};
	});

	// sort by project.updated_at desc, fallback to project.created_at desc
	mapped.sort((a, b) => {
		const aTime = new Date(a.projectUpdatedAt ?? a.createdAt ?? 0).getTime();
		const bTime = new Date(b.projectUpdatedAt ?? b.createdAt ?? 0).getTime();
		if (bTime !== aTime) return bTime - aTime;
		// tie-breaker: createdAt desc
		const aCreated = new Date(a.createdAt ?? 0).getTime();
		const bCreated = new Date(b.createdAt ?? 0).getTime();
		return bCreated - aCreated;
	});

	const out: ProjectSummary[] = mapped.map((m) => ({
		id: m.id,
		name: m.name,
		timeframe: m.timeframe,
		joinCode: m.joinCode,
		assignmentTitle: m.assignmentTitle,
		createdAt: m.createdAt,
		isArchived: m.isArchived,
		plan_status: m.plan_status ?? null,
	}));

	return includeArchived ? out : out.filter((p) => !p.isArchived);
}

export async function listMyTasksServer() {
	const user = await getUser();
	const uid = user?.id;
	if (!uid) return [];

	const { data: memberships, error: memErr } = await supabase
		.from("project_members")
		.select("id,project:projects(id,name,timeframe,join_code,assignment_title)")
		.eq("user_id", uid);
	if (memErr) throw memErr;
	const memberIds = (memberships ?? []).map((m: any) => m.id).filter(Boolean);
	if (memberIds.length === 0) return [];

	const { data: tasks, error: tErr } = await supabase
		.from("tasks")
		.select("*, project:projects(id,name,timeframe,join_code,assignment_title)")
		.in("owner_member_id", memberIds)
		.order("created_at", { ascending: true });
	if (tErr) throw tErr;

	return (tasks ?? []).map((task: any) => ({
		...task,
		projectId: task.project?.id ?? task.project_id,
		projectName: task.project?.name ?? "",
		timeframe: task.project?.timeframe ?? "",
		ownerMemberId: task.owner_member_id,
	}));
}

export async function setProjectArchivedServer({ projectId, isArchived }: { projectId: string; isArchived: boolean }) {
	const user = await requireUser();
	const uid = user.id;
	const { error } = await supabase
		.from("project_members")
		.update({ is_archived: isArchived })
		.eq("project_id", projectId)
		.eq("user_id", uid);
	if (error) throw error;
}

export async function fetchProjectBundleServer(projectId: string) {
	// fetch project
	const { data: projectData, error: pErr } = await supabase.from("projects").select("*").eq("id", projectId).single();
	if (pErr) throw pErr;

	const { data: members, error: mErr } = await supabase.from("project_members").select("*").eq("project_id", projectId);
	if (mErr) throw mErr;

	const { data: tasks, error: tErr } = await supabase.from("tasks").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
	if (tErr) throw tErr;

	const { data: deliverables, error: dErr } = await supabase.from("deliverables").select("*").eq("project_id", projectId);
	if (dErr) throw dErr;

	const { data: requests, error: rErr } = await supabase.from("requests").select("*").eq("project_id", projectId);
	if (rErr) throw rErr;

	// determine myMemberId
	const user = await getUser();
	let myMemberId: string | null = null;
	if (user) {
		const found = (members ?? []).find((m: any) => m.user_id === user.id);
		if (found) myMemberId = found.id;
	}

	return {
		project: projectData,
		members: members ?? [],
		tasks: tasks ?? [],
		deliverables: deliverables ?? [],
		requests: requests ?? [],
		myMemberId,
	};
}

export async function markProjectOpened(projectId: string) {
	const user = await requireUser();
	const uid = user.id;
	const { error } = await supabase.from("project_members").update({ last_opened_at: new Date().toISOString() }).eq("project_id", projectId).eq("user_id", uid);
	if (error) throw error;
}

export default {
	createProjectServer,
	joinProjectServer,
	listMyProjectsServer,
	setProjectArchivedServer,
	fetchProjectBundleServer,
};

