import { getSupabaseClient } from "../api/supabase";

const supabase = getSupabaseClient();

export async function claimBundle(projectId: string, bundleId: string) {
	const { data, error } = await supabase.rpc("claim_bundle", { p_project_id: projectId, p_bundle_id: bundleId });
	if (error) throw error;
	return data;
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


