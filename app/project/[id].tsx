import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Linking } from "react-native";
import { Picker } from "@react-native-picker/picker";
import AppButton from "../../src/components/AppButton";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { getProject, upsertProject } from "../../src/storage/repo";
import { fetchProjectBundleServer } from "../../src/data/projects.server";
import { fetchProjectDetail, addProjectResource, deleteProjectResource, addTaskLink, deleteTaskLink, uploadProjectFile, getSignedFileUrl } from "../../src/data/projectDetail.server";
import { joinProjectServer } from "../../src/data/projects.server";
import { useSession } from "../../src/state/sessionStore";
import Toast from "../../src/components/Toast";
import { updateTaskServer, deleteTaskServer } from "../../src/data/tasks.server";
import AsyncStorage from "@react-native-async-storage/async-storage";
import FloatingButton from "../../src/components/FloatingButton";
import TaskCard from "../../src/components/TaskCard";
import GradientHeader from "../../src/components/GradientHeader";
import Snackbar from "../../src/components/Snackbar";
import { themeStyles } from "../../src/theme/styles";
import { colors } from "../../src/theme/colors";
import { retryPlan } from "../../src/data/plan.server";

const LOCAL_MEMBER_ID_KEY = "gpai_localMemberId";

export default function ProjectDetailRoute() {
	const { id } = useLocalSearchParams() as { id: string };
	const router = useRouter();
	const [project, setProject] = useState<any>(null);
	const [members, setMembers] = useState<any[]>([]);
	const [tasks, setTasks] = useState<any[]>([]);
	const [bundles, setBundles] = useState<any[]>([]);
	const [resources, setResources] = useState<any[]>([]);
	const [deliverables, setDeliverables] = useState<any[]>([]);
	const [localMemberId, setLocalMemberId] = useState<string | null>(null);
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
	// focus/workload UI removed
	const [lastAction, setLastAction] = useState<any | null>(null);
	const [showSnackbar, setShowSnackbar] = useState(false);
	const [linkModalTask, setLinkModalTask] = useState<any | null>(null);
	const [linkValue, setLinkValue] = useState("");
	const [planRetrying, setPlanRetrying] = useState(false);
	const [toast, setToast] = useState<{ message: string; type?: "info" | "error" | "success" } | null>(null);
	const [resourceModalOpen, setResourceModalOpen] = useState(false);
	const [newResourceLabel, setNewResourceLabel] = useState("");
	const [newResourceUrl, setNewResourceUrl] = useState("");
	const [newResourceType, setNewResourceType] = useState<"link" | "text" | "file">("link");
	const [newResourceText, setNewResourceText] = useState("");
	const [newLinkLabel, setNewLinkLabel] = useState("");
	const [newLinkUrl, setNewLinkUrl] = useState("");
	const [addingLink, setAddingLink] = useState(false);
	const [addingDeliverableType, setAddingDeliverableType] = useState<"link" | "text" | null>(null);
	const [newDeliverableLabel, setNewDeliverableLabel] = useState("");
	const [newDeliverableUrl, setNewDeliverableUrl] = useState("");
	const [newDeliverableText, setNewDeliverableText] = useState("");
	const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string; mime?: string; size?: number } | null>(null);
	const [inviteModalOpen, setInviteModalOpen] = useState(false);
	const [joinCodeInput, setJoinCodeInput] = useState("");
	const [inviteDisplayName, setInviteDisplayName] = useState("");
	const [aiNotes, setAiNotes] = useState<string>("");
	const [savingAiNotes, setSavingAiNotes] = useState(false);
	const sessionCtx = useSession();

	useEffect(() => {
		AsyncStorage.getItem(LOCAL_MEMBER_ID_KEY).then((v) => setLocalMemberId(v));
		reload();
	}, []);

	// sync ai notes when project loads
	useEffect(() => {
		if (!project) return;
		setAiNotes(project.project_ai_notes ?? project.ai_notes ?? "");
	}, [project]);

	useFocusEffect(
		React.useCallback(() => {
			reload();
		}, [id])
	);

	async function reload() {
		if (!id) return;
		try {
			const detail = await fetchProjectDetail(id);
			if (detail) {
				setProject(detail.project ?? detail);
				setMembers(detail.members ?? []);
				setBundles(detail.taskBundles ?? []);
				setTasks(detail.tasks ?? []);
				setResources(detail.projectResources ?? []);
				// combine explicit deliverables table rows and project_resources link/text entries
				const fromDeliverables = (detail.deliverables ?? []).map((d: any) => ({
					id: d.id,
					label: d.title,
					type: d.url ? "link" : "text",
					url: d.url ?? null,
					textContent: d.url ? null : null,
				}));
				const fromResources = (detail.projectResources ?? []).filter((r: any) => r.type === "link" || r.type === "text").map((r: any) => ({
					id: r.id,
					label: r.label,
					type: r.type,
					url: r.url ?? null,
					textContent: r.text_content ?? null,
				}));
				setDeliverables([...fromDeliverables, ...fromResources]);
				try {
					const { markProjectOpened } = await import("../../src/data/projects.server");
					await markProjectOpened(id);
				} catch (e) {}
				await upsertProject?.(detail.project ? { ...detail.project, tasks: detail.tasks, deliverables: detail.deliverables, requests: detail.requests, members: detail.members } : detail);
				return;
			}
		} catch (e) {
			// fallback to local
		}
		const p = await getProject(id);
		if (!p) return;
		const updatedProject = { ...p, lastOpenedAt: new Date().toISOString() };
		await upsertProject(updatedProject);
		const reloaded = await getProject(id);
		setProject(reloaded);
	}

	async function handleClaimBundle(bundleId: string) {
		if (!id) return;
		try {
			setToast({ message: "Claiming bundle...", type: "info" });
			// optimistic UI: mark claimed locally if we have localMemberId
			const optimisticMemberId = localMemberId;
			if (optimisticMemberId) {
				setBundles((bs) => bs.map((b) => (b.id === bundleId ? { ...b, claimed_by_member_id: optimisticMemberId } : b)));
				setTasks((ts) => ts.map((t) => (t.bundle_id === bundleId && !t.ownerMemberId ? { ...t, ownerMemberId: optimisticMemberId } : t)));
			}
			const { claimBundle } = await import("../../src/data/taskBundles.server");
			await claimBundle(id, bundleId);
			setToast({ message: "Bundle claimed", type: "success" });
			await reload();
		} catch (e: any) {
			console.error("claim bundle failed", e);
			setToast({ message: `Claim failed: ${e?.message ?? String(e)}`, type: "error" });
			// revert optimistic changes by reloading
			await reload();
		}
	}

	async function toggleTaskDone(task: any) {
		if (!project) return;
		const newStatus = task.status === "done" ? "todo" : "done";
		// optimistic update
		const prevTasks = tasks;
		setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t)));
		try {
			await updateTaskServer(task.id, { status: newStatus });
			setToast({ message: "Saved", type: "success" });
		} catch (e: any) {
			console.error("toggleTaskDone failed", e);
			setTasks(prevTasks); // revert
			setToast({ message: `Failed to update task: ${e?.message ?? String(e)}`, type: "error" });
		}
	}

	async function toggleBlocked(task: any) {
		if (!project) return;
		try {
			const newBlocked = !task.blocked;
			await updateTaskServer(task.id, { blocked: newBlocked });
			setLastAction({ type: "toggleBlocked", before: null, message: `${newBlocked ? "Blocked" : "Unblocked"} "${task.title}"`, undo: async () => {
				await updateTaskServer(task.id, { blocked: task.blocked });
				await reload();
			} });
			setShowSnackbar(true);
			setToast({ message: "Saved", type: "success" });
			await reload();
		} catch (e: any) {
			console.error("toggleBlocked failed", e);
			setToast({ message: `Failed to update: ${e?.message ?? String(e)}`, type: "error" });
		}
	}

	async function deleteTask(task: any) {
		if (!project) return;
		try {
			await deleteTaskServer(task.id);
			setLastAction({ type: "deleteTask", before: null, message: `Deleted "${task.title}"`, undo: async () => {} });
			setShowSnackbar(true);
			setToast({ message: "Deleted", type: "success" });
			await reload();
		} catch (e: any) {
			console.error("deleteTask failed", e);
			setToast({ message: `Failed to delete: ${e?.message ?? String(e)}`, type: "error" });
		}
	}

	function openLinkModal(task: any) {
		setLinkModalTask(task);
		setLinkValue(task.url ?? "");
	}

	async function saveLink() {
		if (!project || !linkModalTask) return;
		const tasksLocal = (project.tasks ?? []).map((t: any) => (t.id === linkModalTask.id ? { ...t, url: linkValue, updatedAt: new Date().toISOString() } : t));
		const newProject = { ...project, tasks: tasksLocal };
		await upsertProject(newProject);
		setProject(newProject);
		setLinkModalTask(null);
		setLinkValue("");
	}

	async function handleAddResource() {
		if (!id) return;
		try {
			setToast({ message: "Saving...", type: "info" });
			if (newResourceType === "link") {
				await addProjectResource(id, { label: newResourceLabel, url: newResourceUrl, type: "link" });
			} else if (newResourceType === "text") {
				await addProjectResource(id, { label: newResourceLabel, type: "text", text_content: newResourceText });
			} else if (newResourceType === "file") {
				if (!selectedFile) throw new Error("No file selected");
				// upload file then insert resource row
				const uploadRes = await uploadProjectFile(id, selectedFile.uri, selectedFile.name);
				await addProjectResource(id, {
					label: newResourceLabel,
					type: "file",
					file_path: uploadRes.path,
					mime_type: uploadRes.mime_type,
					size_bytes: uploadRes.size_bytes,
				});
			}
			setToast({ message: "Saved", type: "success" });
			setResourceModalOpen(false);
			setNewResourceLabel("");
			setNewResourceUrl("");
			setNewResourceText("");
			setSelectedFile(null);
			setNewResourceType("link");
			await reload();
		} catch (e: any) {
			console.error("addProjectResource error", e);
			setToast({ message: `Failed to save: ${e?.message ?? String(e)}`, type: "error" });
		}
	}

	async function handleDeleteResource(rId: string) {
		try {
			setToast({ message: "Deleting...", type: "info" });
			await deleteProjectResource(rId);
			setToast({ message: "Deleted", type: "success" });
			await reload();
		} catch (e: any) {
			console.error("deleteProjectResource error", e);
			setToast({ message: `Failed to delete: ${e?.message ?? String(e)}`, type: "error" });
		}
	}

	async function saveAiNotes() {
		if (!id) return;
		try {
			setSavingAiNotes(true);
			const { updateProjectNotes } = await import("../../src/data/projectDetail.server");
			await updateProjectNotes(id, aiNotes);
			setToast({ message: "Saved notes", type: "success" });
			await reload();
		} catch (e: any) {
			console.error("saveAiNotes error", e);
			setToast({ message: `Failed to save notes: ${e?.message ?? String(e)}`, type: "error" });
		} finally {
			setSavingAiNotes(false);
		}
	}

	const yourTasks = (tasks ?? []).filter((t: any) => t.ownerMemberId === localMemberId && t.status !== "done");

	// grouping by member
	const unassignedTasks = (tasks ?? []).filter((t: any) => !t.ownerMemberId);
	const tasksByMember: Record<string, any[]> = {};
	(members ?? []).forEach((m) => {
		tasksByMember[m.id] = (tasks ?? []).filter((t: any) => t.ownerMemberId === m.id);
		tasksByMember[m.id].sort((a: any, b: any) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime());
	});

	return (
		<View style={themeStyles.screen}>
			{project ? (
				<>
					<TouchableOpacity onPress={() => router.push("/projects")} style={{ marginBottom: 8 }}>
						<Text style={{ color: colors.primaryBlue }}>← Back to Projects</Text>
					</TouchableOpacity>

					{/* Project title + meta */}
					<View style={{ marginBottom: 8 }}>
						<Text style={styles.title}>{project.name}</Text>
						<View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
							<View style={styles.pill}>
								<Text style={styles.pillText}>{project.timeframe}</Text>
							</View>
							<View style={{ width: 8 }} />
							<Text style={{ color: "#6B7280" }}>{(project.tasks ?? []).length} tasks</Text>
						</View>
					</View>

					{/* Invite / Join (visible below title) */}
					<View style={styles.joinCard}>
						<Text style={{ fontWeight: "600" }}>Join code: <Text style={{ fontWeight: "700" }}>{project.join_code ?? project.joinCode ?? "—"}</Text></Text>
						<View style={{ flexDirection: "row", marginTop: 8 }}>
							<AppButton
								title="Copy code"
								variant="secondary"
								onPress={async () => {
									try {
										const cb = require("expo-clipboard");
										await cb.setStringAsync(project.join_code ?? project.joinCode ?? "");
										setToast({ message: "Copied", type: "success" });
									} catch (e) {
										setToast({ message: "Copy failed", type: "error" });
									}
								}}
							/>
							<View style={{ width: 8 }} />
							<AppButton
								title="Join Project"
								variant="primary"
								onPress={() => {
									setJoinCodeInput(project.join_code ?? project.joinCode ?? "");
									const def = sessionCtx?.profile?.full_name ?? (sessionCtx?.session?.user?.email?.split("@")[0] ?? "");
									setInviteDisplayName(def);
									setInviteModalOpen(true);
								}}
							/>
						</View>
					</View>

					{/* Assignment (collapsible) */}
					{(project.assignmentTitle || project.assignmentDetails) ? (
						<View style={{ marginTop: 12 }}>
							<TouchableOpacity onPress={() => setCollapsed((c) => ({ ...c, assignment: !c.assignment }))} style={{ marginBottom: 8 }}>
								<Text style={{ fontWeight: "700", color: colors.primaryRed }}>Assignment</Text>
							</TouchableOpacity>
							{!collapsed.assignment ? (
								<View style={{ backgroundColor: "#fff", padding: 12, borderRadius: 12 }}>
									{project.assignmentTitle ? <Text style={{ fontWeight: "700", marginBottom: 6 }}>{project.assignmentTitle}</Text> : null}
									{project.assignmentDetails ? <Text style={{ color: "#374151" }}>{project.assignmentDetails}</Text> : <Text style={{ color: "#6B7280" }}>No assignment details</Text>}
								</View>
							) : null}
						</View>
					) : null}

			{/* Plan generation status and retry */}
			{project?.plan_status === "failed" ? (
				<View style={{ marginTop: 12 }}>
					<Text style={{ color: colors.pennRed, fontWeight: "600", marginBottom: 8 }}>Plan generation failed.</Text>
					{project.plan_error ? <Text style={{ color: "#6B7280", marginBottom: 8 }}>{project.plan_error}</Text> : null}
					<AppButton title={planRetrying ? "Retrying..." : "Retry plan generation"} variant="primary" onPress={async () => {
						if (!id || planRetrying) return;
						setPlanRetrying(true);
						setToast({ message: "Retrying plan generation...", type: "info" });
						try {
							await retryPlan(id);
							setToast({ message: "Retry requested, updating...", type: "success" });
							await reload();
						} catch (e: any) {
							console.error("retryPlan failed", e);
							setToast({ message: `Retry failed: ${e?.message ?? String(e)}`, type: "error" });
						} finally {
							setPlanRetrying(false);
						}
					}} disabled={planRetrying} />
				</View>
			) : project?.plan_status === "pending" ? (
				<View style={{ marginTop: 12 }}>
					<Text style={{ color: "#6B7280", fontWeight: "600" }}>Generating plan...</Text>
				</View>
			) : null}

					{yourTasks.length > 0 && (
						<View style={{ marginVertical: 12 }}>
							<Text style={{ fontWeight: "600" }}>Your Tasks</Text>
							<FlatList
								horizontal
								data={yourTasks}
								keyExtractor={(t: any) => t.id}
								renderItem={({ item }) => (
							<TouchableOpacity style={[styles.chip, { backgroundColor: colors.blueLight }]} onPress={() => toggleTaskDone(item)}>
										<Text style={{ flex: 1, fontWeight: "600" }}>{item.title}</Text>
										<Text style={{ color: item.status === "done" ? "#0a0" : "#666" }}>{item.status === "done" ? "✓" : "○"}</Text>
									</TouchableOpacity>
								)}
							/>
						</View>
					)}

					{/* Tasks grouped by member */}
					{/* Member bubbles */}
					{/* Bundles (AI-generated plans) */}
				{(bundles ?? []).length > 0 ? (
					<View style={{ marginTop: 12, marginBottom: 12 }}>
						<Text style={{ fontWeight: "600", marginBottom: 8 }}>Bundles</Text>
						<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
							{(() => {
								// deterministic color palette and helper
								const palette = ["#F97316", "#06B6D4", "#7C3AED", "#10B981", "#EF4444", "#F59E0B", "#3B82F6"];
								function getColorForMemberId(memberId: string | null) {
									if (!memberId) return null;
									// simple hash to pick a color index
									let h = 0;
									for (let i = 0; i < memberId.length; i++) {
										h = (h << 5) - h + memberId.charCodeAt(i);
										h |= 0;
									}
									const idx = Math.abs(h) % palette.length;
									return palette[idx];
								}
								return bundles.map((b) => {
									const bTasks = (tasks ?? []).filter((t: any) => t.bundle_id === b.id);
									const claimedBy = members.find((m: any) => m.id === b.claimed_by_member_id);
									const claimed = Boolean(b.claimed_by_member_id);
									const claimerColor = claimed ? getColorForMemberId(b.claimed_by_member_id) : null;
									const bubbleStyle = [
										styles.bubble,
										{ backgroundColor: claimed ? claimerColor : "#F3F4F6" },
									];
									const titleStyle = { fontWeight: "700", flex: 1, color: claimed ? "#fff" : "#0F172A" };
									const summaryStyle = { color: claimed ? "rgba(255,255,255,0.9)" : "#374151", marginBottom: 8 };
									return (
										<View key={b.id} style={bubbleStyle}>
											<View style={styles.bubbleHeader}>
												<Text style={titleStyle}>{b.title}</Text>
												<Text style={{ color: claimed ? "rgba(255,255,255,0.9)" : "#6B7280" }}>{b.total_points ?? 0} pts</Text>
											</View>
											{b.summary ? <Text style={summaryStyle}>{b.summary}</Text> : null}
											<View style={styles.bubbleBody}>
												{bTasks.length === 0 ? <Text style={{ color: claimed ? "rgba(255,255,255,0.9)" : "#6B7280" }}>No tasks</Text> : bTasks.map((task: any) => (
													<TaskCard key={task.id} task={task} onDone={() => toggleTaskDone(task)} onReassign={() => {}} onAddLink={() => openLinkModal(task)} onDelete={() => deleteTask(task)} />
												))}
												{b.claimed_by_member_id ? (
													<Text style={{ marginTop: 8, color: claimed ? "rgba(255,255,255,0.95)" : "#6B7280" }}>Claimed by {claimedBy ? claimedBy.displayName : "Member"}</Text>
												) : (
													<AppButton title="Claim" variant="primary" onPress={() => handleClaimBundle(b.id)} />
												)}
											</View>
										</View>
									);
								});
							})()}
						</View>
					</View>
				) : null}
					<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
						{(members ?? []).map((m) => (
							<View key={m.id} style={styles.bubble}>
								<View style={styles.bubbleHeader}>
									<View style={styles.avatar}>
										<Text style={{ color: "#fff", fontWeight: "700" }}>{(m.displayName || "U").slice(0, 1).toUpperCase()}</Text>
									</View>
									<Text style={styles.memberName}>{m.displayName || "Unnamed"}</Text>
									<Text style={styles.memberCount}>{(tasksByMember[m.id] ?? []).length}</Text>
								</View>
								<View style={styles.bubbleBody}>
									{(tasksByMember[m.id] ?? []).length === 0 ? (
										<Text style={{ color: "#6B7280" }}>No tasks</Text>
									) : (
										(tasksByMember[m.id] ?? []).map((task: any) => (
											<TaskCard
												key={task.id}
												task={task}
												onDone={() => toggleTaskDone(task)}
												onReassign={() => {}}
												onAddLink={() => openLinkModal(task)}
												onDelete={() => deleteTask(task)}
											/>
										))
									)}
								</View>
							</View>
						))}
						{/* Unassigned bubble */}
						<View key="unassigned" style={styles.bubble}>
							<View style={styles.bubbleHeader}>
								<View style={styles.avatar}>
									<Text style={{ color: "#fff", fontWeight: "700" }}>—</Text>
								</View>
								<Text style={styles.memberName}>Unassigned</Text>
								<Text style={styles.memberCount}>{unassignedTasks.length}</Text>
							</View>
							<View style={styles.bubbleBody}>
								{unassignedTasks.length === 0 ? (
									<Text style={{ color: "#6B7280" }}>No tasks</Text>
								) : (
									unassignedTasks.map((task: any) => (
										<TaskCard
											key={task.id}
											task={task}
											onDone={() => toggleTaskDone(task)}
											onReassign={() => {}}
											onAddLink={() => openLinkModal(task)}
											onDelete={() => deleteTask(task)}
										/>
									))
								)}
							</View>
						</View>
					</View>

					{/* Unassigned tasks */}
					<View style={{ marginTop: 12 }}>
						<Text style={{ fontWeight: "700", marginBottom: 6 }}>Unassigned</Text>
						{unassignedTasks.length === 0 ? <Text style={{ color: "#6B7280" }}>No unassigned tasks</Text> : unassignedTasks.map((task) => (
							<View key={task.id} style={styles.taskWrap}>
								<View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
									<View style={{ flex: 1 }}>
										<Text style={{ fontWeight: "700" }}>{task.title}</Text>
										<Text style={{ color: "#6B7280", marginTop: 4 }}>{task.size} • {task.status}</Text>
									</View>
														<TouchableOpacity onPress={() => toggleTaskDone(task)} style={styles.smallBtn}>
															<Text style={{ color: colors.pennBlue }}>{task.status === "done" ? "Undo" : "Done"}</Text>
														</TouchableOpacity>
								</View>
							</View>
						))}
					</View>

					{/* Focus and Workload controls removed */}

					{/* category grouping removed in favor of member grouping */}

					{/* Project resources */}
					<View style={{ marginTop: 12 }}>
						<Text style={{ fontWeight: "600", marginBottom: 8 }}>Resources</Text>
						{(resources ?? []).map((r: any) => (
							<View key={r.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
								{r.type === "link" ? (
									<TouchableOpacity onPress={() => { try { Linking.openURL(r.url); } catch {} }}>
										<Text style={{ color: colors.primaryBlue }}>{r.label}</Text>
									</TouchableOpacity>
								) : r.type === "text" ? (
									<View style={{ flex: 1 }}>
										<Text style={{ fontWeight: "700" }}>{r.label}</Text>
										<Text numberOfLines={2} style={{ color: "#374151" }}>{r.textContent}</Text>
									</View>
								) : (
									<TouchableOpacity onPress={async () => {
										try {
											const url = await getSignedFileUrl(r.filePath);
											Linking.openURL(url);
										} catch (e) {
											setToast({ message: "Failed to open file", type: "error" });
										}
									}}>
										<Text style={{ color: colors.primaryBlue }}>{r.label} — {r.filePath?.split("/").pop()}</Text>
									</TouchableOpacity>
								)}
								<TouchableOpacity onPress={() => handleDeleteResource(r.id)} style={{ padding: 6 }}>
									<Text style={{ color: colors.primaryRed }}>Delete</Text>
								</TouchableOpacity>
							</View>
						))}
						<View style={{ flexDirection: "row", marginTop: 8 }}>
							<AppButton title="Add resource" variant="secondary" onPress={() => setResourceModalOpen(true)} />
						</View>
					{/* Simple Links form */}
					<View style={{ marginTop: 12 }}>
						<Text style={{ fontWeight: "600", marginBottom: 6 }}>Links</Text>
						{(resources ?? []).filter((r: any) => r.type === "link").map((r: any) => (
							<View key={r.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
								<TouchableOpacity onPress={async () => { try { Linking.openURL(r.url); } catch {} }}>
									<Text style={{ color: colors.primaryBlue }}>{r.label} — {r.url}</Text>
								</TouchableOpacity>
							</View>
						))}
						<View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
							<TextInput placeholder="Title" value={newLinkLabel} onChangeText={setNewLinkLabel} style={{ flex: 1, borderWidth: 1, borderColor: "#ddd", padding: 8, marginRight: 8 }} />
							<TextInput placeholder="https://..." value={newLinkUrl} onChangeText={setNewLinkUrl} style={{ width: 220, borderWidth: 1, borderColor: "#ddd", padding: 8, marginRight: 8 }} />
							<AppButton
								title={addingLink ? "Adding..." : "Add"}
								variant="primary"
								onPress={async () => {
									if (!id) return;
									if (!newLinkLabel || !newLinkUrl) {
										setToast({ message: "Provide title and URL", type: "error" });
										return;
									}
									try {
										setAddingLink(true);
										await addProjectResource(id, { label: newLinkLabel, type: "link", url: newLinkUrl });
										setNewLinkLabel("");
										setNewLinkUrl("");
										setToast({ message: "Link added", type: "success" });
										await reload();
									} catch (e: any) {
										console.error("add link failed", e);
										setToast({ message: `Add failed: ${e?.message ?? String(e)}`, type: "error" });
									} finally {
										setAddingLink(false);
									}
								}}
							/>
						</View>
					</View>
					</View>

					{/* Deliverables (folder) */}
					<View style={{ marginTop: 12 }}>
						<TouchableOpacity onPress={() => setCollapsed((c) => ({ ...c, deliverables: !c.deliverables }))} style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
							<Text style={{ fontWeight: "700" }}>Deliverables {(deliverables ?? []).length ? `(${deliverables.length})` : ""}</Text>
							<Text style={{ color: "#6B7280" }}>{collapsed.deliverables ? "▸" : "▾"}</Text>
						</TouchableOpacity>
						{!collapsed.deliverables ? (
							<View style={{ backgroundColor: "#fff", padding: 12, borderRadius: 12 }}>
								{(deliverables ?? []).length === 0 ? <Text style={{ color: "#6B7280" }}>No deliverables</Text> : deliverables.map((d: any) => (
									<View key={d.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
										<View style={{ flex: 1 }}>
											<Text style={{ fontWeight: "700" }}>{d.label}</Text>
											{d.type === "link" ? (
												<TouchableOpacity onPress={() => { try { Linking.openURL(d.url); } catch {} }}>
													<Text style={{ color: colors.primaryBlue }}>{d.url}</Text>
												</TouchableOpacity>
											) : d.type === "text" ? (
												<Text numberOfLines={2} style={{ color: "#374151" }}>{d.textContent ?? ""}</Text>
											) : (
												<Text style={{ color: "#6B7280" }}>File (coming soon)</Text>
											)}
										</View>
										<TouchableOpacity onPress={() => handleDeleteResource(d.id)} style={{ padding: 6 }}>
											<Text style={{ color: colors.primaryRed }}>Delete</Text>
										</TouchableOpacity>
									</View>
								))}

								{/* Add buttons */}
								<View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
									<AppButton title="Add link" variant="secondary" onPress={() => { setAddingDeliverableType("link"); setNewDeliverableLabel(""); setNewDeliverableUrl(""); }} />
									<View style={{ width: 8 }} />
									<AppButton title="Add note" variant="secondary" onPress={() => { setAddingDeliverableType("text"); setNewDeliverableLabel(""); setNewDeliverableText(""); }} />
								</View>

								{/* Add forms */}
								{addingDeliverableType === "link" ? (
									<View style={{ marginTop: 8 }}>
										<TextInput placeholder="Title" value={newDeliverableLabel} onChangeText={setNewDeliverableLabel} style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 8 }} />
										<TextInput placeholder="https://..." value={newDeliverableUrl} onChangeText={setNewDeliverableUrl} style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 8 }} />
										<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
											<AppButton title="Cancel" variant="secondary" onPress={() => setAddingDeliverableType(null)} />
											<AppButton title="Save" variant="primary" onPress={async () => {
												if (!id) return;
												if (!newDeliverableLabel || !newDeliverableUrl) {
													setToast({ message: "Provide title and URL", type: "error" });
													return;
												}
												try {
													await addProjectResource(id, { label: newDeliverableLabel, type: "link", url: newDeliverableUrl });
													setToast({ message: "Deliverable added", type: "success" });
													setAddingDeliverableType(null);
													await reload();
												} catch (e: any) {
													console.error("add deliverable link failed", e);
													setToast({ message: `Add failed: ${e?.message ?? String(e)}`, type: "error" });
												}
											}} />
										</View>
									</View>
								) : null}
								{addingDeliverableType === "text" ? (
									<View style={{ marginTop: 8 }}>
										<TextInput placeholder="Title" value={newDeliverableLabel} onChangeText={setNewDeliverableLabel} style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 8 }} />
										<TextInput placeholder="Note" value={newDeliverableText} onChangeText={setNewDeliverableText} multiline style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, minHeight: 120, marginBottom: 8 }} />
										<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
											<AppButton title="Cancel" variant="secondary" onPress={() => setAddingDeliverableType(null)} />
											<AppButton title="Save" variant="primary" onPress={async () => {
												if (!id) return;
												if (!newDeliverableLabel || !newDeliverableText) {
													setToast({ message: "Provide title and note", type: "error" });
													return;
												}
												try {
													await addProjectResource(id, { label: newDeliverableLabel, type: "text", text_content: newDeliverableText });
													setToast({ message: "Deliverable added", type: "success" });
													setAddingDeliverableType(null);
													await reload();
												} catch (e: any) {
													console.error("add deliverable text failed", e);
													setToast({ message: `Add failed: ${e?.message ?? String(e)}`, type: "error" });
												}
											}} />
										</View>
									</View>
								) : null}
							</View>
						) : null}
					</View>

					{/* Resources for AI */}
					<View style={{ marginTop: 12 }}>
						<Text style={{ fontWeight: "600", marginBottom: 8 }}>Resources for AI</Text>
						{/* links list */}
						{(resources ?? []).map((r: any) => (
							<View key={`ai-${r.id}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
								<TouchableOpacity onPress={async () => {
									try {
										if (r.type === "link") {
											Linking.openURL(r.url);
										} else if (r.type === "file") {
											const url = await getSignedFileUrl(r.filePath);
											Linking.openURL(url);
										} else {
											// text - do nothing (could expand)
										}
									} catch (e) {}
								}}>
									<Text style={{ color: colors.primaryBlue }}>{r.label}{r.type === "link" ? ` — ${r.url}` : r.type === "file" ? ` — ${r.filePath?.split("/").pop()}` : ""}</Text>
								</TouchableOpacity>
							</View>
						))}
						{/* notes */}
						<Text style={{ fontWeight: "600", marginTop: 8, marginBottom: 6 }}>Notes</Text>
						<TextInput
							placeholder="Notes to pass to AI later..."
							multiline
							value={aiNotes}
							onChangeText={setAiNotes}
							style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, minHeight: 120, backgroundColor: "#fff", borderRadius: 8 }}
						/>
						<View style={{ flexDirection: "row", marginTop: 8 }}>
							<AppButton title={savingAiNotes ? "Saving..." : "Save notes"} onPress={saveAiNotes} disabled={savingAiNotes} variant="primary" loading={savingAiNotes} />
						</View>
					</View>

					{/* Resource modal */}
					{resourceModalOpen ? (
						<View style={{ position: "absolute", left: 16, right: 16, bottom: 80, backgroundColor: "#fff", padding: 12, borderRadius: 12 }}>
							<Text style={{ fontWeight: "700", marginBottom: 8 }}>Add resource</Text>
							<TextInput placeholder="Label" value={newResourceLabel} onChangeText={setNewResourceLabel} style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 8 }} />
							<View style={{ borderWidth: 1, borderColor: "#ddd", marginBottom: 8 }}>
								<Picker selectedValue={newResourceType} onValueChange={(v) => setNewResourceType(v as any)}>
									<Picker.Item label="Link" value="link" />
									<Picker.Item label="Text" value="text" />
									<Picker.Item label="File" value="file" />
								</Picker>
							</View>
							{newResourceType === "link" ? (
								<TextInput placeholder="URL" value={newResourceUrl} onChangeText={setNewResourceUrl} style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 8 }} />
							) : newResourceType === "text" ? (
								<TextInput placeholder="Text content" value={newResourceText} onChangeText={setNewResourceText} multiline style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, minHeight: 120, marginBottom: 8 }} />
							) : (
								<>
									<TouchableOpacity onPress={async () => {
										// try document picker first, fallback to image picker
										try {
											const docPicker = await import("expo-document-picker");
											const res = await docPicker.getDocumentAsync({ type: "*/*" });
											if (res.type === "success") {
												setSelectedFile({ uri: res.uri, name: res.name, mime: (res as any).mimeType, size: (res as any).size });
											}
										} catch (e) {
											try {
												const img = await import("expo-image-picker");
												const r = await img.launchImageLibraryAsync({ mediaTypes: img.MediaTypeOptions.All, quality: 0.8 });
												if (!r.cancelled) {
													// @ts-ignore
													setSelectedFile({ uri: r.uri, name: r.uri.split("/").pop() ?? "photo.jpg", mime: (r as any).type ?? "image/jpeg", size: (r as any).fileSize });
												}
											} catch (ee) {
												setToast({ message: "No picker available", type: "error" });
											}
										}
									}} style={{ padding: 12, backgroundColor: "#f3f4f6", borderRadius: 8, marginBottom: 8 }}>
										<Text>{selectedFile ? `Selected: ${selectedFile.name}` : "Pick file"}</Text>
									</TouchableOpacity>
								</>
							)}
							<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
								<AppButton title="Cancel" variant="secondary" onPress={() => setResourceModalOpen(false)} />
								<AppButton title="Save" variant="primary" onPress={handleAddResource} />
							</View>
						</View>
					) : null}

					{/* Invite modal */}
					{inviteModalOpen ? (
						<View style={{ position: "absolute", left: 16, right: 16, bottom: 80, backgroundColor: "#fff", padding: 12, borderRadius: 12 }}>
							<Text style={{ fontWeight: "700", marginBottom: 8 }}>Join project</Text>
							<TextInput placeholder="Join code" value={joinCodeInput} onChangeText={setJoinCodeInput} style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 8 }} />
							<TextInput placeholder="Your display name" value={inviteDisplayName} onChangeText={setInviteDisplayName} style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 8 }} />
							<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
								<AppButton title="Cancel" variant="secondary" onPress={() => setInviteModalOpen(false)} />
								<AppButton title="Join" variant="primary" onPress={async () => {
									try {
										setToast({ message: "Joining...", type: "info" });
										const projId = await joinProjectServer({ joinCode: joinCodeInput, displayName: inviteDisplayName });
										setToast({ message: "Joined project", type: "success" });
										setInviteModalOpen(false);
										await reload();
										router.replace(`/project/${projId}`);
									} catch (e: any) {
										console.error("joinProject error", e);
										setToast({ message: `Join failed: ${e?.message ?? String(e)}`, type: "error" });
									}
								}} />
							</View>
						</View>
					) : null}

					<FloatingButton onPress={() => router.push(`/project/${id}/add-task`)} />
					{showSnackbar && lastAction ? (
						<Snackbar
							message={lastAction.message}
							actionLabel="Undo"
							onAction={async () => {
								await lastAction.undo();
								setShowSnackbar(false);
								setLastAction(null);
							}}
							onDismiss={() => {
								setShowSnackbar(false);
								setLastAction(null);
							}}
						/>
					) : null}

					{/* Add Link Modal */}
					{linkModalTask ? (
						<View style={{ position: "absolute", left: 16, right: 16, bottom: 80, backgroundColor: "#fff", padding: 12, borderRadius: 12 }}>
							<Text style={{ fontWeight: "700", marginBottom: 8 }}>Add link for task</Text>
							<TextInput value={linkValue} onChangeText={setLinkValue} placeholder="https://..." style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 8 }} />
							<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
								<AppButton title="Cancel" variant="secondary" onPress={() => setLinkModalTask(null)} />
								<AppButton title="Save" variant="primary" onPress={saveLink} />
							</View>
						</View>
					) : null}
				</>
			) : (
				<Text>Loading...</Text>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	chip: {
		backgroundColor: "#f1f1f1",
		padding: 8,
		borderRadius: 16,
		marginRight: 8,
		flexDirection: "row",
		alignItems: "center",
	},
	taskWrap: {
		backgroundColor: "#fff",
		padding: 12,
		borderRadius: 12,
		marginBottom: 8,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.06,
		shadowRadius: 6,
		elevation: 2,
	},
	smallBtn: {
		paddingVertical: 6,
		paddingHorizontal: 10,
		borderRadius: 8,
		backgroundColor: "#F3F4F6",
	},
	taskRow: {
		padding: 8,
		borderBottomWidth: 1,
		borderBottomColor: "#eee",
		flexDirection: "row",
		alignItems: "center",
	},
	title: {
		fontSize: 26,
		fontWeight: "800",
		color: "#0F172A",
	},
	pill: {
		backgroundColor: colors.primaryBlue + "22",
		paddingVertical: 6,
		paddingHorizontal: 10,
		borderRadius: 999,
	},
	pillText: {
		color: colors.primaryBlue,
		fontWeight: "700",
	},
	joinCard: {
		marginBottom: 12,
		padding: 12,
		backgroundColor: "#fff",
		borderRadius: 12,
	},
	bubble: {
		backgroundColor: "#fff",
		borderRadius: 18,
		padding: 12,
		marginBottom: 12,
		marginRight: 12,
		width: 320,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.06,
		shadowRadius: 6,
		elevation: 2,
	},
	bubbleHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 8,
	},
	avatar: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: "#6B7280",
		justifyContent: "center",
		alignItems: "center",
		marginRight: 10,
	},
	memberName: {
		fontWeight: "700",
		flex: 1,
	},
	memberCount: {
		color: "#6B7280",
		fontWeight: "700",
	},
	bubbleBody: {
		marginTop: 6,
	},
});

