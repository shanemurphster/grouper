import { z } from "zod";

// Enums
export const TimeframeEnum = z.enum(["twoDay", "oneWeek", "long"]);
export type Timeframe = z.infer<typeof TimeframeEnum>;

export const TaskSizeEnum = z.enum(["S", "M", "L"]);
export type TaskSize = z.infer<typeof TaskSizeEnum>;

export const CategoryEnum = z.enum(["Research", "Writing", "Slides", "Coding", "Analysis", "Admin", "Design", "Review"]);
export type Category = z.infer<typeof CategoryEnum>;

// Task schema
export const TaskV1Schema = z
	.object({
		title: z.string().min(1),
		details: z.string().optional(),
		category: CategoryEnum,
		size: TaskSizeEnum,
		// effort_points: integer enum 1..3 mapping to size S/M/L
		effort_points: z.number().int().min(1).max(3),
	})
	.strict()
	.superRefine((task: any, ctx: z.RefinementCtx) => {
		const mapping: Record<string, number> = { S: 1, M: 2, L: 3 };
		const expected = mapping[task.size as string];
		if (task.effort_points !== expected) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `effort_points must match size mapping (S->1, M->2, L->3). Expected ${expected} for size ${task.size}`,
			});
		}
	});
export type TaskV1 = z.infer<typeof TaskV1Schema>;

// Bundle schema
export const BundleV1Schema = z
	.object({
		label: z.string().min(1),
		bundle_title: z.string().min(1),
		bundle_summary: z.string().optional(),
		tasks: z.array(TaskV1Schema).min(1),
	})
	.strict();
export type BundleV1 = z.infer<typeof BundleV1Schema>;

// Deliverable schema
export const DeliverableV1Schema = z
	.object({
		title: z.string().min(1),
		description: z.string().optional(),
	})
	.strict();
export type DeliverableV1 = z.infer<typeof DeliverableV1Schema>;

// PlanV1 schema
export const PlanV1Schema = z
	.object({
		timeframe: TimeframeEnum.optional(),
		deliverables: z.array(DeliverableV1Schema),
		bundles: z.array(BundleV1Schema).min(1),
		assumptions: z.array(z.string()).optional(),
	})
	.strict();
export type PlanV1 = z.infer<typeof PlanV1Schema>;

// OpenAI Responses API json_schema (strict)
export const openAiJsonSchema = {
	name: "PlanV1",
	description: "Grouper PlanV1: deliverables, bundles and tasks (strict schema)",
	type: "object",
	additionalProperties: false,
	// OpenAI expects the top-level 'required' to list every key present in 'properties'
	required: ["timeframe", "deliverables", "bundles", "assumptions"],
	properties: {
		timeframe: { type: "string", enum: ["twoDay", "oneWeek", "long"] },
		deliverables: {
			type: "array",
			minItems: 0,
			items: {
				type: "object",
				additionalProperties: false,
				// OpenAI requires 'required' to include every key listed in 'properties'
				required: ["title", "description"],
				properties: {
					title: { type: "string" },
					description: { type: "string" },
				},
			},
		},
		bundles: {
			type: "array",
			minItems: 1,
			items: {
				type: "object",
				additionalProperties: false,
							// include every property name here per OpenAI validation rules
							required: ["label", "bundle_title", "bundle_summary", "tasks"],
				properties: {
					label: { type: "string" },
					bundle_title: { type: "string" },
					bundle_summary: { type: "string" },
					tasks: {
						type: "array",
						minItems: 1,
						items: {
							type: "object",
							additionalProperties: false,
							// include every property name here per OpenAI validation rules
							required: ["title", "details", "category", "size", "effort_points"],
							properties: {
								title: { type: "string" },
								details: { type: "string" },
								category: { type: "string", enum: ["Research", "Writing", "Slides", "Coding", "Analysis", "Admin", "Design", "Review"] },
								size: { type: "string", enum: ["S", "M", "L"] },
								effort_points: { type: "integer", enum: [1, 2, 3] },
							},
						},
					},
				},
			},
		},
		assumptions: {
			type: "array",
			items: { type: "string" },
		},
	},
};

// Return only the JSON Schema object (without name/description wrapper)
export function getPlanSchemaObject() {
	const { name, description, ...schema } = openAiJsonSchema as any;
	return schema;
}

/**
 * Build a prompt instructing the model to output a PlanV1 JSON.
 *
 * Input:
 * {
 *   title: string,
 *   description?: string,
 *   timeframe: 'twoDay'|'oneWeek'|'long',
 *   assignment_details: string,
 *   group_size: number
 * }
 *
 * Prompt rules:
 * - Output must be valid JSON matching PlanV1 schema exactly (no extra text).
 * - Produce EXACTLY N bundles where N = group_size; labels must be "Person 1"... "Person N".
 * - Do NOT enforce strict per-bundle task counts. Instead:
 *   - Include `effort_points` for every task (1/2/3) and `size` (S/M/L).
 *   - Enforce mapping S->1, M->2, L->3.
 *   - Balance total effort_points across bundles so the difference between highest and lowest bundle totals is <= 1 when feasible.
 * - Encourage "skill-themed" bundles (1-2 primary categories per bundle).
 * - Timeframe guidance (soft):
 *   - twoDay: prefer lower total effort, direct tasks, and include an integrate/finalize task overall.
 *   - oneWeek: moderate detail; include at least one review task somewhere.
 *   - long: include milestones and at least one Review task per bundle.
 * - Tasks must be concrete/actionable with clear done conditions in `details`.
 * - Do NOT emit questions; assumptions[] allowed but minimal.
 *
 * Example usage:
 * // const prompt = buildPrompt({ title: "Reading Tracker", description: "Track weekly readings", timeframe: "oneWeek", assignment_details: "Build a simple app...", group_size: 3 });
 */
export function buildPrompt(input: { title: string; description?: string; timeframe: Timeframe; assignment_details: string; group_size: number }) {
	const { title, description, timeframe, assignment_details, group_size } = input;
	const n = Math.max(1, Math.min(12, Math.floor(group_size ?? 1)));
	const labels = Array.from({ length: n }, (_, i) => `Person ${i + 1}`).join(", ");
	const reviewRequirement = timeframe === "long" ? "For 'long' timeframe include at least one Review task per bundle." : "";

	return [
		"You are an assistant that MUST produce a single JSON object and nothing else. The JSON must conform exactly to the PlanV1 schema and the following constraints. Do not include any explanatory text, quotes, or commentary — output only the JSON.",
		`Schema: PlanV1 with properties: timeframe, deliverables[], bundles[], assumptions[].`,
		`Produce EXACTLY ${n} bundles. Bundle labels MUST be exactly: ${labels}.`,
		`For each bundle include bundle_title, optional bundle_summary, and tasks[].`,
		`Do NOT enforce strict task counts; instead balance total effort_points across bundles (difference between highest and lowest bundle total <=1 when feasible). ${reviewRequirement}`,
		`Each task MUST include title, details (with a clear done condition), category (one of allowed), size (S/M/L), and effort_points (1/2/3) where S->1, M->2, L->3.`,
		`Bundles should be skill-themed (1-2 primary categories) and avoid concentrating all similar categories in a single bundle unless the assignment requires it.`,
		`Use title and description as context; assignment_details is authoritative for task content.`,
		`Do NOT include any questions in the output.`,
		"",
		title ? `Project title: ${title}` : "",
		description ? `Project description: ${description}` : "",
		"---",
		"Assignment details (authoritative):",
		assignment_details,
		"",
		"Output example shape (for guidance, do not output this example):",
	`{ "timeframe": "${timeframe}", "deliverables": [ { "title": "Example", "description": "..." } ], "bundles": [ { "label": "Person 1", "bundle_title": "Example", "bundle_summary": "...", "tasks": [ { "title": "Do X", "details": "Done when ...", "category":"Research", "size":"S", "effort_points": 1 } ] } ], "assumptions": [] }`,
		"",
		"Return the JSON now.",
	].filter(Boolean).join("\n");
}

export default {
	TimeframeEnum,
	TaskSizeEnum,
	CategoryEnum,
	TaskV1Schema,
	BundleV1Schema,
	DeliverableV1Schema,
	PlanV1Schema,
	openAiJsonSchema,
	buildPrompt,
};


