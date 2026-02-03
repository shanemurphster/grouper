import { getSupabaseClient } from "../api/supabase";
import { generatePlanFromText } from "../services/mockPlanner";
import { Project } from "../models/types";

function makeJoinCode() {
	return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function createProject(input: {
	name: string;
	timeframe: "twoDay" | "oneWeek" | "long";
	assignmentTitle?: string;
	assignmentDetails?: string;
	description?: string;
	groupSize?: number;
	generateStarter?: boolean;
	displayName?: string;
	deliverableTitles?: string[];
	resourceLinks?: Array<{ label: string; url: string }>;
}) {
	const supabase = getSupabaseClient();
	const joinCode = makeJoinCode();
	const now = new Date().toISOString();
	const insert = {
		name: input.name,
		timeframe: input.timeframe,
		join_code: joinCode,
		assignment_title: input.assignmentTitle ?? undefined,
		assignment_details: input.assignmentDetails ?? undefined,
		description: input.description ?? undefined,
		group_size: input.groupSize ?? 1,
		created_at: now,
	};

	const { data, error } = await supabase.from("projects").insert(insert).select("*").single();
	if (error) throw error;
	const project = data as any;

	// add current user as member
	const userRes = await supabase.auth.getUser();
	const userId = userRes.data?.user?.id;
	if (userId) {
		await supabase.from("project_members").insert({
			project_id: project.id,
			user_id: userId,
			display_name: input.displayName ?? undefined,
			created_at: now,
		});
	}
	// add any user-provided deliverables/resource links
	if ((input.deliverableTitles ?? []).length > 0) {
		const userD = (input.deliverableTitles ?? []).map((t) => ({
			project_id: project.id,
			title: t || "Deliverable",
			url: null,
			created_at: new Date().toISOString(),
		}));
		await supabase.from("deliverables").insert(userD);
	}
	if ((input.resourceLinks ?? []).length > 0) {
		const links = (input.resourceLinks ?? []).map((r) => ({
			project_id: project.id,
			title: r.label || r.url,
			url: r.url || null,
			created_at: new Date().toISOString(),
		}));
		await supabase.from("deliverables").insert(links);
	}

	// optionally generate starter tasks/deliverables client-side and insert
	if (input.generateStarter && (input.assignmentDetails || input.assignmentTitle)) {
		const prompt = input.assignmentDetails || input.assignmentTitle || "Plan";
		const { deliverables, tasks } = generatePlanFromText(prompt);
		// insert deliverables
		if ((deliverables ?? []).length > 0) {
			const delToInsert = deliverables.map((d) => ({
				project_id: project.id,
				title: d.title,
				url: d.url ?? null,
				created_at: new Date().toISOString(),
			}));
			await supabase.from("deliverables").insert(delToInsert);
		}
		// insert tasks
		if ((tasks ?? []).length > 0) {
			const taskToInsert = tasks.map((t) => ({
				project_id: project.id,
				title: t.title,
				details: t.details,
				category: t.category,
				status: t.status,
				size: t.size,
				created_at: t.createdAt ?? new Date().toISOString(),
			}));
			await supabase.from("tasks").insert(taskToInsert);
		}
	}

	return project.id as string;
}

export async function joinProject({ joinCode, displayName }: { joinCode: string; displayName?: string }) {
	const supabase = getSupabaseClient();
	const { data, error } = await supabase.rpc("join_project_by_code", { p_code: joinCode, p_display_name: displayName ?? null });
	if (error) throw error;
	return data as string;
}

export async function listMyProjects() {
	const supabase = getSupabaseClient();
	const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
	if (error) throw error;
	return (data ?? []) as Project[];
}

export async function fetchProjectBundle(projectId: string) {
	const supabase = getSupabaseClient();
	const { data, error } = await supabase
		.from("projects")
		.select("*, project_members(*), tasks(*), deliverables(*), requests(*)")
		.eq("id", projectId)
		.single();
	if (error) throw error;
	return data as any;
}

