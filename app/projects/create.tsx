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
import { addProjectResource, uploadProjectFile } from "../../src/data/projectDetail.server";
import Toast from "../../src/components/Toast";

type SelectedFile = {
	uri: string;
	name: string;
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
	const [uploadFailures, setUploadFailures] = useState<Array<{ file: SelectedFile; error: string }>>([]);
	const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
	const [toast, setToast] = useState<{ message: string; type?: "info" | "error" | "success" } | null>(null);
	const [debugBlock, setDebugBlock] = useState<string | null>(null);

	async function pickFile() {
		try {
			// dynamic import avoids bundler errors when the package is not installed for web
			const DocumentPicker = await import("expo-document-picker").then((m) => m.default ?? m);
			// allow multiple selection where supported and restrict to PDFs/images
			const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: ["application/pdf", "image/*"] });
			if ((res as any).type === "cancel") return;
			// handle multiple vs single return shapes (some versions use `output`, `results`, or `uri`)
			const maybeArray = (res as any).output ?? (res as any).results ?? (res as any).files ?? null;
			if (Array.isArray(maybeArray) && maybeArray.length > 0) {
				const outputs = maybeArray as any[];
				const picked = outputs.map((o) => ({ uri: o.uri ?? o.uri, name: o.name ?? o.filename ?? o.uri.split("/").pop() ?? "file" }));
				setSelectedFiles((s) => [...s, ...picked]);
			} else if ((res as any).uri) {
				const uri = (res as any).uri;
				const name = (res as any).name ?? (res as any).name ?? uri.split("/").pop() ?? "file";
				setSelectedFiles((s) => [...s, { uri, name }]);
			} else {
				// unknown shape; attempt to coerce by scanning res for uri-like props
				const entries = Object.values(res as any).filter((v) => v && typeof v === "object" && v.uri);
				if (entries.length > 0) {
					const picked = entries.map((o: any) => ({ uri: o.uri, name: o.name ?? o.filename ?? o.uri.split("/").pop() ?? "file" }));
					setSelectedFiles((s) => [...s, ...picked]);
				} else {
					console.warn("Unknown DocumentPicker result", res);
				}
			}
		} catch (e) {
			console.error("pickFile failed", e);
			setToast({ message: "File picker unavailable. Install expo-document-picker for native file picking.", type: "error" });
		}
	}

	function removeFile(idx: number) {
		setSelectedFiles((s) => s.filter((_, i) => i !== idx));
	}

	async function tryUploadFiles(projectId: string, files: SelectedFile[]) {
		const failed: Array<{ file: SelectedFile; error: string }> = [];
		for (const f of files) {
			try {
				const uploaded = await uploadProjectFile(projectId, f.uri, f.name);
				await addProjectResource(projectId, {
					label: f.name,
					type: "file",
					file_path: uploaded.path,
					mime_type: uploaded.mime_type,
					size_bytes: uploaded.size_bytes,
				});
			} catch (e: any) {
				console.error("file upload failed", f.name, e);
				failed.push({ file: f, error: e?.message ?? String(e) });
			}
		}
		return failed;
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
		// setup timeout: abort request after 180 seconds (3 minutes)
		const controller = new AbortController();
		const timeoutMs = 180 * 1000; // 180 seconds
		const timeoutId = setTimeout(() => {
			controller.abort();
		}, timeoutMs);
		try {
			// log function URL and session presence
			const fnUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-project-with-ai`;
			console.log("CreateProject: calling function URL:", fnUrl);
			const { data: sessionData } = await supabase.auth.getSession();
			const accessToken = sessionData?.session?.access_token ?? null;
			console.log("CreateProject: session present:", !!sessionData, "access_token present:", !!accessToken);

			// generate a client-side trace id
			const traceId = (globalThis.crypto && (globalThis.crypto as any).randomUUID) ? (globalThis.crypto as any).randomUUID() : `${Date.now()}-${Math.floor(Math.random()*100000)}`;
			// payload summary log
			console.log("CreateProject: payload summary", { name: name || "Untitled Project", timeframe, groupSize: groupSize ?? 1, assignment_len: (assignmentDetails || "").length, traceId });

			const projectId = await createProjectServer(
				{
					name: name || "Untitled Project",
					timeframe,
					assignmentDetails: assignmentDetails || undefined,
					groupSize: groupSize ?? undefined,
					joinCode: `${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
					description: description || undefined,
					trace_id: traceId,
				},
				{ signal: controller.signal }
			);
			console.log("CreateProject: createProjectServer returned projectId:", projectId);
			// Navigate to project page now that project and AI persistence are complete
			setCreatedProjectId(projectId);
			setToast({ message: "Project created", type: "success" });
			router.push(`/project/${projectId}`);

			// Upload files in background (do not block navigation)
			(async () => {
				if ((selectedFiles ?? []).length === 0) return;
				try {
					const failed = await tryUploadFiles(projectId, selectedFiles);
					const successCount = (selectedFiles?.length ?? 0) - failed.length;
					if (failed.length > 0) {
						setUploadFailures(failed);
						setToast({ message: `Uploaded ${successCount} files, ${failed.length} failed`, type: "error" });
					} else {
						setToast({ message: `Uploaded ${successCount} files`, type: "success" });
					}
				} catch (e) {
					console.error("background upload failed", e);
					setToast({ message: `Background upload failed: ${String(e)}`, type: "error" });
				}
			})();
		} catch (e: any) {
			console.error("createProject failed", e);
			if (e?.name === "AbortError") {
				console.log("create-with-ai aborted after", timeoutMs, "ms");
				setDebugBlock(`Request aborted after ${timeoutMs}ms. Plan generation may be slow; try again or retry from the project page.`);
				setToast({ message: "Plan generation is taking too long. Please try again or retry from the project page.", type: "error" });
			}
			// log err.name + err.message for visibility
			try {
				console.error("createProject error:", e?.name, e?.message);
			} catch {}
			// If error contains EDGE_DEBUG payload, extract and surface a debug block
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
				// parse "Create project failed: <status> <body>"
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
				if (e?.name === "AbortError") {
					setToast({ message: "Create timed out after 3 minutes. Please try again.", type: "error" });
				} else {
					setToast({ message: `Create failed: ${String(e)}`, type: "error" });
				}
			}
		} finally {
			clearTimeout(timeoutId);
			// always stop spinner/buffering
			setSubmitting(false);
		}
	}

	async function retryUploads(projectId: string) {
		if ((uploadFailures ?? []).length === 0) return;
		setSubmitting(true);
		setToast(null);
		try {
			// extract files from failures
			const filesToRetry = uploadFailures.map((f) => f.file);
			const failed = await tryUploadFiles(projectId, filesToRetry);
			if (failed.length > 0) {
				setUploadFailures(failed);
				setToast({ message: `Some uploads still failed: ${failed.map((f) => f.file.name).join(", ")}`, type: "error" });
			} else {
				setUploadFailures([]);
				setToast({ message: "Uploads completed", type: "success" });
				router.push(`/project/${projectId}`);
			}
		} catch (e) {
			console.error("retryUploads failed", e);
			setToast({ message: "Retry failed", type: "error" });
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
						<AppButton title="Add files" variant="secondary" onPress={pickFile} />
					</View>
					{selectedFiles.map((f, i) => (
						<View key={i} style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
							<Text style={{ flex: 1 }}>{f.name}</Text>
							<TouchableOpacity onPress={() => removeFile(i)} style={{ padding: 8 }}>
								<Text style={{ color: colors.pennRed }}>Remove</Text>
							</TouchableOpacity>
						</View>
					))}
					{uploadFailures.length > 0 ? (
						<View style={{ marginTop: 12 }}>
							<Text style={{ color: colors.pennRed, marginBottom: 6 }}>Uploads failed for:</Text>
							{uploadFailures.map((f, i) => (
								<View key={i} style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
									<Text style={{ flex: 1 }}>{f.file.name}</Text>
									<Text style={{ color: colors.pennRed, marginLeft: 8 }}>{f.error}</Text>
								</View>
							))}
							<AppButton
								title="Retry uploads"
								variant="primary"
								onPress={() => {
									if (createdProjectId) {
										retryUploads(createdProjectId);
									}
								}}
								disabled={!createdProjectId}
							/>
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
};