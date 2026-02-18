import { getSupabaseClient } from "../api/supabase";

const supabase = getSupabaseClient();

async function getMyMemberId(projectId: string) {
	const { data: userData } = await supabase.auth.getUser();
	const uid = userData?.user?.id;
	if (!uid) {
		throw new Error("Not authenticated");
	}
	const { data: member, error } = await supabase
		.from("project_members")
		.select("id")
		.eq("project_id", projectId)
		.eq("user_id", uid)
		.maybeSingle();
	if (error) throw error;
	if (!member?.id) throw new Error("Project membership not found");
	return member.id as string;
}

export async function claimBundle(projectId: string, bundleId: string) {
	const memberId = await getMyMemberId(projectId);
	const { data: updatedBundle, error: bundleErr } = await supabase
		.from("task_bundles")
		.update({ claimed_by_member_id: memberId, updated_at: new Date().toISOString() })
		.eq("project_id", projectId)
		.eq("id", bundleId)
		.eq("claimed_by_member_id", null)
		.select("*")
		.single();
	if (bundleErr) {
		console.error("claimBundle failed", bundleErr.code ?? bundleErr);
		throw bundleErr;
	}

	const { data: taskUpdate, error: tasksErr } = await supabase
		.from("tasks")
		.update({ owner_member_id: memberId, updated_at: new Date().toISOString() })
		.eq("project_id", projectId)
		.eq("bundle_id", bundleId)
		.is("owner_member_id", null);
	if (tasksErr) {
		console.error("claimBundle task assignment failed", tasksErr.code ?? tasksErr);
		throw tasksErr;
	}

	if (process.env.NODE_ENV !== "production") {
		console.log("claimBundle updated bundle", updatedBundle?.id, "assigned tasks count", taskUpdate?.length ?? 0);
	}

	return updatedBundle ?? null;
}

export async function fetchBundlesForProject(projectId: string) {
	const { data, error } = await supabase.from("task_bundles").select("*").eq("project_id", projectId).order("created_at", { ascending: true });
	if (error) throw error;
	return data ?? [];
}

export default {
	claimBundle,
	fetchBundlesForProject,
};


