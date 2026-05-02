import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Vary": "Origin",
} as const;

function jsonResponse(payload: Record<string, unknown>, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
	});
}

async function generateJoinCode(client: any, length = 6, maxRetries = 5): Promise<string> {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	function randomCode(len: number) {
		let code = "";
		const arr = new Uint8Array(len);
		crypto.getRandomValues(arr);
		for (let i = 0; i < len; i++) {
			code += chars[arr[i] % chars.length];
		}
		return code;
	}

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const len = attempt >= 3 ? length + 1 : length;
		const code = randomCode(len);
		const { data } = await client
			.from("projects")
			.select("id")
			.eq("join_code", code)
			.or("deleted_at.is.null,deleted_at.gt." + new Date(Date.now() - 30 * 86400000).toISOString())
			.limit(1);
		if (!data || data.length === 0) return code;
	}

	return randomCode(8);
}

Deno.serve(async (req: Request) => {
	if (req.method === "OPTIONS") {
		return new Response("ok", {
			status: 200,
			headers: {
				...CORS_HEADERS,
				"Content-Type": "text/plain",
				"Access-Control-Allow-Methods": "POST, OPTIONS",
			},
		});
	}

	if (req.method !== "POST") {
		return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
	}

	const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
	if (!authHeader) {
		return jsonResponse({ ok: false, error: "Auth required" }, 401);
	}

	const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("FN_SUPABASE_URL");
	const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("FN_SUPABASE_ANON_KEY");
	const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("FN_SERVICE_ROLE_KEY");
	if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
		console.error("create-project-with-ai: missing Supabase env vars");
		return jsonResponse({ ok: false, error: "Server misconfigured" }, 500);
	}

	const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
		global: { headers: { Authorization: authHeader } },
	});
	const { data: userData, error: userErr } = await userClient.auth.getUser();
	const user = userData?.user ?? null;
	if (userErr || !user) {
		console.error("create-project-with-ai: auth failed", userErr);
		return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
	}

	const body = await req.json().catch(() => null);
	const { name, description, timeframe, assignment_details, group_size, member_names } = body ?? {};
	if (!name || !timeframe || !assignment_details || !group_size) {
		return jsonResponse({ ok: false, error: "Missing required fields" }, 400);
	}

	const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false },
	});

	const now = new Date().toISOString();
	const join_code = await generateJoinCode(serviceClient);

	const { data: project, error: projectErr } = await serviceClient
		.from("projects")
		.insert([
			{
				name,
				description: description ?? null,
				timeframe,
				assignment_details,
				group_size,
				join_code,
				plan_status: "pending",
				created_at: now,
			},
		])
		.select("id")
		.single();

	if (projectErr || !project?.id) {
		console.error("create-project-with-ai: project insert failed", projectErr);
		return jsonResponse({ ok: false, error: "Failed to create project" }, 500);
	}

	await serviceClient.from("project_members").insert([
		{
			project_id: project.id,
			user_id: user.id,
			display_name: Array.isArray(member_names) && member_names[0] ? member_names[0] : null,
			created_at: now,
		},
	]);

	if (Array.isArray(member_names) && member_names.length > 1) {
		const plannedMembers = member_names.slice(1).map((name) => ({
			project_id: project.id,
			display_name: name || "TBD",
		}));
		await serviceClient.from("project_planned_members").insert(plannedMembers);
	}

	return jsonResponse({ ok: true, project_id: project.id, join_code });
});

