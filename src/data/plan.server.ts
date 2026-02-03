import { getSupabaseClient } from "../api/supabase";

const supabase = getSupabaseClient();

export async function retryPlan(projectId: string, force = false) {
	// Calls the Edge Function via Supabase Functions helper
	const { data, error } = await supabase.functions.invoke("retry-plan", { body: { project_id: projectId, force } });
	if (error) throw error;
	return data;
}

export default {
	retryPlan,
};


