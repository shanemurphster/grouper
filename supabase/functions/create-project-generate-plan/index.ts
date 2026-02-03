// Edge Function: create-project-generate-plan
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
		const { name, description, timeframe, assignment_details, group_size, member_names } = body;
		if (!name || !timeframe || !assignment_details || !group_size) {
			return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
		}

		const now = new Date().toISOString();
		// create project with pending plan_status
		const { data: proj, error: pErr } = await supabase
			.from("projects")
			.insert([{ name, timeframe, assignment_details, description: description ?? null, group_size, plan_status: "pending", created_at: now }])
			.select("*")
			.single();
		if (pErr) throw pErr;
		const projectId = proj.id;

		// add creator as member
		const creatorDisplay = (Array.isArray(member_names) && member_names[0]) || null;
		await supabase.from("project_members").insert([{ project_id: projectId, user_id: user.id, display_name: creatorDisplay ?? null, created_at: now }]);

		// planned members
		if (Array.isArray(member_names) && member_names.length > 1) {
			const planned = member_names.slice(1).map((n: string) => ({ project_id: projectId, display_name: n || "TBD" }));
			await supabase.from("project_planned_members").insert(planned);
		}

		// Call generatePlan server-side
		try {
		// insert ai_responses audit row
		const start = Date.now();
		const { data: aiRow } = await supabase
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
					model: process.env.OPENAI_MODEL ?? "stub",
					prompt_version: "plan_v1_2026-01-22",
				},
			])
			.select("*")
			.single();
		const aiId = aiRow?.id ?? null;

		const plan = await generatePlan({ title: name, description: description ?? undefined, timeframe, assignment_details, group_size });
		const latency = Date.now() - start;

		// persist plan payload (JSONB) and mark ready
		await supabase.from("projects").update({ plan_payload: plan, plan_status: "ready", updated_at: new Date().toISOString() }).eq("id", projectId);

		// update ai_responses row
		if (aiId) {
			await supabase
				.from("ai_responses")
				.update({ status: "ready", output_plan: plan, latency_ms: latency, tokens_in: null, tokens_out: null, error_code: null, error_message: null })
				.eq("id", aiId);
		}

		return new Response(JSON.stringify({ project_id: projectId, plan_status: "ready" }), { status: 200 });
		} catch (e: any) {
			// mark failed but return project id
			const code = e?.code ?? "AI_CALL_FAILED";
			const message = e?.message ?? String(e);
			await supabase.from("projects").update({ plan_status: "failed", plan_error: `${code}: ${message}`, updated_at: new Date().toISOString() }).eq("id", projectId);
			return new Response(JSON.stringify({ project_id: projectId, plan_status: "failed", error: `${code}: ${message}` }), { status: 200 });
		}
	} catch (e: any) {
		console.error("create-project-generate-plan error", e);
		return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500 });
	}
}


