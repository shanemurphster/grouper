import { getSupabaseClient } from "../api/supabase";
import { getProfile, upsertProfile } from "./profile.server";

const supabase = getSupabaseClient();

export async function getCurrentUserId(): Promise<string | null> {
	const { data } = await supabase.auth.getUser();
	return data?.user?.id ?? null;
}

export async function getMyProfile() {
	const userId = await getCurrentUserId();
	if (!userId) return null;
	return await getProfile(userId);
}

export async function upsertMyProfile(fields: { full_name?: string | null; school?: string | null; avatar_url?: string | null }) {
	const userId = await getCurrentUserId();
	if (!userId) throw new Error("Not authenticated");
	return await upsertProfile({ user_id: userId, full_name: fields.full_name ?? null, school: fields.school ?? null, avatar_url: fields.avatar_url ?? null });
}

export default {
	getCurrentUserId,
	getMyProfile,
	upsertMyProfile,
};

