// Edge Function: create-project-with-ai
// Deploy with: supabase functions deploy create-project-with-ai --project-ref <ref>
// Deno-compatible import (JSR) for Supabase client
import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Inlined from src/ai/planV1.ts & src/ai/generatePlan.ts
// (Edge Functions are deployed as isolated bundles — cannot import from ../../../../src)
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = ["Research", "Writing", "Slides", "Coding", "Analysis", "Admin", "Design", "Review"] as const;
const VALID_SIZES = ["S", "M", "L"] as const;
const SIZE_TO_EFFORT: Record<string, number> = { S: 1, M: 2, L: 3 };

/** OpenAI Responses API text.format for PlanV1 (strict structured output). */
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

function buildPrompt(input: { title: string; description?: string; timeframe: string; assignment_details: string; group_size: number }) {
	const { title, description, timeframe, assignment_details, group_size } = input;
	const n = Math.max(1, Math.min(12, Math.floor(group_size ?? 1)));
	const labels = Array.from({ length: n }, (_, i) => `Person ${i + 1}`).join(", ");
	const reviewReq = timeframe === "long" ? "For 'long' timeframe include at least one Review task per bundle." : "";
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
		"Output example shape (for guidance, do not output this example):",
		`{ "timeframe": "${timeframe}", "deliverables": [ { "title": "Example", "description": "..." } ], "bundles": [ { "label": "Person 1", "bundle_title": "Example", "bundle_summary": "...", "tasks": [ { "title": "Do X", "details": "Done when ...", "category":"Research", "size":"S", "effort_points": 1 } ] } ], "assumptions": [] }`,
		"",
		"Return the JSON now.",
	].filter(Boolean).join("\n");
}

/** Lightweight validation (replaces Zod — no npm dependency needed in Deno). */
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

/** Call OpenAI Responses API via fetch (Deno-compatible, no npm SDK needed). */
async function generatePlan(
	input: { title?: string; description?: string; timeframe: string; assignment_details: string; group_size: number; trace_id?: string },
): Promise<any> {
	const { title, description, timeframe, assignment_details, group_size, trace_id } = input;
	if (assignment_details && assignment_details.length > MAX_ASSIGNMENT_LENGTH) {
		throw new Error(`Assignment text exceeds ${MAX_ASSIGNMENT_LENGTH} characters`);
	}

	const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
	if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

	const prompt = buildPrompt({ title: title ?? "", description, timeframe, assignment_details, group_size });
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

		// Extract JSON from response (output_text → output[].content[].text)
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

/** Generate a random uppercase alphanumeric join code. Retry on collision, fallback to length 7. */
async function generateJoinCode(
	client: any,
	length = 6,
	maxRetries = 5,
): Promise<string> {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
	function randomCode(len: number) {
		let code = "";
		const arr = new Uint8Array(len);
		crypto.getRandomValues(arr);
		for (let i = 0; i < len; i++) code += chars[arr[i] % chars.length];
		return code;
	}
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const len = attempt >= 3 ? length + 1 : length; // fallback to longer code after 3 collisions
		const code = randomCode(len);
		// Check collision: only active projects (deleted_at IS NULL) or recently deleted (< 30 days)
		const { data } = await client
			.from("projects")
			.select("id")
			.eq("join_code", code)
			.or("deleted_at.is.null,deleted_at.gt." + new Date(Date.now() - 30 * 86400000).toISOString())
			.limit(1);
		if (!data || data.length === 0) return code;
		console.log(`join code collision attempt=${attempt} code=${code}`);
	}
	// last resort: 8-char code (astronomically unlikely to collide)
	return randomCode(8);
}

// ---------------------------------------------------------------------------

// Hardened CORS headers constant (top-level, safe)
const CORS_HEADERS_BASE = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Vary": "Origin",
};

// Use Deno.serve for Supabase Edge Functions runtime compatibility.
// The handler must return quickly for OPTIONS; avoid doing any work before responding to preflight.
Deno.serve(async (req: Request) => {
	// quick metadata
	const url = new URL(req.url);

	// compute requested CORS values to echo back on OPTIONS
	const reqHeaders = req.headers.get("access-control-request-headers") ?? "authorization, content-type";
	const reqMethod = req.headers.get("access-control-request-method") ?? "POST";

	// Build final CORS headers for responses (we'll merge these into every response)
	function mergeCors(headers: Record<string, string> = {}) {
		return {
			...CORS_HEADERS_BASE,
			...headers,
		};
	}

	// Handle preflight quickly and deterministically with 200 OK and proper headers
	if (req.method === "OPTIONS") {
		const headers = mergeCors({
			"Access-Control-Allow-Headers": reqHeaders,
			"Access-Control-Allow-Methods": "POST, OPTIONS",
			"Content-Type": "text/plain",
		});
		return new Response("ok", { status: 200, headers });
	}

	// finalize traceId early (can be overridden by body.trace_id after parsing)
	let traceId = req.headers.get("x-request-id") ?? (typeof crypto !== "undefined" && (crypto as any).randomUUID ? (crypto as any).randomUUID() : `${Date.now()}`);

	// Parse shallow body only after OPTIONS handled; allow fast ping path via query or body
	let body: any = null;
	let bodyText: string | null = null;
	if (req.method === "POST") {
		try {
			bodyText = await req.text();
			if (bodyText && bodyText.length > 0) {
				try {
					body = JSON.parse(bodyText);
				} catch {
					// non-JSON bodies are fine; leave body null
					body = null;
				}
			}
		} catch {
			body = null;
		}
	}

	// Ping shortcut: either ?ping=1 or body.debug_ping === true
	if (url.searchParams.get("ping") === "1" || (body && body.debug_ping === true)) {
		const headers = mergeCors({ "Content-Type": "application/json" });
		return new Response(JSON.stringify({ ok: true, trace_id: traceId, step: "ping" }), { status: 200, headers });
	}

	// allow client to override trace id in body
	if (body && body.trace_id) traceId = String(body.trace_id);

	// helper to return json with CORS and include trace id
	function jsonResponse(obj: any, status = 200) {
		const headers = mergeCors({ "Content-Type": "application/json" });
		return new Response(JSON.stringify({ ...obj, trace_id: traceId }), { status, headers });
	}

	// global start time for duration logging
	const t0 = Date.now();

	// Only now begin request processing that may touch envs, logging or DB
	try {
		// keep logs but after OPTIONS/ping
		console.log(`create-with-ai: start trace=${traceId} method=${req.method}`);
		if (req.method !== "POST") return jsonResponse({ ok: false, step: "method", error: "Method not allowed" }, 405);

		const authHeader = req.headers.get("authorization") ?? "";
		console.log(`auth header present: ${authHeader ? "true" : "false"}`);
		const token = authHeader.replace(/^Bearer\s+/i, "").trim();
		if (!token) return jsonResponse({ ok: false, step: "auth", error: "Auth required" }, 401);

		// Read envs now (after OPTIONS/ping).
		// Use anon key client only for auth verification, then service role client for DB writes.
		// ES256 user JWTs can't be validated by PostgREST for RLS, so the service role
		// bypasses RLS while the function manually verifies identity via auth.getUser().
		const FN_SUPABASE_URL = Deno.env.get("FN_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
		const FN_SUPABASE_ANON_KEY = Deno.env.get("FN_SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
		const FN_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("FN_SERVICE_ROLE_KEY");
		if (!FN_SUPABASE_URL || !FN_SUPABASE_ANON_KEY) {
			console.error(`create-with-ai: missing supabase envs trace=${traceId}`);
			return jsonResponse({ ok: false, step: "env", error: "Missing Supabase env vars" }, 500);
		}

		// Auth client — uses anon key + user JWT to verify identity
		const authClient = createClient(FN_SUPABASE_URL, FN_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });

		// verify token and user
		const { data: userData, error: userErr } = await authClient.auth.getUser(token);
		if (userErr || !userData?.user) {
			console.error(`auth failed trace=${traceId} reason=${userErr?.message ?? "unknown"}`);
			return jsonResponse({ ok: false, step: "auth", error: "Invalid auth token" }, 401);
		}
		const user = userData.user;
		console.log(`auth ok trace=${traceId} user_id=${user.id}`);

		// DB client — use service role key (bypasses RLS) if available, else fall back to user JWT client
		const dbKey = FN_SERVICE_ROLE_KEY ?? FN_SUPABASE_ANON_KEY;
		const client = createClient(FN_SUPABASE_URL, dbKey, {
			global: { headers: FN_SERVICE_ROLE_KEY ? { Authorization: `Bearer ${FN_SERVICE_ROLE_KEY}` } : { Authorization: `Bearer ${token}` } },
		});
		console.log(`db client mode trace=${traceId} service_role=${Boolean(FN_SERVICE_ROLE_KEY)}`);

		// If body wasn't JSON-parsed above (e.g., empty text), attempt to parse now from bodyText
		const parsedBody = body ?? (bodyText ? (() => { try { return JSON.parse(bodyText); } catch { return null; } })() : null);
		const { name, description, timeframe, assignment_details, group_size, member_names, debug_skip_openai } = parsedBody ?? {};

		console.log(`body parsed trace=${traceId} debug_skip_openai=${debug_skip_openai ? "true" : "false"}`);
		// log a summary of body lengths (avoid logging large assignment text)
		console.log(`create-with-ai: trace=${traceId} bodySummary nameLen=${String(name ?? "").length} descriptionLen=${String(description ?? "").length} assignmentDetailsLen=${String(assignment_details ?? "").length} groupSize=${group_size}`);
		if (!name || !timeframe || !assignment_details || !group_size) {
			return jsonResponse({ ok: false, step: "validate", error: "Missing required fields" }, 400);
		}

		const now = new Date().toISOString();

		// generate unique join code
		const join_code = await generateJoinCode(client);
		console.log(`join code generated trace=${traceId} code=${join_code}`);

		// create project
		const { data: proj, error: pErr } = await client
			.from("projects")
			.insert([{ name, timeframe, assignment_details, description: description ?? null, group_size, join_code, plan_status: "pending", created_at: now }])
			.select("*")
			.single();
		if (pErr) throw pErr;
		const projectId = proj.id;
		console.log(`insert project ok trace=${traceId} project_id=${projectId}`);

		// add creator member
		const creatorDisplay = (Array.isArray(member_names) && member_names[0]) || null;
		await client.from("project_members").insert([{ project_id: projectId, user_id: user.id, display_name: creatorDisplay ?? null, created_at: now }]);

		// planned members
		if (Array.isArray(member_names) && member_names.length > 1) {
			const planned = member_names.slice(1).map((n: string) => ({ project_id: projectId, display_name: n || "TBD" }));
			await client.from("project_planned_members").insert(planned);
		}

		// create ai_responses audit row
		const start = Date.now();
		console.log(`db insert project start trace=${traceId}`);
		const { data: aiRow } = await client
			.from("ai_responses")
			.insert([
				{
					project_id: projectId,
					created_by_user_id: user.id,
					status: "pending",
					input_title: name,
					input_description: description ?? null,
					input_timeframe: timeframe,
					input_assignment_details: assignment_details,
					input_group_size: group_size,
					model: Deno.env.get("OPENAI_MODEL") ?? null,
					prompt_version: "plan_v1_2026-01-22",
				},
			])
			.select("*")
			.single();
		const aiId = aiRow?.id ?? null;

		console.log(`db insert project ok trace=${traceId} ai_id=${aiId}`);

		// if debug flag set, skip OpenAI call and return early for debugging
		if (debug_skip_openai === true) {
			console.log(`debug_skip_openai true trace=${traceId} returning early`);
			await client.from("projects").update({ plan_status: "ready", updated_at: new Date().toISOString() }).eq("id", projectId);
			console.log(`duration_ms trace=${traceId}`, Date.now() - t0);
			return jsonResponse({ ok: true, project_id: projectId }, 200);
		}

		try {
			console.log(`generatePlan: start trace=${traceId}`);
			// Use shared generatePlan to ensure parity with local ai:test harness
			const plan = await generatePlan({ title: name, description: description ?? undefined, timeframe, assignment_details, group_size, trace_id: traceId });
			console.log(`generatePlan: parsed ok trace=${traceId} bundles=${(plan?.bundles ?? []).length}`);
			const latency = Date.now() - start;

			console.log(`persistPlan start trace=${traceId}`);
			// Upsert bundles (durable)
			const { data: existingBundles } = await client.from("task_bundles").select("id,label,claimed_by_member_id").eq("project_id", projectId);
			const existingByLabel: Record<string, any> = {};
			(existingBundles ?? []).forEach((b: any) => {
				if (b.label) existingByLabel[b.label] = b;
			});

			const bundleIdByLabel: Record<string, string> = {};
			let bundlesInserted = 0;
			let tasksInserted = 0;
			for (const b of plan.bundles) {
				const label = b.label ?? null;
				if (!label) continue;
				const existing = existingByLabel[label];
				if (existing) {
					await client
						.from("task_bundles")
						.update({ title: b.bundle_title ?? label, summary: b.bundle_summary ?? null, updated_at: new Date().toISOString() })
						.eq("id", existing.id);
					bundleIdByLabel[label] = existing.id;
				} else {
					const { data: inserted, error: insErr } = await client
						.from("task_bundles")
						.insert([{ project_id: projectId, label, title: b.bundle_title ?? label, summary: b.bundle_summary ?? null, created_at: new Date().toISOString() }])
						.select("*")
						.single();
					if (insErr) throw insErr;
					bundleIdByLabel[label] = inserted.id;
					bundlesInserted++;
				}
			}

			// Replace AI tasks per bundle (delete only is_ai_generated)
			for (const b of plan.bundles) {
				const label = b.label ?? null;
				if (!label) continue;
				const bundleId = bundleIdByLabel[label];
				if (!bundleId) continue;
				const claimedRow = existingByLabel[label];
				const claimedMemberId = claimedRow?.claimed_by_member_id ?? null;

				// delete AI-generated tasks for this bundle
				await client.from("tasks").delete().eq("bundle_id", bundleId).eq("is_ai_generated", true);

				// insert new AI tasks; preserve claim by assigning owner if bundle claimed
				const tasksToInsert: any[] = [];
				for (const t of b.tasks) {
					tasksToInsert.push({
						project_id: projectId,
						title: t.title,
						details: t.details ?? null,
						category: t.category,
						size: t.size,
						status: "todo",
						owner_member_id: claimedMemberId ?? null,
						bundle_id: bundleId,
						is_ai_generated: true,
						created_at: new Date().toISOString(),
					});
				}
				if (tasksToInsert.length > 0) {
					const { data: tiData, error: tiErr } = await client.from("tasks").insert(tasksToInsert).select("id");
					if (tiErr) throw tiErr;
					tasksInserted += (tiData ?? []).length;
				}
			}

			// Replace AI-generated deliverables
			await client.from("deliverables").delete().eq("project_id", projectId).eq("is_ai_generated", true);
			const deliverablesToInsert = (plan.deliverables ?? [])
				.filter((d: any) => d.title)
				.map((d: any) => ({
					project_id: projectId,
					title: d.title,
					description: d.description ?? null,
					url: d.url ?? null,
					is_ai_generated: true,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				}));
			if (deliverablesToInsert.length > 0) {
				await client.from("deliverables").insert(deliverablesToInsert);
			}

			console.log(`persistPlan ok trace=${traceId} bundles_inserted=${bundlesInserted} tasks_inserted=${tasksInserted}`);

			// update project plan status/payload and AI row
			await client.from("projects").update({ plan_payload: plan, plan_status: "ready", plan_error: null, updated_at: new Date().toISOString() }).eq("id", projectId);
			if (aiId) {
				await client.from("ai_responses").update({ status: "ready", output_plan: plan, latency_ms: latency, error_code: null, error_message: null }).eq("id", aiId);
			}

			console.log(`return success trace=${traceId} project_id=${projectId}`);
			console.log(`duration_ms trace=${traceId}`, Date.now() - t0);
			return jsonResponse({ ok: true, project_id: projectId }, 200);
		} catch (e: any) {
			const code = e?.code ?? "GENERATE_OR_PERSIST_FAILED";
			const message = e?.message ?? String(e);
			console.error(`persistPlan error trace=${traceId}`, { code, message, stack: e?.stack });
			await client.from("projects").update({ plan_status: "failed", plan_error: `${code}: ${message}`, updated_at: new Date().toISOString() }).eq("id", projectId);
			if (aiId) {
				await client.from("ai_responses").update({ status: "failed", error_code: code, error_message: message }).eq("id", aiId);
			}
			console.log(`duration_ms trace=${traceId}`, Date.now() - t0);
			return jsonResponse({ ok: false, step: "persistPlan", error: `${code}: ${message}`, stack: Deno.env.get("ENV") === "development" ? e?.stack : undefined }, 500);
		}
	} catch (e: any) {
		console.error("create-project-with-ai error", e);
		console.log(`duration_ms trace=${Date.now() - t0}`);
		return jsonResponse({ ok: false, step: "handler", error: String(e?.message ?? e), stack: Deno.env.get("ENV") === "development" ? e?.stack : undefined }, 500);
	}
});


