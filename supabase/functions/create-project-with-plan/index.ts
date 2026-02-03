// Supabase Edge Function: create-project-with-plan
// Inserts a project, members, planned members, calls OpenAI to generate a PlanV1,
// inserts task_bundles and tasks, and sets project.plan_status accordingly.

import { createClient } from "@supabase/supabase-js";
import { PlanV1Schema, openAiJsonSchema, buildPrompt } from "../../../../src/ai/planV1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

export default async function handler(req: Request) {
	try {
		if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

		const authHeader = req.headers.get("authorization") ?? "";
		const token = authHeader.replace(/^Bearer\s+/i, "").trim();
		if (!token) return new Response(JSON.stringify({ error: "Auth required" }), { status: 401 });

		// Get user from access token
		const { data: userData, error: userErr } = await supabase.auth.getUser(token);
		if (userErr || !userData?.user) {
			return new Response(JSON.stringify({ error: "Invalid auth token" }), { status: 401 });
		}
		const user = userData.user;

		const body = await req.json();
		const { name, description, timeframe, assignment_details, member_names } = body;
		if (!name || !timeframe || !assignment_details) {
			return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
		}

		// 1) Insert project row with plan_status pending
		const now = new Date().toISOString();
		const { data: projData, error: projErr } = await supabase
			.from("projects")
			.insert([{ name, timeframe, assignment_details, description: description ?? null, plan_status: "pending", created_at: now }])
			.select("*")
			.single();
		if (projErr) throw projErr;
		const projectId = projData.id;

		// 2) Insert creator as project_member
		// Use provided member_names[0] as display name fallback
		const creatorDisplay = (Array.isArray(member_names) && member_names[0]) || null;
		await supabase.from("project_members").insert([{ project_id: projectId, user_id: user.id, display_name: creatorDisplay ?? null, created_at: now }]);

		// 3) Insert planned members for the remaining member_names
		if (Array.isArray(member_names) && member_names.length > 1) {
			const planned = member_names.slice(1).map((n: string) => ({ project_id: projectId, display_name: n || "TBD" }));
			await supabase.from("project_planned_members").insert(planned);
		}

		// 4) Build prompt using portable module
		const prompt = buildPrompt({ project: { id: projectId, name, description }, timeframe, memberNames: member_names ?? [] });

		// 5) Call OpenAI Responses API with json_schema
		let planStatus = "failed";
		try {
			const resp = await fetch("https://api.openai.com/v1/responses", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${OPENAI_API_KEY}`,
				},
				body: JSON.stringify({
					model: OPENAI_MODEL,
					input: prompt,
					// Provide json_schema instructions in the top-level field expected by the Responses API
					json_schema: {
						name: openAiJsonSchema.name ?? "PlanV1",
						schema: openAiJsonSchema,
						url: null,
					},
					// strict enforcement
					// Note: some OpenAI SDKs may support `response_format` or `text_format`, adapt as needed.
				}),
			});
			if (!resp.ok) {
				const text = await resp.text();
				console.error("OpenAI call failed", resp.status, text);
				throw new Error("OpenAI request failed");
			}
			const data = await resp.json();
			// Responses API returns parsed JSON in output[0].content[0]. If json_schema used, often in data.output[0].content[0]. If uncertain, attempt to find it.
			let contentObj: any = null;
			try {
				const outputs = data.output ?? data.outputs ?? data.results ?? null;
				if (Array.isArray(outputs) && outputs.length > 0) {
					// try common paths
					const o = outputs[0];
					if (o?.content && Array.isArray(o.content) && o.content.length > 0) {
						contentObj = o.content.find((c: any) => c.type === "application/json")?.data ?? o.content[0]?.text ?? null;
					} else if (o?.message?.content) {
						// some variants: message.content[0].json
						contentObj = o.message.content?.find((c: any) => c.type === "application/json")?.data ?? null;
					} else if (o?.text) {
						contentObj = o.text;
					}
				}
			} catch (e) {
				console.error("Failed to extract JSON from OpenAI response", e, data);
			}

			// If contentObj is a string, attempt to parse JSON
			let parsedPlan: any = null;
			if (!contentObj && typeof data === "object") {
				// sometimes the Responses API provides a 'response' field
				parsedPlan = data?.output?.[0]?.content?.[0]?.json ?? null;
			}
			if (!parsedPlan) {
				if (typeof contentObj === "string") {
					try {
						parsedPlan = JSON.parse(contentObj);
					} catch (e) {
						console.error("OpenAI returned non-JSON content", contentObj);
						throw new Error("OpenAI returned non-JSON content");
					}
				} else if (typeof contentObj === "object" && contentObj !== null) {
					parsedPlan = contentObj;
				} else {
					// fallback: attempt to parse first text block
					const maybeText = JSON.stringify(data);
					try {
						parsedPlan = JSON.parse(maybeText);
					} catch {
						throw new Error("Unable to parse plan from OpenAI response");
					}
				}
			}

			// Validate plan with schema
			const parsed = PlanV1Schema.safeParse(parsedPlan);
			if (!parsed.success) {
				console.error("PlanV1 validation failed", parsed.error.format ? parsed.error.format() : parsed.error);
				throw new Error("Plan validation failed");
			}
			const plan = parsed.data;

			// 6) Insert bundles into task_bundles
			const bundlesToInsert = plan.bundles.map((b) => ({
				project_id: projectId,
				title: b.title,
				summary: b.summary ?? null,
				total_points: b.total_points ?? null,
				claimed_by_member_id: null,
				created_at: new Date().toISOString(),
			}));
			const { data: insertedBundles, error: bundleErr } = await supabase.from("task_bundles").insert(bundlesToInsert).select("*");
			if (bundleErr) throw bundleErr;

			// 7) Insert tasks with bundle_id
			const tasksToInsert: any[] = [];
			for (let i = 0; i < plan.bundles.length; i++) {
				const b = plan.bundles[i];
				const insertedBundle = insertedBundles[i];
				for (const t of b.tasks) {
					tasksToInsert.push({
						project_id: projectId,
						title: t.title,
						details: t.details ?? null,
						category: "Research", // default category; consumer UI can edit
						status: "todo",
						size: t.size,
						created_at: new Date().toISOString(),
						bundle_id: insertedBundle.id,
						owner_member_id: null,
					});
				}
			}
			if (tasksToInsert.length > 0) {
				const { error: tasksErr } = await supabase.from("tasks").insert(tasksToInsert);
				if (tasksErr) throw tasksErr;
			}

			planStatus = "ready";
		} catch (e) {
			console.error("AI/plan generation failed", e);
			planStatus = "failed";
		}

		// 8) Update project.plan_status final value
		try {
			await supabase.from("projects").update({ plan_status: planStatus, updated_at: new Date().toISOString() }).eq("id", projectId);
		} catch (e) {
			console.error("Failed to update project plan_status", e);
		}

		return new Response(JSON.stringify({ project_id: projectId, plan_status: planStatus }), { status: 200 });
	} catch (e: any) {
		console.error("create-project-with-plan error", e);
		return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500 });
	}
}


