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

export async function createProjectServer(input: CreateInput, options?: { signal?: AbortSignal }): Promise<string> {
	// Call server-side Edge Function to create project and generate/persist plan server-side.
	// This keeps API keys off the client and ensures AI runs and persists bundles/tasks server-side.
	const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-project-with-ai`;
	// get access token for Authorization
	const { data: sessionData } = await supabase.auth.getSession();
	const token = sessionData?.session?.access_token ?? null;
	if (!token) throw new Error("Not authenticated");

	const body = {
		name: input.name,
		description: input.description ?? null,
		timeframe: input.timeframe,
		assignment_details: input.assignmentDetails ?? "",
		group_size: input.groupSize ?? 1,
		trace_id: input.trace_id ?? undefined,
		debug_skip_openai: input.debug_skip_openai ?? undefined,
		member_names: [], // client may supply member names; leave empty here
	};
	// prepare request
	const payload = JSON.stringify(body);
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${token}`,
	};

	// Client-side logging (non-sensitive): URL, method, header keys, payload size, environment hints
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { Platform } = require("react-native");
		let isDevice = false;
		try {
			// try to detect device if expo-device is available
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const Device = require("expo-device");
			isDevice = !!Device.isDevice;
		} catch {}
		console.log("createProjectServer: request", { url, method: "POST", headerKeys: Object.keys(headers), payloadSize: payload.length, platform: Platform?.OS ?? "unknown", isDevice });
	} catch (e) {
		// ignore logging failures
	}

	let res: Response;
	try {
		res = await fetch(url, {
			method: "POST",
			headers,
			signal: options?.signal,
			body: payload,
		});
	} catch (e: any) {
		// network-level error (TypeError: Failed to fetch)
		const proto = url.startsWith("https://") ? "https" : url.startsWith("http://") ? "http" : "unknown";
		const debug = {
			url,
			protocol: proto,
			method: "POST",
			headerKeys: Object.keys(headers),
			payloadSize: payload.length,
			suggestion: "Edge function unreachable; check function URL / emulator networking",
		};
		console.error("createProjectServer fetch failed", debug, e);
		// throw an Error with debug marker so UI can surface a debug block
		throw new Error(`EDGE_DEBUG:${JSON.stringify(debug)}\n\nNetwork error: ${String(e?.message ?? e)}`);
	}

	const text = await res.text();
	// Log response status and (truncated) body for debugging
	try {
		const truncated = text?.length > 2000 ? text.slice(0, 2000) + "...(truncated)" : text;
		console.log("createProjectServer: fetch response", { url, status: res.status, body: truncated });
	} catch {}
	if (!res.ok) {
		// log and surface server response
		console.error("createProjectServer non-2xx", { status: res.status, body: text });
		// include truncated response in thrown error (cap to 2000 chars)
		const truncated = text?.length > 2000 ? text.slice(0, 2000) + "...(truncated)" : text;
		throw new Error(`Create project failed: ${res.status} ${truncated}`);
	}
	let data: any = null;
	try {
		data = JSON.parse(text);
	} catch {
		data = { raw: text };
	}
	if (!data?.project_id) throw new Error("No project id returned");
	return data.project_id as string;
}

export async function joinProjectServer({ joinCode, displayName }: { joinCode: string; displayName?: string }): Promise<string> {
	const { data, error } = await supabase.rpc("join_project_by_code", { p_code: joinCode, p_display_name: displayName ?? null });
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
};

export async function listMyProjectsServer({ includeArchived = false }: { includeArchived?: boolean } = {}) {
	// need current user id
	const user = await getUser();
	const uid = user?.id;
	if (!uid) return [];

	// select from project_members join projects
	const { data, error } = await supabase
		.from("project_members")
		.select("id,project:projects(id,name,timeframe,join_code,assignment_title,created_at,updated_at),is_archived,last_opened_at")
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

