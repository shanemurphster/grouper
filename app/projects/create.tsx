import React, { useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import AppButton from "../../src/components/AppButton";
import { colors } from "../../src/theme/colors";
import { useRouter } from "expo-router";
// Document picker is imported dynamically inside pickFile to avoid bundling errors
// on platforms where the package isn't installed (web builds). This allows the
// app to run without failing the bundler; users should install `expo-document-picker`
// for full file-picking support on native platforms.
import { createProjectServer } from "../../src/data/projects.server";
import { supabase } from "../../src/data/supabaseClient";
import { addProjectResource, uploadProjectFile, extractFileText } from "../../src/data/projectDetail.server";
import { retryPlan } from "../../src/data/plan.server";
import { normalizePickedFiles, PickedFile } from "../../src/lib/files/normalizePickedFiles";
import Toast from "../../src/components/Toast";

type SelectedFile = PickedFile;

type FileUploadStatus = "pending" | "uploading" | "extracting" | "done" | "failed";
type FileUploadRow = {
	name: string;
	status: FileUploadStatus;
	error?: string;
};

export default function CreateProjectRoute() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [timeframe, setTimeframe] = useState<"twoDay" | "oneWeek" | "long">("oneWeek");
	const [assignmentDetails, setAssignmentDetails] = useState("");
	const [groupSize, setGroupSize] = useState<number | null>(1);
	const [groupSizeError, setGroupSizeError] = useState<string | null>(null);
	const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const [uploadRows, setUploadRows] = useState<FileUploadRow[]>([]);
	const [verifiedCount, setVerifiedCount] = useState<number | null>(null);
	const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
	const [toast, setToast] = useState<{ message: string; type?: "info" | "error" | "success" } | null>(null);
	const [debugBlock, setDebugBlock] = useState<string | null>(null);

	async function pickFile() {
		try {
			const DocumentPicker = await import("expo-document-picker").then((m) => m.default ?? m);
			const res = await DocumentPicker.getDocumentAsync({
				multiple: true,
				copyToCacheDirectory: true,
				type: ["application/pdf", "image/*"],
			});
			const picked = normalizePickedFiles(res);
			if (picked.length > 0) {
				setSelectedFiles((s) => [...s, ...picked]);
			}
		} catch (e) {
			console.error("pickFile failed", e);
			setToast({ message: "File picker unavailable. Install expo-document-picker for native file picking.", type: "error" });
		}
	}

	function removeFile(idx: number) {
		setSelectedFiles((s) => s.filter((_, i) => i !== idx));
	}

	function updateUploadRow(index: number, update: Partial<FileUploadRow>) {
		setUploadRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...update } : r)));
	}

	async function tryUploadFiles(projectId: string, files: SelectedFile[]) {
		// Initialize upload rows for tracking
		setUploadRows(files.map((f) => ({ name: f.name, status: "pending" as FileUploadStatus })));

		let failCount = 0;
		for (let i = 0; i < files.length; i++) {
			const f = files[i];
			try {
				// Phase: Uploading
				updateUploadRow(i, { status: "uploading" });
				const source = f.file ?? f.uri;
				if (!source) throw new Error("No file source (no File object or URI)");
				const uploaded = await uploadProjectFile(projectId, source, f.name);
				const resource = await addProjectResource(projectId, {
					label: f.name,
					type: "file",
					file_path: uploaded.path,
					mime_type: uploaded.mime_type,
					size_bytes: uploaded.size_bytes,
				});
				console.log("tryUploadFiles: resource inserted", { resource_id: resource.id, name: f.name });

				// Phase: Extracting text
				updateUploadRow(i, { status: "extracting" });
				console.log("tryUploadFiles: calling extract-file-text", { resource_id: resource.id });
				try {
					const extractResult = await extractFileText(projectId, resource.id);
					console.log("tryUploadFiles: extract-file-text success", { resource_id: resource.id, chars_written: extractResult?.chars_written });
				} catch (extractErr) {
					console.warn("tryUploadFiles: extract-file-text failed", { resource_id: resource.id, name: f.name, error: String((extractErr as any)?.message ?? extractErr) });
					// Non-fatal: file is uploaded, text extraction is best-effort
				}

				// Phase: Done
				updateUploadRow(i, { status: "done" });
			} catch (e: any) {
				console.error("file upload failed", f.name, e);
				const errMsg = e?.message ?? String(e);
				updateUploadRow(i, { status: "failed", error: errMsg.length > 80 ? errMsg.slice(0, 80) + "..." : errMsg });
				failCount++;
			}
		}

		// Verify persistence: refetch project_resources and show confirmed count
		try {
			const { data: resources } = await supabase
				.from("project_resources")
				.select("id")
				.eq("project_id", projectId)
				.eq("type", "file");
			setVerifiedCount(resources?.length ?? 0);
		} catch {
			// non-fatal
		}

		return failCount;
	}

	async function createProject() {
		// validate assignment
		if (!assignmentDetails || !assignmentDetails.trim()) {
			setToast({ message: "Assignment text is required", type: "error" });
			return;
		}
		// validate group size
		if (!groupSize || !Number.isInteger(groupSize) || groupSize < 1 || groupSize > 12) {
			setGroupSizeError("Group size must be an integer between 1 and 12");
			setToast({ message: "Fix validation errors", type: "error" });
			return;
		}
		setGroupSizeError(null);
		setSubmitting(true);
		setToast(null);
		try {
			// generate a client-side trace id
			const traceId = (globalThis.crypto && (globalThis.crypto as any).randomUUID) ? (globalThis.crypto as any).randomUUID() : `${Date.now()}-${Math.floor(Math.random()*100000)}`;
			console.log("CreateProject: payload summary", { name: name || "Untitled Project", timeframe, groupSize: groupSize ?? 1, assignment_len: (assignmentDetails || "").length, traceId, filesCount: selectedFiles.length });

			// Phase 1: Create project without AI (debug_skip_openai)
			setToast({ message: "Creating project...", type: "info" });
			const projectId = await createProjectServer({
				name: name || "Untitled Project",
				timeframe,
				assignmentDetails: assignmentDetails || undefined,
				groupSize: groupSize ?? undefined,
				joinCode: `${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
				description: description || undefined,
				trace_id: traceId,
				debug_skip_openai: true,
			});
			console.log("CreateProject: project created (no AI yet), projectId:", projectId);
			setCreatedProjectId(projectId);

			// Phase 2: Upload files + extract text (before AI sees them)
			if (selectedFiles.length > 0) {
				setToast({ message: `Uploading ${selectedFiles.length} file(s)...`, type: "info" });
				const failCount = await tryUploadFiles(projectId, selectedFiles);
				if (failCount > 0) {
					const successCount = selectedFiles.length - failCount;
					console.warn(`CreateProject: ${failCount} file uploads failed, ${successCount} succeeded`);
				}
			}

			// Phase 3: Trigger AI plan generation (reads file text from DB)
			setToast({ message: "Generating AI plan...", type: "info" });
			const planResult = await retryPlan(projectId, true);
			console.log("CreateProject: AI plan generated for projectId:", projectId, "bundles:", planResult?.inserted_bundle_count, "tasks:", planResult?.inserted_task_count);

			// Phase 4: Navigate to project page
			setToast({ message: "Project created", type: "success" });
			router.push(`/project/${projectId}`);
		} catch (e: any) {
			console.error("createProject failed", e);
			try {
				console.error("createProject error:", e?.name, e?.message);
			} catch {}
			const msg = String(e?.message ?? e);
			if (msg.startsWith("EDGE_DEBUG:")) {
				const idx = msg.indexOf("\n\n");
				const rawJson = msg.slice("EDGE_DEBUG:".length, idx > 0 ? idx : undefined);
				const userMsg = idx > 0 ? msg.slice(idx + 2) : "Network error";
				try {
					const dbg = JSON.parse(rawJson);
					setDebugBlock(JSON.stringify(dbg, null, 2));
				} catch {
					setDebugBlock(rawJson);
				}
				setToast({ message: userMsg, type: "error" });
			} else if (msg.startsWith("Create project failed:")) {
				const parts = msg.replace("Create project failed:", "").trim();
				const firstSpace = parts.indexOf(" ");
				let status = parts;
				let body = "";
				if (firstSpace > 0) {
					status = parts.slice(0, firstSpace);
					body = parts.slice(firstSpace + 1);
				}
				console.error("Create project non-2xx", { status, body });
				const truncated = body.length > 2000 ? body.slice(0, 2000) + "...(truncated)" : body;
				setDebugBlock(`status: ${status}\n\nresponse:\n${truncated}`);
				setToast({ message: `Create failed: ${status}`, type: "error" });
			} else {
				setToast({ message: `Create failed: ${String(e)}`, type: "error" });
			}
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<ScrollView style={{ flex: 1, backgroundColor: colors.blueLight, padding: 16 }}>
			<View style={styles.card}>
				<Text style={{ fontSize: 20, fontWeight: "800", marginBottom: 8, color: colors.text }}>Create Project</Text>

				{/* Project info section */}
				<View style={styles.section}>
					<TextInput placeholder="Project title" value={name} onChangeText={setName} style={styles.input} />
					<TextInput placeholder="Project description (optional)" value={description} onChangeText={setDescription} style={styles.input} />
				</View>

				{/* Timeframe + group size */}
				<View style={styles.section}>
					<View style={{ flexDirection: "row", marginBottom: 12, alignItems: "center", justifyContent: "space-between" }}>
						<View style={{ flexDirection: "row", alignItems: "center" }}>
							<AppButton
								title="Two Day"
								variant={timeframe === "twoDay" ? "primary" : "secondary"}
								onPress={() => setTimeframe("twoDay")}
							/>
							<View style={{ width: 8 }} />
							<AppButton
								title="Week"
								variant={timeframe === "oneWeek" ? "primary" : "secondary"}
								onPress={() => setTimeframe("oneWeek")}
							/>
							<View style={{ width: 8 }} />
							<AppButton
								title="Week+"
								variant={timeframe === "long" ? "primary" : "secondary"}
								onPress={() => setTimeframe("long")}
							/>
						</View>

						{/* Group size control */}
						<View style={{ flexDirection: "column", alignItems: "flex-end" }}>
							<Text style={{ fontSize: 12, fontWeight: "600", marginBottom: 4, color: colors.subtleText }}>Group size</Text>
							<View style={{ flexDirection: "row", alignItems: "center" }}>
								<TouchableOpacity
									onPress={() => setGroupSize((s) => Math.max(1, Math.min(12, (s ?? 1) - 1)))}
									style={styles.stepBtn}
									accessibilityLabel="Decrease group size"
								>
									<Text>-</Text>
								</TouchableOpacity>
								<TextInput
									value={String(groupSize)}
									onChangeText={(v) => {
										const n = parseInt(v || "", 10);
										if (Number.isNaN(n)) {
											setGroupSize(null);
										} else {
											setGroupSize(Math.max(1, Math.min(12, n)));
										}
									}}
									style={styles.groupInput}
									keyboardType="number-pad"
									accessibilityLabel="Group size"
								/>
								<TouchableOpacity
									onPress={() => setGroupSize((s) => Math.max(1, Math.min(12, (s ?? 1) + 1)))}
									style={styles.stepBtn}
									accessibilityLabel="Increase group size"
								>
									<Text>+</Text>
								</TouchableOpacity>
							</View>
							{groupSizeError ? <Text style={{ color: colors.pennRed, marginTop: 4, fontSize: 12 }}>{groupSizeError}</Text> : null}
						</View>
					</View>
				</View>

				{/* Assignment section */}
				<View style={styles.section}>
					<Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 8, color: colors.text }}>Assignment</Text>
					<TextInput
						placeholder="Assignment details (paste full text here)"
						value={assignmentDetails}
						onChangeText={setAssignmentDetails}
						style={[styles.input, { height: 160, textAlignVertical: "top" }]}
						multiline
					/>
				</View>

				{/* Files */}
				<View style={styles.section}>
					<Text style={{ marginBottom: 8, fontWeight: "600", color: colors.text }}>Files (optional)</Text>
					<View style={{ flexDirection: "row", marginTop: 8, marginBottom: 8 }}>
						<AppButton title="Add files" variant="secondary" onPress={pickFile} disabled={submitting} />
					</View>

					{/* Pre-upload: selected files with remove buttons */}
					{uploadRows.length === 0 && selectedFiles.map((f, i) => (
						<View key={i} style={styles.fileRow}>
							<Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
							<Text style={styles.fileBadge}>Pending</Text>
							<TouchableOpacity onPress={() => removeFile(i)} style={{ padding: 6 }}>
								<Text style={{ color: colors.pennRed, fontSize: 12 }}>Remove</Text>
							</TouchableOpacity>
						</View>
					))}

					{/* During/after upload: status tracker */}
					{uploadRows.length > 0 ? (
						<View style={{ marginTop: 4 }}>
							{uploadRows.map((row, i) => (
								<View key={i} style={styles.fileRow}>
									<Text style={styles.fileName} numberOfLines={1}>{row.name}</Text>
									<FileStatusBadge status={row.status} />
									{row.status === "failed" && row.error ? (
										<Text style={{ color: colors.pennRed, fontSize: 11, marginLeft: 6, flex: 1 }} numberOfLines={1}>{row.error}</Text>
									) : null}
								</View>
							))}
							{verifiedCount !== null ? (
								<Text style={{ color: "#16A34A", fontSize: 12, fontWeight: "600", marginTop: 6 }}>
									{verifiedCount} file(s) saved
								</Text>
							) : null}
						</View>
					) : null}
				</View>

				<View style={{ marginTop: 18 }}>
					{submitting ? <ActivityIndicator /> : null}
					<View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
						<AppButton title="Cancel" variant="secondary" onPress={() => router.back()} />
						<AppButton title="Create" variant="primary" onPress={createProject} disabled={submitting || !!groupSizeError || !groupSize} />
					</View>
				</View>
			</View>

			{toast ? <Toast message={toast.message} type={toast.type} /> : null}
			{debugBlock ? (
				<View style={{ marginTop: 12, backgroundColor: "#111827", padding: 12, borderRadius: 8 }}>
					<Text style={{ color: "#fff", fontWeight: "700", marginBottom: 8 }}>Debug info</Text>
					<Text style={{ color: "#E5E7EB", fontFamily: "monospace" }}>{debugBlock}</Text>
				</View>
			) : null}
		</ScrollView>
	);
}

const STATUS_COLORS: Record<FileUploadStatus, { bg: string; text: string }> = {
	pending: { bg: "#F3F4F6", text: "#6B7280" },
	uploading: { bg: "#DBEAFE", text: "#2563EB" },
	extracting: { bg: "#E0E7FF", text: "#4338CA" },
	done: { bg: "#DCFCE7", text: "#16A34A" },
	failed: { bg: "#FEE2E2", text: "#DC2626" },
};
const STATUS_LABELS: Record<FileUploadStatus, string> = {
	pending: "Pending",
	uploading: "Uploading...",
	extracting: "Extracting...",
	done: "Done",
	failed: "Failed",
};

function FileStatusBadge({ status }: { status: FileUploadStatus }) {
	const c = STATUS_COLORS[status];
	const showSpinner = status === "uploading" || status === "extracting";
	return (
		<View style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
			{showSpinner ? <ActivityIndicator size="small" color={c.text} style={{ marginRight: 4 }} /> : null}
			<Text style={{ fontSize: 11, fontWeight: "700", color: c.text }}>{STATUS_LABELS[status]}</Text>
		</View>
	);
}

const styles = {
	card: {
		backgroundColor: colors.cardWhite,
		borderRadius: 16,
		padding: 16,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
	},
	section: {
		marginTop: 12,
		paddingTop: 8,
		paddingBottom: 8,
		borderTopWidth: 1,
		borderTopColor: "#F3F4F6",
	},
	input: {
		borderWidth: 1,
		borderColor: "#E6EDF8",
		padding: 10,
		borderRadius: 10,
		backgroundColor: "#fff",
		marginBottom: 8,
	},
	stepBtn: {
		padding: 8,
		borderWidth: 1,
		borderColor: "#E6EDF8",
		borderRadius: 6,
		marginRight: 6,
		backgroundColor: "#fff",
	},
	groupInput: {
		width: 56,
		borderWidth: 1,
		borderColor: "#E6EDF8",
		padding: 8,
		textAlign: "center",
		borderRadius: 6,
		backgroundColor: "#fff",
	},
	fileRow: {
		flexDirection: "row" as const,
		alignItems: "center" as const,
		paddingVertical: 6,
		paddingHorizontal: 4,
		borderBottomWidth: 1,
		borderBottomColor: "#F3F4F6",
		gap: 8,
	},
	fileName: {
		flex: 1,
		fontSize: 13,
		color: "#374151",
	},
	fileBadge: {
		fontSize: 11,
		fontWeight: "600" as const,
		color: "#6B7280",
		backgroundColor: "#F3F4F6",
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 6,
	},
};