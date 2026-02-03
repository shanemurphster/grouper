// Edge Function: create-project-with-ai
// Deploy with: supabase functions deploy create-project-with-ai --project-ref <ref>
// Deno-compatible import (JSR) for Supabase client
import { createClient } from "jsr:@supabase/supabase-js@2";
import generatePlan from "../../../../src/ai/generatePlan";

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

		// Read envs now (after OPTIONS/ping) and create a per-request Supabase client scoped with the user's JWT.
		const EXPO_PUBLIC_SUPABASE_URL = Deno.env.get("EXPO_PUBLIC_SUPABASE_URL")!;
		const EXPO_PUBLIC_SUPABASE_ANON_KEY = Deno.env.get("EXPO_PUBLIC_SUPABASE_ANON_KEY")!;
		const client = createClient(EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });

		// verify token and user
		const { data: userData, error: userErr } = await client.auth.getUser(token);
		if (userErr || !userData?.user) {
			console.error(`auth failed trace=${traceId} reason=${userErr?.message ?? "unknown"}`);
			return jsonResponse({ ok: false, step: "auth", error: "Invalid auth token" }, 401);
		}
		const user = userData.user;
		console.log(`auth ok trace=${traceId} user_id=${user.id}`);

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

		// create project
		const { data: proj, error: pErr } = await client
			.from("projects")
			.insert([{ name, timeframe, assignment_details, description: description ?? null, group_size, plan_status: "pending", created_at: now }])
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


