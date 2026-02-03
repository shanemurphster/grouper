import { supabase, requireUser } from "./supabaseClient";

export async function createTaskServer(projectId: string, payload: any) {
	const now = new Date().toISOString();
	const insert = {
		project_id: projectId,
		title: payload.title,
		details: payload.details ?? null,
		category: payload.category ?? null,
		status: payload.status ?? "todo",
		size: payload.size ?? null,
		due_date: payload.dueDate ?? null,
		owner_member_id: payload.ownerMemberId ?? null,
		blocked: payload.blocked ?? false,
		blocked_reason: payload.blockedReason ?? null,
		created_at: now,
		updated_at: now,
	};
	try {
		console.log("createTaskServer payload", { projectId, insert });
		const { data, error } = await supabase.from("tasks").insert(insert).select("*").single();
		if (error) {
			console.error("createTaskServer error", error);
			throw error;
		}
		console.log("createTaskServer inserted task", { id: data?.id, projectId, data });
		// bump project's updated_at to mark recent activity (non-fatal)
		try {
			await supabase.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId);
		} catch (e) {
			console.error("createTaskServer: failed to bump project updated_at", e);
		}
		// If task was assigned to another member, create an assignment request from the current user's membership (if available)
		try {
			if (data && data.owner_member_id) {
				// find current user's project_members.id for this project
				const { data: userData } = await supabase.auth.getUser();
				const uid = userData?.user?.id ?? null;
				if (uid) {
					const { data: pm, error: pmErr } = await supabase.from("project_members").select("id").eq("project_id", projectId).eq("user_id", uid).maybeSingle();
					if (!pmErr && pm && pm.id && pm.id !== data.owner_member_id) {
						await supabase.from("requests").insert({
							project_id: projectId,
							from_member_id: pm.id,
							to_member_id: data.owner_member_id,
							task_id: data.id,
							type: "assignment",
							status: "pending",
						});
						console.log("createTaskServer: created assignment request", { taskId: data.id, from: pm.id, to: data.owner_member_id });
					}
				}
			}
		} catch (e) {
			// do not fail the task creation if request insert fails; just log
			console.error("createTaskServer: request creation failed", e);
		}
		return data;
	} catch (e) {
		console.error("createTaskServer caught", e);
		throw e;
	}
}

export async function updateTaskServer(taskId: string, patch: Partial<any>) {
	const now = new Date().toISOString();
	const toUpdate: any = { ...patch, updated_at: now };
	// only allow certain fields
	const allowed: any = {};
	// fetch previous task to detect reassignment
	let prevTask: any = null;
	try {
		const { data: prev, error: prevErr } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
		if (!prevErr) prevTask = prev;
	} catch (e) {
		// ignore
	}
	if (toUpdate.status !== undefined) allowed.status = toUpdate.status;
	if (toUpdate.owner_member_id !== undefined) allowed.owner_member_id = toUpdate.owner_member_id;
	if (toUpdate.ownerMemberId !== undefined) allowed.owner_member_id = toUpdate.ownerMemberId;
	if (toUpdate.blocked !== undefined) allowed.blocked = toUpdate.blocked;
	if (toUpdate.blockedReason !== undefined) allowed.blocked_reason = toUpdate.blockedReason;
	if (toUpdate.updated_at !== undefined) allowed.updated_at = toUpdate.updated_at;
	allowed.updated_at = now;

	try {
		console.log("updateTaskServer", { taskId, patch, allowed });
		const { data, error } = await supabase.from("tasks").update(allowed).eq("id", taskId).select("*").single();
		if (error) {
			console.error("updateTaskServer error", error);
			throw error;
		}
		// If owner changed to another member, create an assignment request from current user (if possible)
		try {
			const newOwner = allowed.owner_member_id ?? null;
			const prevOwner = prevTask?.owner_member_id ?? null;
			if (newOwner && newOwner !== prevOwner) {
				const { data: userData } = await supabase.auth.getUser();
				const uid = userData?.user?.id ?? null;
				if (uid) {
					const { data: pm, error: pmErr } = await supabase.from("project_members").select("id,project_id").eq("user_id", uid).maybeSingle();
					// If pm found and pm.id !== newOwner, and task belongs to same project, create request
					if (!pmErr && pm && pm.id && pm.id !== newOwner && pm.project_id) {
						// ensure task's project matches pm.project_id; fetch task if needed
						const projectId = data?.project_id ?? prevTask?.project_id ?? null;
						if (projectId && projectId === pm.project_id) {
							await supabase.from("requests").insert({
								project_id: projectId,
								from_member_id: pm.id,
								to_member_id: newOwner,
								task_id: taskId,
								type: "assignment",
								status: "pending",
							});
							console.log("updateTaskServer: created assignment request", { taskId, from: pm.id, to: newOwner });
						}
					}
				}
			}
		} catch (e) {
			console.error("updateTaskServer: request creation failed", e);
		}
		console.log("updateTaskServer updated task", { id: data?.id, taskId, data });
		// bump project's updated_at to mark recent activity (non-fatal)
		try {
			const projectId = data?.project_id ?? prevTask?.project_id ?? null;
			if (projectId) {
				await supabase.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId);
			}
		} catch (e) {
			console.error("updateTaskServer: failed to bump project updated_at", e);
		}
		return data;
	} catch (e) {
		console.error("updateTaskServer caught", e);
		throw e;
	}
}

export async function deleteTaskServer(taskId: string) {
	const { data, error } = await supabase.from("tasks").delete().eq("id", taskId).select();
	if (error) throw error;
	console.log("deleteTaskServer deleted", { taskId, rows: data?.length ?? 0 });
	return true;
}

export async function createDeliverableServer(projectId: string, title: string, url?: string) {
	const { data, error } = await supabase.from("deliverables").insert({ project_id: projectId, title, url: url ?? null }).select("*").single();
	if (error) throw error;
	return data;
}

export async function updateDeliverableServer(deliverableId: string, patch: Partial<any>) {
	const { data, error } = await supabase.from("deliverables").update(patch).eq("id", deliverableId).select("*").single();
	if (error) throw error;
	return data;
}

export async function createRequestServer(projectId: string, fromMemberId: string, toMemberId: string, taskId: string | null, type: string, message?: string) {
	const { data, error } = await supabase
		.from("requests")
		.insert({ project_id: projectId, from_member_id: fromMemberId, to_member_id: toMemberId, task_id: taskId, type, message, status: "pending" })
		.select("*")
		.single();
	if (error) throw error;
	return data;
}

export async function respondToRequestServer(requestId: string, accept: boolean) {
	// fetch request
	const { data: req, error: rErr } = await supabase.from("requests").select("*").eq("id", requestId).single();
	if (rErr) throw rErr;
	const updates: any = { status: accept ? "accepted" : "declined" };
	const { error: uErr } = await supabase.from("requests").update(updates).eq("id", requestId);
	if (uErr) throw uErr;
	if (accept) {
		// nothing else for now
	} else {
		// if declined and had task assigned, unassign task
		if (req.task_id) {
			await supabase.from("tasks").update({ owner_member_id: null }).eq("id", req.task_id);
		}
	}
	return true;
}

export default {
	createTaskServer,
	updateTaskServer,
	createDeliverableServer,
	updateDeliverableServer,
	createRequestServer,
	respondToRequestServer,
};

