import { getSupabaseClient } from "../api/supabase";
// uuid helper for client-side generated filenames
// react-native-uuid exports a v4 function; use a runtime import to avoid bundler issues.
// @ts-ignore
import uuid from "react-native-uuid";

const supabase = getSupabaseClient();
const STORAGE_BUCKET = "project_files";

export async function fetchProjectDetail(projectId: string) {
	// project
	const { data: project, error: pErr } = await supabase.from("projects").select("*").eq("id", projectId).single();
	if (pErr) throw pErr;

	// members (include id=project_members.id which is memberId)
	const { data: members, error: mErr } = await supabase.from("project_members").select("id,project_id,user_id,display_name,is_archived").eq("project_id", projectId);
	if (mErr) throw mErr;

	// tasks
	const { data: tasks, error: tErr } = await supabase.from("tasks").select("*").eq("project_id", projectId).order("created_at", { ascending: true });
	if (tErr) throw tErr;

	// deliverables
	const { data: deliverables, error: dErr } = await supabase.from("deliverables").select("*").eq("project_id", projectId);
	if (dErr) throw dErr;

	// requests
	const { data: requests, error: rErr } = await supabase.from("requests").select("*").eq("project_id", projectId);
	if (rErr) throw rErr;

	// resources
	const { data: projectResources, error: prErr } = await supabase.from("project_resources").select("*").eq("project_id", projectId);
	if (prErr) throw prErr;

	// task links
	const { data: taskLinks, error: tlErr } = await supabase.from("task_links").select("*").eq("project_id", projectId);
	if (tlErr) throw tlErr;

	// task bundles
	const { data: taskBundles, error: tbErr } = await supabase.from("task_bundles").select("*").eq("project_id", projectId).order("created_at", { ascending: true });
	if (tbErr) throw tbErr;
	// normalize members/tasks/resources shape for client
	const normalizedMembers = (members ?? []).map((m: any) => ({
		id: m.id,
		project_id: m.project_id,
		user_id: m.user_id,
		displayName: m.display_name ?? m.displayName ?? "",
		is_archived: m.is_archived ?? false,
	}));

	const normalizedTasks = (tasks ?? []).map((t: any) => ({
		...t,
		id: t.id,
		title: t.title,
		details: t.details,
		category: t.category,
		status: t.status,
		size: t.size,
		ownerMemberId: t.owner_member_id ?? t.ownerMemberId ?? null,
		createdAt: t.created_at ?? t.createdAt,
		updatedAt: t.updated_at ?? t.updatedAt,
		blocked: t.blocked ?? false,
		blockedReason: t.blocked_reason ?? t.blockedReason,
	}));

	const normalizedResources = (projectResources ?? []).map((r: any) => ({
		...r,
		id: r.id,
		label: r.label,
		type: r.type ?? "link",
		url: r.url,
		textContent: r.text_content ?? null,
		filePath: r.file_path ?? null,
		mimeType: r.mime_type ?? null,
		sizeBytes: r.size_bytes ?? null,
		createdAt: r.created_at ?? r.createdAt,
		updatedAt: r.updated_at ?? r.updatedAt,
	}));

	const normalizedBundles = (taskBundles ?? []).map((b: any) => ({
		id: b.id,
		project_id: b.project_id,
		title: b.title,
		summary: b.summary ?? null,
		total_points: b.total_points ?? null,
		claimed_by_member_id: b.claimed_by_member_id ?? null,
		createdAt: b.created_at ?? null,
		updatedAt: b.updated_at ?? null,
	}));

	// myMemberId
	const { data: userData } = await supabase.auth.getUser();
	const uid = userData?.user?.id;
	let myMemberId: string | null = null;
	if (uid) {
		const found = normalizedMembers.find((m: any) => m.user_id === uid);
		if (found) myMemberId = found.id;
	}
	return { project, members: normalizedMembers, tasks: normalizedTasks, deliverables: deliverables ?? [], requests: requests ?? [], projectResources: normalizedResources, taskLinks: taskLinks ?? [], taskBundles: normalizedBundles, myMemberId };
}

export async function addProjectResource(
	projectId: string,
	input: {
		label: string;
		type?: "link" | "text" | "file";
		url?: string | null;
		text_content?: string | null;
		file_path?: string | null;
		mime_type?: string | null;
		size_bytes?: number | null;
	}
) {
	const payload: any = {
		project_id: projectId,
		label: input.label,
		type: input.type ?? "link",
		url: input.url ?? null,
		text_content: input.text_content ?? null,
		file_path: input.file_path ?? null,
		mime_type: input.mime_type ?? null,
		size_bytes: input.size_bytes ?? null,
	};
	const { data, error } = await supabase.from("project_resources").insert(payload).select("*").single();
	if (error) throw error;
	return data;
}

export async function uploadProjectFile(projectId: string, uri: string, filename?: string) {
	// read file and upload to storage
	const fileName = filename ?? uri.split("/").pop() ?? "file";
	const fileExt = fileName.split(".").pop() ?? "bin";
	const user = await supabase.auth.getUser();
	const uid = user?.data?.user?.id ?? "unknown";
	const id = (uuid && typeof uuid.v4 === "function" ? uuid.v4() : `${Date.now()}-${Math.floor(Math.random() * 10000)}`) as string;
	const path = `${projectId}/${uid}/${id}-${fileName}`;

	console.log("uploadProjectFile: uploading", { bucket: STORAGE_BUCKET, path, uri });

	let contentType: string | undefined = undefined;
	try {
		const response = await fetch(uri);
		if (!response.ok) throw new Error(`Failed to fetch file at ${uri}: ${response.status}`);
		const arrayBuffer = await response.arrayBuffer();
		// attempt to detect content type from response headers or fallback
		contentType = response.headers.get("Content-Type") ?? `application/${fileExt}`;

		// Prefer Blob where available (browser / expo). Fallback to Uint8Array.
		let uploadData: any;
		if (typeof Blob !== "undefined") {
			uploadData = new Blob([arrayBuffer], { type: contentType });
		} else {
			uploadData = new Uint8Array(arrayBuffer);
		}

		const { data, error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, uploadData, { upsert: false, contentType });
		if (error) {
			console.error("supabase storage upload error", error);
			throw error;
		}
		// size in bytes
		const sizeBytes = (arrayBuffer && (arrayBuffer as any).byteLength) ?? null;
		return {
			path,
			mime_type: contentType ?? `application/${fileExt}`,
			size_bytes: sizeBytes,
		};
	} catch (e) {
		console.error("uploadProjectFile failed", e);
		throw e;
	}
}

export async function getSignedFileUrl(path: string, expiresSec = 60 * 60) {
	const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, expiresSec);
	if (error) throw error;
	return data.signedUrl;
}

export async function deleteProjectResource(resourceId: string) {
	// delete storage object if present
	try {
		const { data: res } = await supabase.from("project_resources").select("*").eq("id", resourceId).single();
		if (res && res.file_path) {
			await supabase.storage.from("project_files").remove([res.file_path]);
		}
	} catch (e) {
		// continue to delete DB row even if storage remove fails
	}
	const { error } = await supabase.from("project_resources").delete().eq("id", resourceId);
	if (error) throw error;
	return true;
}

export async function addTaskLink(projectId: string, taskId: string, input: { label: string; url: string }) {
	const { data, error } = await supabase.from("task_links").insert({ project_id: projectId, task_id: taskId, label: input.label, url: input.url }).select("*").single();
	if (error) throw error;
	return data;
}

export async function deleteTaskLink(linkId: string) {
	const { error } = await supabase.from("task_links").delete().eq("id", linkId);
	if (error) throw error;
	return true;
}

export async function updateProjectNotes(projectId: string, notes: string) {
	const { data, error } = await supabase
		.from("projects")
		.update({ project_ai_notes: notes })
		.eq("id", projectId)
		.select("*")
		.single();
	if (error) throw error;
	return data;
}

export default {
	fetchProjectDetail,
	addProjectResource,
	deleteProjectResource,
	addTaskLink,
	deleteTaskLink,
	updateProjectNotes,
};

