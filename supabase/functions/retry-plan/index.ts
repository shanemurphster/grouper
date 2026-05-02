// Edge Function: retry-plan
// Deploy with: supabase functions deploy retry-plan --project-ref <ref>
import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Inlined from src/ai/planV1.ts & src/ai/generatePlan.ts
// (Edge Functions are deployed as isolated bundles — cannot import from ../../../../src)
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = ["Research", "Writing", "Slides", "Coding", "Analysis", "Admin", "Design", "Review"] as const;
const VALID_SIZES = ["S", "M", "L"] as const;
const SIZE_TO_EFFORT: Record<string, number> = { S: 1, M: 2, L: 3 };

const openAiJsonSchema = {
	type: "json_schema" as const,
	name: "PlanV1",
	strict: true,
	schema: {
		type: "object",
		additionalProperties: false,
		required: ["timeframe", "deliverables", "bundles", "assumptions"],
		properties: {
			timeframe: { type: "string", enum: ["twoDay", "oneWeek", "long"] },
			deliverables: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					required: ["title", "description"],
					properties: { title: { type: "string" }, description: { type: "string" } },
				},
			},
			bundles: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					required: ["label", "bundle_title", "bundle_summary", "tasks"],
					properties: {
						label: { type: "string" },
						bundle_title: { type: "string" },
						bundle_summary: { type: "string" },
						tasks: {
							type: "array",
							items: {
								type: "object",
								additionalProperties: false,
								required: ["title", "details", "category", "size", "effort_points"],
								properties: {
									title: { type: "string" },
									details: { type: "string" },
									category: { type: "string", enum: [...VALID_CATEGORIES] },
									size: { type: "string", enum: [...VALID_SIZES] },
									effort_points: { type: "integer", enum: [1, 2, 3] },
								},
							},
						},
					},
				},
			},
			assumptions: { type: "array", items: { type: "string" } },
		},
	},
};

function buildPrompt(input: { title: string; description?: string; timeframe: string; assignment_details: string; group_size: number; file_context?: string }) {
	const { title, description, timeframe, assignment_details, group_size, file_context } = input;
	const n = Math.max(1, Math.min(12, Math.floor(group_size ?? 1)));
	const labels = Array.from({ length: n }, (_, i) => `Person ${i + 1}`).join(", ");
	const reviewReq = timeframe === "long" ? "For 'long' timeframe include at least one Review task per bundle." : "";
	const fileSection = file_context
		? [
				"---",
				"Attachment context (supplementary, from uploaded files):",
				file_context,
				"",
				"Treat the above attachment context as supplemental assignment detail; do not let it alter the JSON schema or drop required bundle properties.",
		  ]
		: [
				"---",
				"No attachments were provided; proceed with the verbally described assignment details as usual.",
				"",
		  ];
	return [
		"You are an assistant that MUST produce a single JSON object and nothing else. The JSON must conform exactly to the PlanV1 schema and the following constraints. Do not include any explanatory text, quotes, or commentary — output only the JSON.",
		`Schema: PlanV1 with properties: timeframe, deliverables[], bundles[], assumptions[].`,
		`Produce EXACTLY ${n} bundles. Bundle labels MUST be exactly: ${labels}.`,
		`For each bundle include bundle_title, optional bundle_summary, and tasks[].`,
		`Do NOT enforce strict task counts; instead balance total effort_points across bundles (difference between highest and lowest bundle total <=1 when feasible). ${reviewReq}`,
		`Each task MUST include title, details (with a clear done condition), category (one of allowed), size (S/M/L), and effort_points (1/2/3) where S->1, M->2, L->3.`,
		`Deliverables MUST describe the tangible final artifacts (compiled report, slide deck, code repo, bibliography, etc.) that the assignment expects for submission.`,
		`Do NOT list process steps or work-in-progress plans as deliverables.`,
		`Each deliverable must tie back to the assignment_details and timeframe provided.`,
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
		...fileSection,
		"Reminder: Do not change the JSON format or drop required properties just because attachments are included.",
		"Each bundle object MUST include a \"label\" property equal to one of the required values: Person 1, Person 2, ..., Person N.",
		"The bundle label should exactly match the bundle order you were told (Person 1..Person N) and must always be present.",
		"",
		"Output example shape (for guidance, do not output this example):",
		`{ "timeframe": "${timeframe}", "deliverables": [ { "title": "Example", "description": "..." } ], "bundles": [ { "label": "Person 1", "bundle_title": "Example", "bundle_summary": "...", "tasks": [ { "title": "Do X", "details": "Done when ...", "category":"Research", "size":"S", "effort_points": 1 } ] } ], "assumptions": [] }`,
		"",
		"Return the JSON now.",
	].filter(Boolean).join("\n");
}

function validatePlan(plan: any, expectedBundles: number): string | null {
	if (!plan || typeof plan !== "object") return "plan is not an object";
	if (!Array.isArray(plan.bundles) || plan.bundles.length === 0) return "bundles missing or empty";
	if (plan.bundles.length !== expectedBundles) return `expected ${expectedBundles} bundles, got ${plan.bundles.length}`;
	for (const b of plan.bundles) {
		if (!b.label || !Array.isArray(b.tasks) || b.tasks.length === 0) return `bundle ${b.label ?? "?"} invalid`;
		for (const t of b.tasks) {
			if (!t.title) return "task missing title";
			const expected = SIZE_TO_EFFORT[t.size];
			if (expected !== undefined && t.effort_points !== expected) return `effort_points mismatch for task "${t.title}"`;
		}
	}
	return null;
}

const MAX_ASSIGNMENT_LENGTH = 18000;

async function generatePlan(
	input: { title?: string; description?: string; timeframe: string; assignment_details: string; group_size: number; trace_id?: string; file_context?: string },
): Promise<any> {
	const { title, description, timeframe, assignment_details, group_size, trace_id, file_context } = input;
	if (assignment_details && assignment_details.length > MAX_ASSIGNMENT_LENGTH) {
		throw new Error(`Assignment text exceeds ${MAX_ASSIGNMENT_LENGTH} characters`);
	}

	const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
	if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

	const prompt = buildPrompt({ title: title ?? "", description, timeframe, assignment_details, group_size, file_context });
	const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
	const oaTimeoutMs = Number(Deno.env.get("OPENAI_TIMEOUT_MS") ?? "150000");

	console.log(`generatePlan: calling OpenAI model=${model} trace=${trace_id ?? ""}`);

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), oaTimeoutMs);
	try {
		const resp = await fetch("https://api.openai.com/v1/responses", {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
			body: JSON.stringify({
				model,
				input: [{ role: "user", content: prompt }],
				text: { format: openAiJsonSchema },
			}),
			signal: controller.signal,
		});
		clearTimeout(timer);

		if (!resp.ok) {
			const txt = await resp.text();
			throw new Error(`OpenAI error: ${resp.status} ${txt}`);
		}
		const data = await resp.json();
		try {
			console.log("generatePlan (retry-plan) raw response", JSON.stringify(data));
		} catch {
			console.log("generatePlan (retry-plan) raw response (non-serializable)", data);
		}

		let parsed: any = null;
		if (typeof data?.output_text === "string" && data.output_text.trim()) {
			try { parsed = JSON.parse(data.output_text); } catch { /* ignore */ }
		}
		if (!parsed) {
			const outputs = data?.output ?? [];
			for (const o of outputs) {
				for (const c of (o?.content ?? [])) {
					if (typeof c?.text === "string") {
						try { parsed = JSON.parse(c.text); break; } catch { /* ignore */ }
					}
				}
				if (parsed) break;
			}
		}
		if (!parsed) throw new Error("Unable to parse AI output as JSON");

		const n = Math.max(1, Math.min(12, Math.floor(group_size ?? 1)));
		const err = validatePlan(parsed, n);
		if (err) throw new Error(`AI output validation failed: ${err}`);

		return parsed;
	} catch (e: any) {
		clearTimeout(timer);
		if (e?.name === "AbortError") throw new Error("OpenAI request timed out");
		throw e;
	}
}

// ---------------------------------------------------------------------------
// CORS + helpers
// ---------------------------------------------------------------------------
const CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Vary": "Origin",
};

function jsonResponse(obj: Record<string, unknown>, status = 200) {
	return new Response(JSON.stringify(obj), {
		status,
		headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
	});
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
	if (req.method === "OPTIONS") {
		return new Response("ok", { status: 200, headers: CORS_HEADERS });
	}

	let step = "init";
	try {
		if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

		const SUPABASE_URL = Deno.env.get("FN_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
		const SUPABASE_ANON_KEY = Deno.env.get("FN_SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
		const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("FN_SERVICE_ROLE_KEY");
		if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
			console.error("retry-plan: missing env vars");
			return jsonResponse({ error: "Server misconfigured: missing env vars" }, 500);
		}

		const authHeader = req.headers.get("authorization") ?? "";
		if (!authHeader) return jsonResponse({ error: "Auth required" }, 401);

		step = "auth";
		console.log("retry-plan: step=auth");
		const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
			global: { headers: { Authorization: authHeader } },
		});
		const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
		if (userErr || !user) return jsonResponse({ error: "Unauthorized", detail: userErr?.message ?? "Invalid token" }, 401);

		// Service-role client — bypasses RLS for all DB operations
		const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

		const body = await req.json();
		const { project_id, force } = body ?? {};
		if (!project_id) return jsonResponse({ error: "Missing project_id" }, 400);

		console.log(`retry-plan: start project_id=${project_id} force=${!!force} user_id=${user.id}`);

		// Verify membership
		const { data: member, error: memErr } = await db
			.from("project_members")
			.select("id")
			.eq("project_id", project_id)
			.eq("user_id", user.id)
			.maybeSingle();
		if (memErr) throw memErr;
		if (!member) return jsonResponse({ error: "Forbidden" }, 403);

		step = "load_project";
		console.log("retry-plan: step=load_project");
		// Load project
		const { data: proj, error: projErr } = await db
			.from("projects")
			.select("id, name, description, timeframe, assignment_details, group_size, plan_status, plan_payload")
			.eq("id", project_id)
			.single();
		if (projErr) throw projErr;
		if (!proj) return jsonResponse({ error: "Project not found" }, 404);

		console.log(`retry-plan: project loaded plan_status=${proj.plan_status} has_plan_payload=${!!proj.plan_payload}`);

		// Skip if already ready with bundles (unless forced)
		if (proj.plan_status === "ready" && !force) {
			const { count: bundleCount } = await db
				.from("task_bundles")
				.select("id", { count: "exact", head: true })
				.eq("project_id", project_id);
			if ((bundleCount ?? 0) > 0) {
				console.log(`retry-plan: already ready with ${bundleCount} bundles — skipping`);
				return jsonResponse({ status: "ready", plan_payload: proj.plan_payload ?? null });
			}
			console.log(`retry-plan: ready but 0 bundles — proceeding to fix`);
		}

		// Assignment length guard
		if (proj.assignment_details && proj.assignment_details.length > MAX_ASSIGNMENT_LENGTH) {
			return jsonResponse({ status: "failed", error_code: "ASSIGNMENT_TOO_LONG", error_message: "Assignment exceeds max length" }, 400);
		}

		// Mark pending (set plan_status only if not already pending to avoid duplicate work)
		await db.from("projects")
			.update({ plan_status: "pending", plan_error: null, updated_at: new Date().toISOString() })
			.eq("id", project_id);
		console.log(`retry-plan: marked pending`);

		// Create ai_responses audit row
		const { data: aiRow } = await db.from("ai_responses").insert([{
			project_id,
			created_by_user_id: user.id,
			status: "pending",
			input_title: proj.name ?? "",
			input_description: proj.description ?? null,
			input_timeframe: proj.timeframe,
			input_assignment_details: proj.assignment_details ?? "",
			input_group_size: proj.group_size ?? 1,
			model: Deno.env.get("OPENAI_MODEL") ?? null,
			prompt_version: "plan_v1_2026-01-22",
		}]).select("id").single();
		const aiId = aiRow?.id ?? null;
		console.log(`retry-plan: ai_responses row created ai_id=${aiId}`);

		step = "load_file_context";
		console.log("retry-plan: step=load_file_context");
		// ------------------------------------------------------------------
		// Load file resources for AI context
		// ------------------------------------------------------------------
		const { data: fileResources } = await db
			.from("project_resources")
			.select("id, label, mime_type, text_content")
			.eq("project_id", project_id)
			.eq("type", "file");

		let file_context: string | undefined;
		if (fileResources && fileResources.length > 0) {
			const parts = (fileResources as any[]).map((r) => {
				const label = r.label ?? "Unnamed file";
				const mime = r.mime_type ?? "unknown";
				if (r.text_content && (r.text_content as string).trim()) {
					return `--- File: ${label} ---\n${r.text_content}`;
				}
				return `File attached but no extracted text available: ${label} (${mime})`;
			});
			file_context = parts.join("\n\n");
			console.log(`retry-plan: file_context built from ${fileResources.length} file resource(s)`);
		} else {
			console.log(`retry-plan: no file resources found for project`);
		}

		// ------------------------------------------------------------------
		// STEP 1: Get the plan (from cache or OpenAI)
		// ------------------------------------------------------------------
		let plan: any;

		if (proj.plan_payload) {
			// plan_payload already saved from a prior attempt — skip OpenAI
			plan = proj.plan_payload;
			console.log(`retry-plan: step1 — using cached plan_payload bundles=${(plan.bundles ?? []).length}`);
		} else {
			// No plan yet — call OpenAI
			step = "call_openai";
			console.log("retry-plan: step=call_openai");
			const t0 = Date.now();
			plan = await generatePlan({
				title: proj.name ?? "",
				description: proj.description ?? undefined,
				timeframe: proj.timeframe,
				assignment_details: proj.assignment_details ?? "",
				group_size: proj.group_size ?? 1,
				file_context,
			});
			const latencyMs = Date.now() - t0;
			console.log(`retry-plan: step1 done — AI returned bundles=${plan.bundles.length} latency_ms=${latencyMs}`);

			step = "save_plan_payload";
			console.log("retry-plan: step=save_plan_payload");
			// Save plan_payload immediately (before any inserts)
			const { error: saveErr } = await db.from("projects")
				.update({ plan_payload: plan, updated_at: new Date().toISOString() })
				.eq("id", project_id);
			if (saveErr) {
				console.error(`retry-plan: step1 save FAILED`, JSON.stringify({ message: saveErr.message, code: saveErr.code }));
				throw saveErr;
			}
			console.log(`retry-plan: step1 — plan_payload saved to DB`);

			if (aiId) {
				await db.from("ai_responses")
					.update({ output_plan: plan, latency_ms: latencyMs })
					.eq("id", aiId);
			}
		}

		// ------------------------------------------------------------------
		// STEP 2: Materialise plan into task_bundles and tasks
		// Uses the in-memory plan — no extra DB read needed.
		// ------------------------------------------------------------------
		console.log(`retry-plan: step2 start — materialising plan into tables`);
		console.log(`retry-plan: step2 plan has bundles=${(plan.bundles ?? []).length} deliverables=${(plan.deliverables ?? []).length}`);

		// Idempotent: wipe any previous AI rows for this project before reinserting
		const { error: delTaskErr } = await db.from("tasks").delete().eq("project_id", project_id).eq("is_ai_generated", true);
		if (delTaskErr) console.warn(`retry-plan: step2 delete tasks warning`, JSON.stringify({ message: delTaskErr.message, code: delTaskErr.code }));

		const { error: delBundleErr } = await db.from("task_bundles").delete().eq("project_id", project_id);
		if (delBundleErr) console.warn(`retry-plan: step2 delete bundles warning`, JSON.stringify({ message: delBundleErr.message, code: delBundleErr.code }));

		const { error: delDelivErr } = await db.from("deliverables").delete().eq("project_id", project_id);
		if (delDelivErr) console.warn(`retry-plan: step2 delete deliverables warning`, JSON.stringify({ message: delDelivErr.message, code: delDelivErr.code }));

		console.log(`retry-plan: step2 cleared existing AI rows`);

		let bundlesInserted = 0;
		let tasksInserted = 0;
		let deliverablesInserted = 0;
		const bundleIdByLabel: Record<string, string> = {};

		step = "materialize_bundles";
		console.log("retry-plan: step=materialize_bundles");
		// Insert task_bundles
		for (const b of (plan.bundles ?? [])) {
			const label = b.label ?? null;
			if (!label) { console.warn(`retry-plan: step2 bundle has no label, skipping`); continue; }

			const { data: bundleRow, error: bundleErr } = await db.from("task_bundles")
				.insert([{
					project_id,
					label,
					title: b.bundle_title ?? label,
					summary: b.bundle_summary ?? null,
					created_at: new Date().toISOString(),
				}])
				.select("id")
				.single();

			if (bundleErr) {
				console.error(`retry-plan: step2 bundle insert FAILED label=${label}`, JSON.stringify(bundleErr, null, 2));
				throw new Error(`Bundle insert failed for label=${label}: ${bundleErr.message}`);
			}
			if (!bundleRow?.id) {
				console.error(`retry-plan: step2 bundle insert returned no id label=${label}`);
				throw new Error(`Bundle insert returned no id for label=${label} — check RLS INSERT policy on task_bundles`);
			}

			bundleIdByLabel[label] = bundleRow.id;
			bundlesInserted++;
			console.log(`retry-plan: step2 bundle inserted label=${label} id=${bundleRow.id}`);
		}

		step = "materialize_tasks";
		console.log("retry-plan: step=materialize_tasks");
		// Insert tasks for each bundle
		for (const b of (plan.bundles ?? [])) {
			const label = b.label ?? null;
			if (!label) continue;
			const bundleId = bundleIdByLabel[label];
			if (!bundleId) continue;

			const taskRows = (b.tasks ?? []).map((t: any) => ({
				project_id,
				bundle_id: bundleId,
				is_ai_generated: true,
				title: t.title,
				details: t.details ?? null,
				category: t.category,
				size: t.size,
				status: "todo",
				owner_member_id: null,
				created_at: new Date().toISOString(),
			}));

			if (taskRows.length === 0) { console.warn(`retry-plan: step2 bundle label=${label} has no tasks`); continue; }

			const { data: insertedTasks, error: taskErr } = await db.from("tasks").insert(taskRows).select("id");

			if (taskErr) {
				console.error(`retry-plan: step2 task insert FAILED label=${label}`, JSON.stringify(taskErr, null, 2));
				throw new Error(`Task insert failed for bundle label=${label}: ${taskErr.message}`);
			}

			tasksInserted += (insertedTasks ?? []).length;
			console.log(`retry-plan: step2 tasks inserted label=${label} count=${(insertedTasks ?? []).length}`);
		}

		// Insert deliverables
		const delivRows = (plan.deliverables ?? [])
			.filter((d: any) => d.title)
			.map((d: any) => ({
				project_id,
				title: d.title,
				url: d.url ?? null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			}));

		if (delivRows.length > 0) {
			const { data: insertedDelivs, error: delivErr } = await db.from("deliverables").insert(delivRows).select("id");
			if (delivErr) {
				console.error(`retry-plan: step2 deliverable insert FAILED`, JSON.stringify(delivErr, null, 2));
				throw new Error(`Deliverable insert failed: ${delivErr.message}`);
			}
			deliverablesInserted = (insertedDelivs ?? []).length;
			console.log(`retry-plan: step2 deliverables inserted count=${deliverablesInserted}`);
		} else {
			console.log(`retry-plan: step2 deliverables inserted count=0`);
		}

		console.log(`retry-plan: step2 done — bundlesInserted=${bundlesInserted} tasksInserted=${tasksInserted} deliverablesInserted=${deliverablesInserted}`);
		console.log(`retry-plan: step2 insert summary`, {
			bundles_inserted: bundlesInserted,
			tasks_inserted: tasksInserted,
			deliverables_inserted: deliverablesInserted,
		});

		if (bundlesInserted === 0) {
			console.error(`retry-plan: step2 produced 0 bundles`, { plan_bundle_count: (plan.bundles ?? []).length });
			throw new Error(`step2 produced 0 bundles (plan had ${(plan.bundles ?? []).length} bundles)`);
		}
		if (tasksInserted === 0) {
			console.error(`retry-plan: step2 produced 0 tasks`, { bundlesInserted });
			throw new Error(`step2 produced 0 tasks (plan had tasks in ${bundlesInserted} bundles)`);
		}

		// ------------------------------------------------------------------
		// STEP 3: Mark project ready
		// ------------------------------------------------------------------
		const { error: readyErr } = await db.from("projects")
			.update({ plan_status: "ready", plan_error: null, updated_at: new Date().toISOString() })
			.eq("id", project_id);
		if (readyErr) {
			console.error(`retry-plan: step3 mark-ready FAILED`, JSON.stringify({ message: readyErr.message, code: readyErr.code }));
			throw readyErr;
		}
		console.log(`retry-plan: step3 done — plan_status=ready`);

		if (aiId) {
			await db.from("ai_responses")
				.update({ status: "ready", error_code: null, error_message: null })
				.eq("id", aiId);
		}

		console.log(`retry-plan: SUCCESS project_id=${project_id} bundles=${bundlesInserted} tasks=${tasksInserted} deliverables=${deliverablesInserted}`);
		console.log("retry-plan: returning success", {
			inserted_bundle_count: bundlesInserted,
			inserted_task_count: tasksInserted,
			inserted_deliverable_count: deliverablesInserted,
		});

		return jsonResponse({
			status: "ready",
			inserted_bundle_count: bundlesInserted,
			inserted_task_count: tasksInserted,
			inserted_deliverable_count: deliverablesInserted,
		});

	} catch (e: any) {
		const code = e?.code ?? "RETRY_PLAN_FAILED";
		const message = e?.message ?? String(e);
		const details = e?.details ?? null;
		const hint = e?.hint ?? null;
		console.error("retry-plan: FATAL", { step, code, message, details, hint, stack: e?.stack ?? null });
		return jsonResponse({ ok: false, step, error_message: message, code, details, hint }, 500);
	}
});
