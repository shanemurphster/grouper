import { getSupabaseClient } from "../api/supabase";

const supabase = getSupabaseClient();

export async function retryPlan(projectId: string, force = false) {
	const { data, error } = await supabase.functions.invoke("retry-plan", { body: { project_id: projectId, force } });
	if (error) {
		// Read the raw response body so step-level diagnostics are visible in the client console
		try {
			const bodyText = await (error as any)?.context?.text?.();
			console.error("retryPlan: edge function error body:", bodyText ?? "(no body)");
		} catch {
			// body unavailable or already consumed
		}
		console.error("retryPlan: invoke error", error, "data:", data);
		throw error;
	}
	console.log("retryPlan: response", data);
	if (!data || data.status !== "ready") {
		const msg = `retry-plan returned status=${data?.status ?? "unknown"}: ${data?.error_message ?? data?.error ?? JSON.stringify(data)}`;
		throw new Error(msg);
	}
	return data;
}

export default {
	retryPlan,
};


