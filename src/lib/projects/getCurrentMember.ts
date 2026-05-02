import { getSupabaseClient } from "../../../api/supabase";

export async function getCurrentMember(projectId: string) {
	const supabase = getSupabaseClient();
	const { data: userData } = await supabase.auth.getUser();
	const uid = userData?.user?.id;
	if (!uid) {
		return null;
	}
	const { data, error } = await supabase
		.from("project_members")
		.select("*")
		.eq("project_id", projectId)
		.eq("user_id", uid)
		.maybeSingle();
	if (error) {
		console.error("getCurrentMember error", error);
		return null;
	}
	return data;
}
