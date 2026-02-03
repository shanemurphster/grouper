// Edge Function: retry-plan
import { createClient } from "@supabase/supabase-js";
import generatePlan from "../../../../src/ai/generatePlan";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

export default async function handler(req: Request) {
	try {
		if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
		const authHeader = req.headers.get("authorization") ?? "";
		const token = authHeader.replace(/^Bearer\s+/i, "").trim();
		if (!token) return new Response(JSON.stringify({ error: "Auth required" }), { status: 401 });
		const { data: userData, error: userErr } = await supabase.auth.getUser(token);
		if (userErr || !userData?.user) return new Response(JSON.stringify({ error: "Invalid auth token" }), { status: 401 });
		const user = userData.user;

		const body = await req.json();
		const { project_id, force } = body ?? {};
		if (!project_id) return new Response(JSON.stringify({ error: "Missing project_id" }), { status: 400 });

		// verify membership
		const { data: member, error: memErr } = await supabase
			.from("project_members")
			.select("id")
			.eq("project_id", project_id)
			.eq("user_id", user.id)
			.maybeSingle();
		if (memErr) throw memErr;
		if (!member) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

		// load project fields (include name/description for context)
		const { data: proj, error: projErr } = await supabase
			.from("projects")
			.select("id, name, description, timeframe, assignment_details, group_size, plan_status, plan_payload")
			.eq("id", project_id)
			.single();
		if (projErr) throw projErr;
		if (!proj) return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });

		// guard: if already pending, return pending
		if (proj.plan_status === "pending") {
			return new Response(JSON.stringify({ status: "pending" }), { status: 200 });
		}
		// if ready and not forced, return early
		if (proj.plan_status === "ready" && !force) {
			return new Response(JSON.stringify({ status: "ready", plan_payload: proj.plan_payload ?? null }), { status: 200 });
		}

		// ensure assignment length not too long (generatePlan also enforces)
		if (proj.assignment_details && proj.assignment_details.length > 18000) {
			return new Response(JSON.stringify({ status: "failed", error_code: "ASSIGNMENT_TOO_LONG", error_message: "Assignment exceeds max length" }), { status: 400 });
		}

		// attempt to claim work: set plan_status = 'pending' only if not already pending
		const { data: claimed, error: claimErr } = await supabase
			.from("projects")
			.update({ plan_status: "pending", plan_error: null, updated_at: new Date().toISOString() })
			.eq("id", project_id)
			.neq("plan_status", "pending")
			.select("plan_status")
			.single();
		if (claimErr) throw claimErr;
		// If update didn't return a row, another process may have set pending
		if (!claimed) {
			return new Response(JSON.stringify({ status: "pending" }), { status: 200 });
		}

		// call generatePlan and log ai_responses
		const start = Date.now();
		const { data: aiRow } = await supabase
			.from("ai_responses")
			.insert([
				{
					project_id,
					created_by_user_id: user.id,
					status: "pending",
					input_title: proj.name ?? "",
					input_description: proj.description ?? null,
					input_timeframe: proj.timeframe,
					input_assignment_details: proj.assignment_details ?? "",
					input_group_size: proj.group_size ?? 1,
					model: process.env.OPENAI_MODEL ?? null,
					prompt_version: "plan_v1_2026-01-22",
				},
			])
			.select("*")
			.single();
		const aiId = aiRow?.id ?? null;

		try {
			const plan = await generatePlan({
				title: proj.name ?? "",
				description: proj.description ?? undefined,
				timeframe: proj.timeframe,
				assignment_details: proj.assignment_details ?? "",
				group_size: proj.group_size ?? 1,
			});
			const latency = Date.now() - start;
			// persist plan_payload and mark ready
			await supabase
				.from("projects")
				.update({ plan_payload: plan, plan_status: "ready", plan_error: null, updated_at: new Date().toISOString() })
				.eq("id", project_id);
			// update ai_responses
			if (aiId) {
				await supabase
					.from("ai_responses")
					.update({ status: "ready", output_plan: plan, latency_ms: latency, error_code: null, error_message: null })
					.eq("id", aiId);
			}
			return new Response(JSON.stringify({ status: "ready", plan_payload: plan }), { status: 200 });
		} catch (e: any) {
			const code = e?.code ?? "AI_CALL_FAILED";
			const message = e?.message ?? String(e);
			await supabase
				.from("projects")
				.update({ plan_status: "failed", plan_error: `${code}: ${message}`, updated_at: new Date().toISOString() })
				.eq("id", project_id);
			if (aiId) {
				await supabase.from("ai_responses").update({ status: "failed", error_code: code, error_message: message }).eq("id", aiId);
			}
			return new Response(JSON.stringify({ status: "failed", error_code: code, error_message: message }), { status: 200 });
		}
	} catch (e: any) {
		console.error("retry-plan error", e);
		return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500 });
	}
}


