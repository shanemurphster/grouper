import { PlanV1, PlanV1Schema, openAiJsonSchema, getPlanSchemaObject, buildPrompt } from "./planV1";

const MAX_ASSIGNMENT_LENGTH = 18000;

class PlanError extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

export async function generatePlan(
	input: { title?: string; description?: string; timeframe: "twoDay" | "oneWeek" | "long"; assignment_details: string; group_size: number; trace_id?: string }
): Promise<PlanV1> {
	const { title, description, timeframe, assignment_details, group_size, trace_id } = input;
	if (assignment_details && assignment_details.length > MAX_ASSIGNMENT_LENGTH) {
		throw new PlanError("ASSIGNMENT_TOO_LONG", `Assignment text exceeds ${MAX_ASSIGNMENT_LENGTH} characters`);
	}

	// Stub mode for deterministic tests
	if (process.env.USE_AI_STUB === "true") {
		// produce deterministic stub
		const n = Math.max(1, Math.min(12, Math.floor(group_size ?? 1)));
		const deliverables = [{ title: "Final submission", description: "Project deliverable (PDF or link)" }];
		const bundles = Array.from({ length: n }).map((_, i) => {
			const label = `Person ${i + 1}`;
			// choose task counts by timeframe
			let count = 4;
			if (timeframe === "twoDay") count = 2;
			if (timeframe === "oneWeek") count = 5;
			if (timeframe === "long") count = 7;
			const tasks = Array.from({ length: count }).map((__, j) => {
				const size = j % 3 === 0 ? "L" : j % 3 === 1 ? "M" : "S";
				const mapping: Record<string, number> = { S: 1, M: 2, L: 3 };
				return {
					title: `${label} task ${j + 1}`,
					details: `Complete ${label} task ${j + 1}. Done when deliverable is produced.`,
					category: "Research",
					size,
					effort_points: mapping[size],
				};
			});
			// for long timeframe ensure at least one Review
			if (timeframe === "long" && !tasks.some((t) => t.category === "Review")) {
				tasks.push({
					title: `${label} review`,
					details: "Review other's work. Done when feedback submitted.",
					category: "Review",
					size: "S",
					effort_points: 1,
				});
			}
			return {
				label,
				bundle_title: `Bundle for ${label}`,
				bundle_summary: `Auto-generated bundle for ${label}`,
				tasks,
			};
		});
		const plan = { timeframe, deliverables, bundles, assumptions: ["Generated in stub mode"] };
		// validate before returning
		const parsed = PlanV1Schema.safeParse(plan);
		if (!parsed.success) throw new PlanError("AI_OUTPUT_INVALID", "Stub output failed validation");
		if (parsed.data.bundles.length !== n) throw new PlanError("BUNDLE_COUNT_MISMATCH", "Stub bundle count mismatch");
		return parsed.data;
	}

	// Real mode: use OpenAI JS SDK Responses.parse with zodTextFormat to get structured output
	const prompt = buildPrompt({ title: title ?? "", description: description ?? undefined, timeframe, assignment_details, group_size });
	// Log prompt preview and input summary for observability (do not log full assignment text)
	try {
		console.log("generatePlan: inputSummary", { titleLen: String(title ?? "").length, descriptionLen: String(description ?? "").length, assignmentLen: String(assignment_details ?? "").length, group_size, trace_id: trace_id ?? null });
		console.log("generatePlan: prompt_preview", prompt.slice(0, 1000));
	} catch {}
	const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
	if (!OPENAI_API_KEY) throw new PlanError("AI_CALL_FAILED", "Missing OPENAI_API_KEY");

	try {
		// Always use explicit JSON Schema container derived from our schema object
		const finalFormat = {
			// include both 'name' and schema containers; place the plain JSON Schema at `.schema`
			name: "PlanV1",
			type: "json_schema",
			// plain schema object (must have type: "object")
			schema: getPlanSchemaObject(),
			// also provide the older wrapper if the server expects it
			json_schema: {
				name: "PlanV1",
				strict: true,
				schema: getPlanSchemaObject(),
			},
		};
		console.log("text.format.schema.type:", finalFormat.schema.type);

		const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
		let data: any = null;
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const { OpenAI } = require("openai");
			const client = new OpenAI({ apiKey: OPENAI_API_KEY });
			const sdkPromise = client.responses.create({
				model,
				input: [{ role: "user", content: prompt }],
				text: { format: finalFormat },
			});
			// enforce timeout for SDK call as well
			const oaTimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS ?? 150000);
			const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), oaTimeoutMs));
			const sdkResp = await Promise.race([sdkPromise, timeoutPromise]);
			data = JSON.parse(JSON.stringify(sdkResp));
		} catch (sdkErr) {
			// SDK not available or failed — use direct HTTP request to /v1/responses with timeout
			const openaiReq = {
				model,
				input: [{ role: "user", content: prompt }],
				text: { format: finalFormat },
			};
			// Log request shape (without API key) for observability
			try {
				console.log("generatePlan: openai_request_preview", { model: openaiReq.model, promptPreview: String(prompt).slice(0, 1000) });
			} catch {}

			const oaTimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS ?? 150000);
			const controller = new AbortController();
			const oaTimeout = setTimeout(() => controller.abort(), oaTimeoutMs);
			const resp = await fetch("https://api.openai.com/v1/responses", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${OPENAI_API_KEY}`,
				},
				body: JSON.stringify(openaiReq),
				signal: controller.signal,
			}).catch((err) => {
				clearTimeout(oaTimeout);
				if (err?.name === "AbortError") throw new PlanError("AI_TIMEOUT", "OpenAI request timed out");
				throw err;
			});
			clearTimeout(oaTimeout);
			if (!resp.ok) {
				const txt = await resp.text();
				throw new PlanError("AI_CALL_FAILED", `OpenAI error: ${resp.status} ${txt}`);
			}
			data = await resp.json();
		}

		// Extract model output: prefer output_text, then structured parsed output, then application/json content, then first text block
		let parsedPlan: any = null;
		if (typeof data?.output_text === "string" && data.output_text.trim()) {
			try {
				parsedPlan = JSON.parse(data.output_text);
			} catch {
				parsedPlan = null;
			}
		}
		if (!parsedPlan && data?.output_parsed) parsedPlan = data.output_parsed;
		if (!parsedPlan) {
			const outputs = data?.output ?? data?.outputs ?? data?.results ?? null;
			if (Array.isArray(outputs) && outputs.length > 0) {
				const content = outputs[0]?.content;
				if (Array.isArray(content)) {
					const jsonEntry = content.find((c: any) => (c.type === "application/json" || c.type === "output_schema") && c.data);
					if (jsonEntry && jsonEntry.data) parsedPlan = jsonEntry.data;
					if (!parsedPlan) {
						const textEntry = content.find((c: any) => typeof c.text === "string" && c.text.trim().length > 0);
						if (textEntry) {
							try {
								parsedPlan = JSON.parse(textEntry.text);
							} catch {
								parsedPlan = null;
							}
						}
					}
				} else if (typeof outputs[0].text === "string") {
					try {
						parsedPlan = JSON.parse(outputs[0].text);
					} catch {
						parsedPlan = null;
					}
				}
			}
		}

		if (!parsedPlan) throw new PlanError("AI_OUTPUT_INVALID", "Unable to parse AI output as JSON");

		// validate with Zod as a safety net
		const parsed = PlanV1Schema.safeParse(parsedPlan);
		if (!parsed.success) {
			throw new PlanError("AI_OUTPUT_INVALID", `Validation failed: ${JSON.stringify(parsed.error.format ? parsed.error.format() : parsed.error)}`);
		}
		if ((parsed.data.bundles?.length ?? 0) !== Math.max(1, Math.min(12, Math.floor(group_size ?? 1)))) {
			throw new PlanError("BUNDLE_COUNT_MISMATCH", "AI returned wrong number of bundles");
		}
		return parsed.data;
	} catch (e: any) {
		if (e instanceof PlanError) throw e;
		throw new PlanError("AI_CALL_FAILED", String(e?.message ?? e));
	}
}

export default generatePlan;


