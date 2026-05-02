// Edge Function: extract-file-text
// Deploy with: supabase functions deploy extract-file-text --project-ref <ref>
//
// Accepts POST { project_id, resource_id }
// 1. Verifies caller is a project member
// 2. Downloads the file from Storage bucket "project_files"
// 3. Extracts text (PDF best-effort, text/plain verbatim, else placeholder)
// 4. Writes text_content + updated_at on project_resources
// Returns { ok, resource_id, chars_written }

import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_TEXT_CHARS = 25_000;
const TRUNCATION_MARKER = "\n[TRUNCATED]";

// ---------------------------------------------------------------------------
// CORS (matches existing Edge Functions pattern)
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
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
// Minimal PDF text extraction (no native deps)
// Walks the raw bytes for BT..ET text blocks and decodes common operators:
//   Tj  – show string
//   TJ  – show array of strings
//   '   – move to next line and show string
//   "   – set spacing, move to next line and show string
// This is intentionally best-effort: it handles ~80 % of single-layer PDFs.
// Scanned / image-only PDFs will return little or no text.
// ---------------------------------------------------------------------------
function extractTextFromPdfBytes(bytes: Uint8Array): string {
	// Work on the raw latin-1 text representation so we can regex over it.
	const raw = new TextDecoder("latin1").decode(bytes);

	const chunks: string[] = [];

	// Match every BT … ET block (text object).
	const btEt = /BT\s([\s\S]*?)ET/g;
	let block: RegExpExecArray | null;
	while ((block = btEt.exec(raw)) !== null) {
		const inside = block[1];

		// Tj — show a single string:  (Hello) Tj
		const tjRe = /\(([^)]*)\)\s*Tj/g;
		let m: RegExpExecArray | null;
		while ((m = tjRe.exec(inside)) !== null) {
			chunks.push(decodePdfString(m[1]));
		}

		// TJ — show an array of strings/kerning:  [(H) 20 (ello)] TJ
		const tjArrayRe = /\[(.*?)\]\s*TJ/g;
		while ((m = tjArrayRe.exec(inside)) !== null) {
			const inner = m[1];
			const parts = /\(([^)]*)\)/g;
			let p: RegExpExecArray | null;
			while ((p = parts.exec(inner)) !== null) {
				chunks.push(decodePdfString(p[1]));
			}
		}

		// ' and " operators (less common but still valid text-showing ops)
		const quoteRe = /\(([^)]*)\)\s*['"]/g;
		while ((m = quoteRe.exec(inside)) !== null) {
			chunks.push(decodePdfString(m[1]));
		}
	}

	return chunks.join(" ").replace(/\s+/g, " ").trim();
}

/** Unescape common PDF string escape sequences. */
function decodePdfString(s: string): string {
	return s
		.replace(/\\n/g, "\n")
		.replace(/\\r/g, "\r")
		.replace(/\\t/g, "\t")
		.replace(/\\\(/g, "(")
		.replace(/\\\)/g, ")")
		.replace(/\\\\/g, "\\");
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
	// Preflight
	if (req.method === "OPTIONS") {
		return new Response("ok", { status: 200, headers: CORS_HEADERS });
	}

	if (req.method !== "POST") {
		return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
	}

	// ---- Auth token --------------------------------------------------------
	const authHeader = req.headers.get("authorization") ?? "";
	if (!authHeader) {
		return jsonResponse({ ok: false, error: "Auth required" }, 401);
	}

	// ---- Parse body --------------------------------------------------------
	let body: { project_id?: string; resource_id?: string };
	try {
		body = await req.json();
	} catch {
		return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
	}

	const { project_id, resource_id } = body;
	if (!project_id || !resource_id) {
		return jsonResponse({ ok: false, error: "project_id and resource_id are required" }, 400);
	}

	// ---- Supabase clients --------------------------------------------------
	// Env var names match the existing create-project-with-ai function + functions.env
	const supabaseUrl = Deno.env.get("FN_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
	const anonKey = Deno.env.get("FN_SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
	const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("FN_SERVICE_ROLE_KEY");

	if (!supabaseUrl || !anonKey) {
		return jsonResponse({ ok: false, error: "Server misconfigured: missing SUPABASE_URL or ANON_KEY" }, 500);
	}
	if (!serviceKey) {
		return jsonResponse({ ok: false, error: "Server misconfigured: missing SERVICE_ROLE_KEY" }, 500);
	}

	// User-scoped client — pass the full Authorization header (works with ES256 + HS256)
	const userClient = createClient(supabaseUrl, anonKey, {
		global: { headers: { Authorization: authHeader } },
	});

	// Service-role client (bypasses RLS — for Storage download + DB write)
	const serviceClient = createClient(supabaseUrl, serviceKey);

	// ---- 1. Verify caller is a project member ------------------------------
	const { data: memberRow, error: memberErr } = await userClient
		.from("project_members")
		.select("id")
		.eq("project_id", project_id)
		.eq("user_id", (await userClient.auth.getUser()).data.user?.id ?? "")
		.limit(1)
		.maybeSingle();

	if (memberErr || !memberRow) {
		return jsonResponse({ ok: false, error: "Not a member of this project" }, 403);
	}

	// ---- 2. Load the resource row ------------------------------------------
	const { data: resource, error: resErr } = await serviceClient
		.from("project_resources")
		.select("id, project_id, type, file_path, label, mime_type")
		.eq("id", resource_id)
		.maybeSingle();

	if (resErr || !resource) {
		return jsonResponse({ ok: false, error: "Resource not found" }, 404);
	}
	if (resource.project_id !== project_id) {
		return jsonResponse({ ok: false, error: "Resource does not belong to this project" }, 403);
	}
	if (resource.type !== "file") {
		return jsonResponse({ ok: false, error: "Resource is not a file" }, 400);
	}
	if (!resource.file_path) {
		return jsonResponse({ ok: false, error: "Resource has no file_path" }, 400);
	}

	// ---- 3. Download file from Storage (service role — no RLS) -------------
	let fileBytes: Uint8Array;
	try {
		const { data: blob, error: dlErr } = await serviceClient.storage
			.from("project_files")
			.download(resource.file_path);

		if (dlErr || !blob) {
			throw new Error(dlErr?.message ?? "download returned empty");
		}
		fileBytes = new Uint8Array(await blob.arrayBuffer());
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		// Write placeholder so caller knows extraction was attempted
		await serviceClient
			.from("project_resources")
			.update({ text_content: `[Extraction failed: ${msg}]`, updated_at: new Date().toISOString() })
			.eq("id", resource_id);
		return jsonResponse({ ok: false, error: `Storage download failed: ${msg}` }, 502);
	}

	// ---- 4. Extract text ---------------------------------------------------
	let extractedText: string;
	const mime = (resource.mime_type ?? "").toLowerCase();

	try {
		if (mime === "application/pdf") {
			extractedText = extractTextFromPdfBytes(fileBytes);
			if (!extractedText) {
				extractedText = `[No extractable text in PDF. File: ${resource.label ?? resource.file_path} (${mime})]`;
			}
		} else if (mime.startsWith("text/")) {
			extractedText = new TextDecoder("utf-8").decode(fileBytes);
		} else {
			extractedText = `No text extracted. File: ${resource.label ?? resource.file_path} (${mime})`;
		}
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		extractedText = `[Extraction error: ${msg}. File: ${resource.label ?? resource.file_path} (${mime})]`;
	}

	// ---- 5. Truncate if needed ---------------------------------------------
	if (extractedText.length > MAX_TEXT_CHARS) {
		extractedText = extractedText.slice(0, MAX_TEXT_CHARS - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
	}

	// ---- 6. Write to project_resources.text_content ------------------------
	const { error: updateErr } = await serviceClient
		.from("project_resources")
		.update({
			text_content: extractedText,
			updated_at: new Date().toISOString(),
		})
		.eq("id", resource_id);

	if (updateErr) {
		return jsonResponse({ ok: false, error: `DB update failed: ${updateErr.message}` }, 500);
	}

	return jsonResponse({ ok: true, resource_id, chars_written: extractedText.length });
});
