import { getSupabaseClient } from "../api/supabase";

const supabase = getSupabaseClient();

export async function getProfile(userId: string) {
	const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).single();
	if (error) {
		// If no row found, return null
		if (error.code === "PGRST116") return null;
		throw error;
	}
	return data;
}

export async function upsertProfile(input: { user_id: string; full_name?: string | null; school?: string | null; avatar_url?: string | null }) {
	const { data, error } = await supabase.from("profiles").upsert(input).select().single();
	if (error) throw error;
	// Keep project_members.display_name in sync for memberships where display_name is blank/null.
	try {
		const userId = input.user_id;
		const name = input.full_name ?? null;
		if (name) {
			// update rows where display_name IS NULL
			await supabase
				.from("project_members")
				.update({ display_name: name, updated_at: new Date().toISOString() })
				.eq("user_id", userId)
				.is("display_name", null);
			// update rows where display_name is empty string
			await supabase
				.from("project_members")
				.update({ display_name: name, updated_at: new Date().toISOString() })
				.eq("user_id", userId)
				.eq("display_name", "");
		}
	} catch (e) {
		// not fatal; log for debugging
		// eslint-disable-next-line no-console
		console.error("upsertProfile: failed to sync project_members display_name", e);
	}
	return data;
}

export async function uploadAvatar(userId: string, uri: string) {
	// upload file from uri (React Native). Convert to blob.
	const fileExt = uri.split(".").pop()?.split("?")[0] ?? "jpg";
	const path = `${userId}/avatar.${fileExt}`;
	// fetch blob
	const response = await fetch(uri);
	const blob = await response.blob();
	const { data, error } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: blob.type || `image/${fileExt}` });
	if (error) throw error;
	// return the storage path (to be saved in profiles.avatar_url)
	return path;
}

export async function getSignedAvatarUrl(path: string, expiresSec = 60 * 60) {
	const { data, error } = await supabase.storage.from("avatars").createSignedUrl(path, expiresSec);
	if (error) throw error;
	return data.signedUrl;
}

export default {
	getProfile,
	upsertProfile,
	uploadAvatar,
};

