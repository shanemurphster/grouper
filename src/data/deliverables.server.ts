import { getSupabaseClient } from "../api/supabase";

const supabase = getSupabaseClient();

/**
 * Convert AI plan deliverables into rows suitable for insertion into
 * `project_resources` (type: 'link' | 'text' | 'file').
 *
 * Input deliverable shape supported (flexible):
 *  - { title?: string, url?: string, description?: string }
 *
 * Returns array of objects matching the `addProjectResource` payload shape:
 *  { label, type, url, text_content, file_path?, mime_type?, size_bytes? }
 */
export function mapPlanDeliverablesToResourceRows(planDeliverables: any[] = []) {
	return (planDeliverables ?? []).map((d: any) => {
		const title = d?.title ?? (d?.url ? d.url : "Deliverable");
		if (d?.url) {
			return {
				label: title,
				type: "link" as const,
				url: d.url ?? null,
				text_content: null,
				file_path: null,
				mime_type: null,
				size_bytes: null,
			};
		}
		// default to text note
		return {
			label: title,
			type: "text" as const,
			url: null,
			text_content: d?.description ?? null,
			file_path: null,
			mime_type: null,
			size_bytes: null,
		};
	});
}

/**
 * Persist plan deliverables to project_resources in bulk.
 * NOTE: This helper is provided for future integration; DO NOT call it automatically
 * from plan persistence until you decide to enable AI-origin deliverables persistence.
 *
 * TODO: Call this from the persist-plan flow when enabling AI deliverables persistence.
 */
export async function insertPlanDeliverablesAsResources(projectId: string, planDeliverables: any[]) {
	if (!projectId || !(planDeliverables ?? []).length) return [];
	const rows = mapPlanDeliverablesToResourceRows(planDeliverables).map((r) => ({
		...r,
		project_id: projectId,
		created_at: new Date().toISOString(),
	}));
	const { data, error } = await supabase.from("project_resources").insert(rows).select("*");
	if (error) throw error;
	return data ?? [];
}

export default {
	mapPlanDeliverablesToResourceRows,
	insertPlanDeliverablesAsResources,
};


