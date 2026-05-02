import { getSupabaseClient } from "../../../api/supabase";

export async function reassignTaskRpc(taskId: string, targetMemberId: string) {
	const supabase = getSupabaseClient();
	const { data, error } = await supabase.rpc("reassign_task", { p_task_id: taskId, p_target_member_id: targetMemberId });
	if (error) throw error;
	return data;
}
