import { getSupabaseClient } from "../api/supabase";

export const supabase = getSupabaseClient();

export async function getUser() {
	const { data } = await supabase.auth.getUser();
	return data?.user ?? null;
}

export async function requireUser() {
	const user = await getUser();
	if (!user) throw new Error("Not authenticated");
	return user;
}

export function onAuthStateChange(cb: (event: string, session: any) => void) {
	const { data } = supabase.auth.onAuthStateChange((event, session) => {
		cb(event, session);
	});
	return data.subscription;
}

export default supabase;

