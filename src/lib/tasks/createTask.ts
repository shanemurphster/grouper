import { getSupabaseClient } from "../../api/supabase";

type CreateTaskInput = {
	projectId: string;
	title: string;
	details?: string;
	category?: string | null;
	status?: string | null;
	size?: string | null;
	dueDate?: string | null;
	ownerMemberId?: string | null;
	bundleId?: string | null;
	blocked?: boolean;
	blockedReason?: string | null;
	isAiGenerated?: boolean;
};

export async function createTask(input: CreateTaskInput) {
	const supabase = getSupabaseClient();
	const payload = {
		project_id: input.projectId,
		title: input.title,
		details: input.details ?? null,
		category: input.category ?? null,
		status: input.status ?? "todo",
		size: input.size ?? null,
		due_date: input.dueDate ?? null,
		owner_member_id: input.ownerMemberId ?? null,
		bundle_id: input.bundleId ?? null,
		blocked: input.blocked ?? false,
		blocked_reason: input.blockedReason ?? null,
		is_ai_generated: input.isAiGenerated ?? false,
	};

	const { data, error } = await supabase.from("tasks").insert(payload).select("*").single();
	if (error) {
		console.error("createTask failed", {
			code: error.code,
			message: error.message,
			details: (error as any).details,
			hint: (error as any).hint,
		});
		throw new Error(error.message ?? "Database error creating task");
	}
	return data;
}
