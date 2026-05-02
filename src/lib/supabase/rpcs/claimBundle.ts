import { getSupabaseClient } from "../../../api/supabase";

export async function claimBundleRpc(bundleId: string) {
	const supabase = getSupabaseClient();
	const { data, error } = await supabase.rpc("claim_bundle", { p_bundle_id: bundleId });
	if (error) throw error;
	return data;
}
