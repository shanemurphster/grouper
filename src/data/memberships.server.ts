import { getSupabaseClient } from "../api/supabase";

const supabase = getSupabaseClient();

export type Membership = {
	id: string;
	project_id: string;
	user_id: string;
	is_archived?: boolean;
};

export async function listMyMemberships(): Promise<Membership[]> {
	const { data: userData } = await supabase.auth.getUser();
	const uid = userData?.user?.id;
	if (!uid) return [];
	// include embedded project under the key `project` using PostgREST aliasing:
	// project:projects(...) grabs the related row from `projects` table via the project_id FK.
	const { data, error } = await supabase
		.from("project_members")
		.select(
			"id, project:projects(id,name,timeframe,join_code,assignment_title,assignment_details,group_size,plan_status), user_id, is_archived, last_opened_at"
		)
		.eq("user_id", uid);
	if (error) throw error;
	return (data ?? []) as Membership[];
}

export default {
	listMyMemberships,
};

