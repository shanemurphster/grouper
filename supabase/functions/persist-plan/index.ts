// Edge Function: persist-plan
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

		// load project fields (include name/description)
		const { data: proj, error: projErr } = await supabase
			.from("projects")
			.select("id, name, description, timeframe, assignment_details, group_size, plan_status")
			.eq("id", project_id)
			.single();
		if (projErr) throw projErr;
		if (!proj) return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });

		// guard: if pending, return
		if (proj.plan_status === "pending") return new Response(JSON.stringify({ status: "pending" }), { status: 200 });
		// if ready and not forced, return
		if (proj.plan_status === "ready" && !force) {
			return new Response(JSON.stringify({ status: "ready" }), { status: 200 });
		}

		// set pending atomically
		const { data: claimed, error: claimErr } = await supabase
			.from("projects")
			.update({ plan_status: "pending", plan_error: null, updated_at: new Date().toISOString() })
			.eq("id", project_id)
			.neq("plan_status", "pending")
			.select("plan_status")
			.single();
		if (claimErr) throw claimErr;
		if (!claimed) return new Response(JSON.stringify({ status: "pending" }), { status: 200 });

		// insert ai_responses audit row
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

			const planBundles = plan.bundles ?? [];
			const planBundleCount = planBundles.length;
			const planTaskCount = planBundles.reduce((sum, bundle) => sum + (bundle.tasks?.length ?? 0), 0);
			console.info("persist-plan: plan ready", { project_id, planBundleCount, planTaskCount });

			// Upsert bundles (do NOT delete bundles; keep them durable)
			const { data: existingBundles } = await supabase
				.from("task_bundles")
				.select("id,label,title,summary,claimed_by_member_id")
				.eq("project_id", project_id);

			const buildBundleKey = (input: { label?: string | null; bundle_title?: string | null; title?: string | null }) => {
				const label = input.label ?? "";
				const title = input.bundle_title ?? input.title ?? "";
				return `${label}::${title}`;
			};

			const existingByKey: Record<string, any> = {};
			(existingBundles ?? []).forEach((bundle) => {
				const key = buildBundleKey({ label: bundle.label, title: bundle.title });
				existingByKey[key] = bundle;
			});

			const bundleIdByKey: Record<string, string> = {};
			const insertedBundleRecords: any[] = [];
			for (const bundle of planBundles) {
				const key = buildBundleKey({ label: bundle.label, bundle_title: bundle.bundle_title });
				if (!key.trim()) {
					throw new Error("Plan bundle missing label/title");
				}
				const existing = existingByKey[key];
				if (existing) {
					await supabase
						.from("task_bundles")
						.update({ title: bundle.bundle_title ?? existing.title, summary: bundle.bundle_summary ?? existing.summary ?? null, updated_at: new Date().toISOString() })
						.eq("id", existing.id);
					bundleIdByKey[key] = existing.id;
				} else {
					const { data: inserted, error: insErr } = await supabase
						.from("task_bundles")
						.insert([
							{
								project_id,
								label: bundle.label,
								title: bundle.bundle_title,
								summary: bundle.bundle_summary ?? null,
								total_points: bundle.total_points ?? null,
								created_at: new Date().toISOString(),
							},
						])
						.select("*")
						.single();
					if (insErr) throw insErr;
					insertedBundleRecords.push(inserted);
					bundleIdByKey[key] = inserted.id;
				}
			}

			// Replace AI-generated tasks per bundle (do not touch manual tasks)
			let tasksResultCount = 0;
			for (const bundle of planBundles) {
				const key = buildBundleKey({ label: bundle.label, bundle_title: bundle.bundle_title });
				const bundleId = bundleIdByKey[key];
				if (!bundleId) {
					throw new Error(`Unable to map plan bundle to task_bundles row: ${key}`);
				}
				const claimedRow = existingByKey[key];
				const claimedMemberId = claimedRow?.claimed_by_member_id ?? null;

				// delete only AI-generated tasks for this bundle
				await supabase.from("tasks").delete().eq("bundle_id", bundleId).eq("is_ai_generated", true);

				const tasksToInsert: any[] = [];
				for (const task of bundle.tasks) {
					tasksToInsert.push({
						project_id,
						title: task.title,
						details: task.details ?? null,
						category: task.category,
						size: task.size,
						effort_points: task.effort_points ?? task.effortPoints ?? 0,
						status: "todo",
						owner_member_id: claimedMemberId ?? null,
						bundle_id: bundleId,
						is_ai_generated: true,
						created_at: new Date().toISOString(),
					});
				}
				if (tasksToInsert.length > 0) {
					const { data: tiData, error: tiErr } = await supabase.from("tasks").insert(tasksToInsert).select("id");
					if (tiErr) throw tiErr;
					tasksResultCount += (tiData ?? []).length;
				}
			}

			// log DB counts for verification
			const bundleCountResult = await supabase
				.from("task_bundles")
				.select("id", { count: "exact", head: true })
				.eq("project_id", project_id);
			const taskCountResult = await supabase
				.from("tasks")
				.select("id", { count: "exact", head: true })
				.eq("project_id", project_id);
			const tasksWithoutBundleResult = await supabase
				.from("tasks")
				.select("id", { count: "exact", head: true })
				.eq("project_id", project_id)
				.is("bundle_id", null);
			console.info("persist-plan: post-insert counts", {
				project_id,
				bundle_count: bundleCountResult.count ?? 0,
				task_count: taskCountResult.count ?? 0,
				tasks_without_bundle: tasksWithoutBundleResult.count ?? 0,
			});

			// replace persistent deliverables with AI-provided ones
			await supabase.from("deliverables").delete().eq("project_id", project_id);
			if ((plan.deliverables ?? []).length > 0) {
				const deliverablesToInsert = (plan.deliverables ?? []).map((d: any) => ({
					project_id,
					title: d.title ?? "Deliverable",
					url: d.url ?? null,
					created_at: new Date().toISOString(),
				}));
				await supabase.from("deliverables").insert(deliverablesToInsert);
			}

			// persist plan_payload and mark ready
			await supabase.from("projects").update({ plan_payload: plan, plan_status: "ready", plan_error: null, updated_at: new Date().toISOString() }).eq("id", project_id);
			// update ai_responses
			if (aiId) {
				await supabase
					.from("ai_responses")
					.update({ status: "ready", output_plan: plan, latency_ms: latency, error_code: null, error_message: null })
					.eq("id", aiId);
			}

			return new Response(
				JSON.stringify({
					status: "ready",
					plan_bundle_count: planBundleCount,
					plan_task_count: planTaskCount,
					bundles_inserted: insertedBundleRecords.length,
					tasks_inserted: tasksResultCount,
					bundle_count: bundleCountResult.count ?? 0,
					task_count: taskCountResult.count ?? 0,
					tasks_without_bundle: tasksWithoutBundleResult.count ?? 0,
				}),
				{ status: 200 }
			);
		} catch (e: any) {
			const code = e?.code ?? "AI_PERSIST_FAILED";
			const msg = e?.message ?? String(e);
			await supabase.from("projects").update({ plan_status: "failed", plan_error: `${code}: ${msg}`, updated_at: new Date().toISOString() }).eq("id", project_id);
			if (aiId) {
				await supabase.from("ai_responses").update({ status: "failed", error_code: code, error_message: msg }).eq("id", aiId);
			}
			return new Response(JSON.stringify({ status: "failed", error_code: code, error_message: msg }), { status: 200 });
		}
	} catch (e: any) {
		console.error("persist-plan error", e);
		return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500 });
	}
}


