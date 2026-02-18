import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Linking, ScrollView, Pressable } from "react-native";
import { Picker } from "@react-native-picker/picker";
import AppButton from "../../src/components/AppButton";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { getProject, upsertProject } from "../../src/storage/repo";
import { fetchProjectBundleServer } from "../../src/data/projects.server";
import { fetchProjectDetail, addProjectResource, deleteProjectResource, addTaskLink, deleteTaskLink, uploadProjectFile, getSignedFileUrl } from "../../src/data/projectDetail.server";
import { useSession } from "../../src/state/sessionStore";
import Toast from "../../src/components/Toast";
import { updateTaskServer, deleteTaskServer } from "../../src/data/tasks.server";
import TaskCard from "../../src/components/TaskCard";
import GradientHeader from "../../src/components/GradientHeader";
import Snackbar from "../../src/components/Snackbar";
import { themeStyles } from "../../src/theme/styles";
import { colors } from "../../src/theme/colors";
import { retryPlan } from "../../src/data/plan.server";
import { formatTimeframe } from "../../src/utils/formatTimeframe";

export default function ProjectDetailRoute() {
	const { id } = useLocalSearchParams() as { id: string };
	const router = useRouter();
	const [project, setProject] = useState<any>(null);
	const [members, setMembers] = useState<any[]>([]);
	const [tasks, setTasks] = useState<any[]>([]);
	const [bundles, setBundles] = useState<any[]>([]);
	const [resources, setResources] = useState<any[]>([]);
	const [deliverables, setDeliverables] = useState<any[]>([]);
	const [plannedMembers, setPlannedMembers] = useState<any[]>([]);
	const [taskLinks, setTaskLinks] = useState<any[]>([]);
	const [myMemberId, setMyMemberId] = useState<string | null>(null);
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
	// focus/workload UI removed
	const [lastAction, setLastAction] = useState<any | null>(null);
	const [showSnackbar, setShowSnackbar] = useState(false);
	const [linkingTaskId, setLinkingTaskId] = useState<string | null>(null);
	const [linkingTaskTitle, setLinkingTaskTitle] = useState<string>(""); 
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
	const [notes, setNotes] = useState<string>("");
	const [savingNotes, setSavingNotes] = useState(false);
	const sessionCtx = useSession();
	const sessionMemberId = sessionCtx?.memberships?.[id] ?? null;
	const [reassignTaskId, setReassignTaskId] = useState<string | null>(null);
	const [reassignMemberId, setReassignMemberId] = useState<string | null>(null);
	const [reassigning, setReassigning] = useState(false);
	const [linkSaving, setLinkSaving] = useState(false);
	const membersById = useMemo(() => {
		const map: Record<string, any> = {};
		(members ?? []).forEach((member) => {
			if (member?.id) map[member.id] = member;
		});
		return map;
	}, [members]);
	const bundlesByMemberId = useMemo(() => {
		const map: Record<string, any> = {};
		(bundles ?? []).forEach((bundle) => {
			if (bundle?.claimed_by_member_id) map[bundle.claimed_by_member_id] = bundle;
		});
		return map;
	}, [bundles]);
	const unclaimedBundles = useMemo(() => (bundles ?? []).filter((bundle) => !bundle?.claimed_by_member_id), [bundles]);

	useEffect(() => {
		reload();
	}, []);

	useEffect(() => {
		if (sessionMemberId && sessionMemberId !== myMemberId) {
			setMyMemberId(sessionMemberId);
		}
	}, [sessionMemberId, myMemberId]);

	const resolvedMemberId = myMemberId ?? sessionMemberId ?? null;
	const aiDeliverableItems = (deliverables ?? []).filter((d: any) => d.isDeliverable);
	const remainingTasksCount = (tasks ?? []).filter((t: any) => t.status !== "done").length;

	// sync notes when project loads
	useEffect(() => {
		if (!project) return;
		setNotes(project.project_notes ?? project.project_ai_notes ?? project.ai_notes ?? "");
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
				setMyMemberId(detail.myMemberId ?? sessionMemberId ?? null);
				setBundles(detail.taskBundles ?? []);
				setTasks(detail.tasks ?? []);
				setResources(detail.projectResources ?? []);
				setPlannedMembers(detail.plannedMembers ?? []);
				setTaskLinks(detail.taskLinks ?? []);
				// combine explicit deliverables table rows and project_resources link/text entries
				const fromDeliverables = (detail.deliverables ?? []).map((d: any) => ({
					id: d.id,
					label: d.title,
					title: d.title,
					description: d.description ?? "",
					type: d.url ? "link" : "text",
					url: d.url ?? null,
					textContent: d.description ?? null,
					isDeliverable: true,
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
		setPlannedMembers([]);
		setTaskLinks([]);
		setMyMemberId(sessionMemberId ?? null);
	}

	async function handleClaimBundle(bundleId: string) {
		if (!id) return;
		try {
			setToast({ message: "Claiming bundle...", type: "info" });
			const optimisticMemberId = resolvedMemberId;
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
		setLinkingTaskId(task.id);
		setLinkingTaskTitle(task.title ?? "");
		setLinkValue(task.url ?? "");
	}

	function openReassignPanel(task: any) {
		setReassignTaskId(task.id);
		setReassignMemberId(task.ownerMemberId ?? null);
	}

	async function saveReassign(taskId: string) {
		if (!id || !taskId) return;
		const targetId = reassignMemberId ?? null;
		setReassigning(true);
		setToast({ message: "Reassigning task...", type: "info" });
		try {
			const currentTask = tasks?.find((t: any) => t.id === taskId);
			const currentBundleId = currentTask?.bundle_id ?? currentTask?.bundleId ?? null;
			const targetBundleId = getBundleIdForMember(targetId);
			const newBundleId = targetId ? targetBundleId ?? currentBundleId : null;
			await updateTaskServer(taskId, { owner_member_id: targetId, bundle_id: newBundleId });
			setTasks((ts) =>
				ts.map((t) =>
					t.id === taskId
						? {
								...t,
								ownerMemberId: targetId,
								bundleId: newBundleId,
								bundle_id: newBundleId,
						  }
						: t
				)
			);
			setToast({ message: "Task reassigned", type: "success" });
			setReassignTaskId(null);
		} catch (e: any) {
			console.error("saveReassign failed", e);
			setToast({ message: `Failed to reassign: ${e?.message ?? String(e)}`, type: "error" });
		} finally {
			setReassigning(false);
		}
	}

	async function saveLink() {
		if (!id || !linkingTaskId) return;
		if (!linkValue) {
			setToast({ message: "Provide a link", type: "error" });
			return;
		}
		setLinkSaving(true);
		setToast({ message: "Saving link...", type: "info" });
		try {
			const created = await addTaskLink(id, linkingTaskId, {
				label: linkingTaskTitle || `Link ${linkingTaskId}`,
				url: linkValue,
			});
			setTaskLinks((prev) => [...prev, created]);
			setToast({ message: "Link saved", type: "success" });
			setLinkingTaskId(null);
			setLinkingTaskTitle("");
			setLinkValue("");
		} catch (e: any) {
			console.error("saveLink failed", e);
			setToast({ message: `Failed to save link: ${e?.message ?? String(e)}`, type: "error" });
		} finally {
			setLinkSaving(false);
		}
	}

	function renderLinkPanel(task: any) {
		if (linkingTaskId !== task.id) return null;
		return (
			<View style={styles.inlinePanel}>
				<Text style={styles.inlineLabel}>Add link</Text>
				<TextInput
					value={linkValue}
					onChangeText={setLinkValue}
					placeholder="https://..."
					style={styles.linkInput}
					autoCapitalize="none"
					autoCorrect={false}
				/>
				<View style={styles.inlineControls}>
					<AppButton
						title="Cancel"
						variant="secondary"
						onPress={() => {
							setLinkModalTask(null);
							setLinkValue("");
						}}
					/>
					<View style={{ width: 8 }} />
					<AppButton title={linkSaving ? "Saving..." : "Save"} variant="primary" onPress={saveLink} disabled={linkSaving} />
				</View>
			</View>
		);
	}

	function getBundleDisplayTitle(bundle: any) {
		if (!bundle) return "Bundle";
		const ownerId = bundle.claimed_by_member_id;
		if (ownerId) {
			const owner = membersById[ownerId];
			if (owner) {
				return `${getMemberLabel(owner)}'s Bundle`;
			}
			return "Claimed bundle";
		}
		return bundle.label ?? bundle.title ?? "Bundle";
	}

	function getBundleIdForMember(memberId?: string | null) {
		if (!memberId) return null;
		const owned = bundlesByMemberId[memberId];
		if (owned) return owned.id;
		const member = membersById[memberId];
		const hint = member ? getMemberLabel(member) : "";
		if (hint) {
			const fallback = unclaimedBundles.find((bundle) => {
				const candidate = (bundle.label ?? bundle.title ?? "").toLowerCase();
				return hint && candidate.includes(hint.toLowerCase());
			});
			if (fallback) return fallback.id;
		}
		return null;
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

async function saveNotes() {
	if (!id) return;
	try {
		setSavingNotes(true);
		const { updateProjectNotes } = await import("../../src/data/projectDetail.server");
		await updateProjectNotes(id, notes);
		setToast({ message: "Saved notes", type: "success" });
		await reload();
	} catch (e: any) {
		console.error("saveNotes error", e);
		setToast({ message: `Failed to save notes: ${e?.message ?? String(e)}`, type: "error" });
	} finally {
		setSavingNotes(false);
	}
}

	// grouping by member
	const claimedBundleIds = new Set((bundles ?? []).filter((b) => Boolean(b.claimed_by_member_id)).map((b) => b.id));
	const unassignedTasks = (tasks ?? []).filter((t: any) => !t.ownerMemberId);
	const tasksByMember: Record<string, any[]> = {};
	(members ?? []).forEach((m) => {
		tasksByMember[m.id] = (tasks ?? []).filter((t: any) => t.ownerMemberId === m.id);
		tasksByMember[m.id].sort((a: any, b: any) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime());
	});

	const getOwnerLabelForId = (memberId?: string | null) => {
		if (!memberId) return "Unassigned";
		const member = membersById[memberId];
		return member ? getMemberLabel(member) : "Member";
	};

	// Deterministic pastel palette for bundle cards
	const BUNDLE_PALETTE = [
		{ bg: "#EFF6FF", header: "#BFDBFE", accent: "#2563EB" }, // blue
		{ bg: "#F0FDF4", header: "#BBF7D0", accent: "#16A34A" }, // green
		{ bg: "#FFF7ED", header: "#FED7AA", accent: "#EA580C" }, // orange
		{ bg: "#FDF4FF", header: "#E9D5FF", accent: "#9333EA" }, // purple
		{ bg: "#FEF2F2", header: "#FECACA", accent: "#DC2626" }, // red
		{ bg: "#ECFEFF", header: "#A5F3FC", accent: "#0891B2" }, // cyan
		{ bg: "#FEFCE8", header: "#FEF08A", accent: "#CA8A04" }, // yellow
	];
	function getBundleColor(index: number) {
		return BUNDLE_PALETTE[index % BUNDLE_PALETTE.length];
	}

	const [joinCopied, setJoinCopied] = useState(false);
	const joinCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	async function handleCopyJoinCode(code: string) {
		if (!code) {
			setToast({ message: "Join code unavailable", type: "error" });
			return;
		}
		try {
			if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(code);
			} else {
				const clipboard = require("expo-clipboard");
				await clipboard.setStringAsync(code);
			}
			setJoinCopied(true);
			if (joinCopyTimerRef.current) clearTimeout(joinCopyTimerRef.current);
			joinCopyTimerRef.current = setTimeout(() => setJoinCopied(false), 1000);
		} catch (e: any) {
			console.error("copy join code failed", e);
			setToast({ message: "Copy failed", type: "error" });
		}
	}

	return (
		<ScrollView style={themeStyles.screen} contentContainerStyle={{ paddingBottom: 120 }}>
			{project ? (
				<>
					<TouchableOpacity onPress={() => router.push("/projects")} style={{ marginBottom: 8 }}>
						<Text style={{ color: colors.primaryBlue }}>← Back to Projects</Text>
					</TouchableOpacity>

					{/* Project title + meta */}
					<View style={{ marginBottom: 14 }}>
						<Text style={styles.title}>{project.name}</Text>
						<View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
							<View style={styles.pill}>
								<Text style={styles.pillText}>{formatTimeframe(project.timeframe)}</Text>
							</View>
							<View style={{ width: 8 }} />
							<Text style={{ color: "#6B7280" }}>{remainingTasksCount} tasks remaining</Text>
						</View>
					</View>

					{/* Invite / Join (visible below title) */}
					<View style={styles.joinCard}>
						<View style={styles.joinRow}>
							<Text style={{ fontWeight: "600", color: "#374151" }}>Join code:</Text>
							<View style={styles.joinCodePill}>
								<Text style={styles.joinCodeText}>{project.join_code ?? project.joinCode ?? "—"}</Text>
							</View>
							<AppButton
								title={joinCopied ? "Copied!" : "Copy code"}
								variant="secondary"
								onPress={() => handleCopyJoinCode(project.join_code ?? project.joinCode ?? "")}
								style={{ paddingVertical: 6, paddingHorizontal: 12, marginLeft: 8 }}
							/>
							<AppButton
								title="Add task"
								variant="primary"
								onPress={() => router.push(`/project/${id}/add-task`)}
								style={{ marginLeft: 8 }}
							/>
						</View>
					</View>

					<View style={{ marginTop: 12 }}>
						<Text style={{ fontWeight: "600", marginBottom: 6 }}>Members</Text>
						<View style={styles.membersRow}>
									{(members ?? []).map((m) => (
										<View key={m.id} style={styles.memberPill}>
											<Text style={styles.memberPillText}>{getMemberLabel(m)}</Text>
										</View>
									))}
						</View>
						{plannedMembers.length > 0 ? (
							<>
								<Text style={{ fontWeight: "600", marginTop: 8, marginBottom: 6, color: "#6B7280" }}>Planned</Text>
								<View style={styles.membersRow}>
									{plannedMembers.map((m) => (
										<View key={m.id} style={[styles.memberPill, styles.plannedPill]}>
											<Text style={[styles.memberPillText, styles.plannedPillText]}>{getMemberLabel(m)}</Text>
										</View>
									))}
								</View>
							</>
						) : null}
					</View>

					{aiDeliverableItems.length > 0 ? (
						<View style={{ marginTop: 12 }}>
							<Text style={{ fontWeight: "600", marginBottom: 6 }}>Deliverables</Text>
							{aiDeliverableItems.map((d: any) => (
								<View key={d.id ?? d.title} style={styles.deliverableItem}>
									<Text style={styles.deliverableTitle}>{d.title}</Text>
									<Text style={styles.deliverableDescription}>{d.description ?? d.url ?? "Details pending"}</Text>
								</View>
							))}
						</View>
					) : null}

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

					{/* Tasks grouped by member */}
					{/* Member bubbles */}
					{/* Bundles (AI-generated plans) */}
				{(bundles ?? []).length > 0 ? (
					<View style={{ marginTop: 16, marginBottom: 12 }}>
						<Text style={{ fontWeight: "700", fontSize: 18, marginBottom: 10, color: "#0F172A" }}>Bundles</Text>
						<View style={styles.bundleList}>
						{bundles.map((b, idx) => {
							const bTasks = (tasks ?? []).filter((t: any) => t.bundle_id === b.id);
							const claimed = Boolean(b.claimed_by_member_id);
								const palette = getBundleColor(idx);
							const bundleTitle = getBundleDisplayTitle(b);
								return (
									<Pressable key={b.id} style={({ pressed }) => [styles.bundleCard, { backgroundColor: palette.bg, opacity: pressed ? 0.93 : 1 }]}>
										{/* Color accent header strip */}
											<View style={[styles.bundleHeaderStrip, { backgroundColor: palette.header }]}>
												<View style={styles.bundleHeaderLeft}>
													{!claimed ? (
														<Pressable
															onPress={() => handleClaimBundle(b.id)}
															style={({ pressed }) => [
																styles.claimButton,
																{ backgroundColor: palette.accent, opacity: pressed ? 0.8 : 1 },
															]}
														>
															<Text style={styles.claimButtonText}>Claim</Text>
														</Pressable>
													) : null}
													<Text style={[styles.bundleTitle, { color: palette.accent }]} numberOfLines={1}>
														{bundleTitle}
													</Text>
												</View>
												<Text style={{ color: palette.accent, fontWeight: "600", fontSize: 13 }}>{b.total_points ?? 0} pts</Text>
											</View>
										{b.summary ? <Text style={{ color: "#374151", marginHorizontal: 14, marginBottom: 8 }}>{b.summary}</Text> : null}
										<View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
											{bTasks.length === 0 ? (
												<Text style={{ color: "#6B7280" }}>No tasks</Text>
											) : (
												bTasks.map((task: any) => {
													const taskLinksForTask = (taskLinks ?? []).filter((link: any) => link.task_id === task.id);
													return (
														<View key={task.id} style={{ marginBottom: 8 }}>
												<TaskCard
													task={task}
													onDone={() => toggleTaskDone(task)}
													onReassign={() => openReassignPanel(task)}
													onAddLink={() => openLinkModal(task)}
													onDelete={() => deleteTask(task)}
													bundleColor={palette.bg}
													bundleAccent={palette.accent}
													ownerLabel={getOwnerLabelForId(task.ownerMemberId)}
												/>
															{taskLinksForTask.length > 0 ? (
																<View style={styles.linksList}>
																	{taskLinksForTask.map((link: any) => (
																		<TouchableOpacity
																			key={link.id}
																			onPress={async () => {
																				try {
																					await Linking.openURL(link.url);
																				} catch (e) {
																					setToast({ message: "Failed to open link", type: "error" });
																				}
																			}}
																			style={styles.linkRow}
																		>
																			<Text style={styles.linkLabel}>{link.label}</Text>
																			<Text numberOfLines={1} style={styles.linkUrl}>
																				{link.url}
																			</Text>
																		</TouchableOpacity>
																	))}
																</View>
															) : null}
															{reassignTaskId === task.id ? (
																<View style={styles.inlinePanel}>
																	<Text style={styles.inlineLabel}>Reassign task</Text>
																	<View style={{ borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB", overflow: "hidden" }}>
																		<Picker
																			selectedValue={reassignMemberId ?? ""}
																			onValueChange={(value) => setReassignMemberId(value ? value : null)}
																		>
																			<Picker.Item label="Unassigned" value="" />
																			{(members ?? []).map((m) => (
																					<Picker.Item key={m.id} label={getMemberLabel(m)} value={m.id} />
																			))}
																		</Picker>
																	</View>
																	<View style={styles.inlineControls}>
																		<AppButton
																			title="Cancel"
																			variant="secondary"
																			onPress={() => {
																				setReassignTaskId(null);
																				setReassignMemberId(null);
																			}}
																		/>
																		<View style={{ width: 8 }} />
																		<AppButton
																			title={reassigning ? "Saving..." : "Save"}
																			variant="primary"
																			onPress={() => saveReassign(task.id)}
																			disabled={reassigning}
																		/>
																	</View>
																</View>
															) : null}
													{renderLinkPanel(task)}
														</View>
													);
												})
											)}
										</View>
									</Pressable>
								);
							})}
						</View>
					</View>
				) : null}
					<View style={{ gap: 12 }}>
						{(members ?? []).map((m) => {
							const label = getMemberLabel(m);
							return (
								<View key={m.id} style={styles.bubble}>
								<View style={styles.bubbleHeader}>
									<View style={styles.avatar}>
										<Text style={{ color: "#fff", fontWeight: "700" }}>{label.slice(0, 1).toUpperCase()}</Text>
									</View>
									<Text style={styles.memberName}>{label}</Text>
									<Text style={styles.memberCount}>{(tasksByMember[m.id] ?? []).length}</Text>
								</View>
								<View style={styles.bubbleBody}>
								{(tasksByMember[m.id] ?? []).length === 0 ? (
										<Text style={{ color: "#6B7280" }}>No tasks</Text>
									) : (
										(tasksByMember[m.id] ?? []).map((task: any) => (
											<View key={task.id} style={{ marginBottom: 8 }}>
												<TaskCard
													task={task}
													onDone={() => toggleTaskDone(task)}
													onReassign={() => {}}
													onAddLink={() => openLinkModal(task)}
													onDelete={() => deleteTask(task)}
													ownerLabel={getOwnerLabelForId(task.ownerMemberId)}
												/>
												{renderLinkPanel(task)}
											</View>
										))
									)}
								</View>
							</View>
						)})}
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
										<View key={task.id} style={{ marginBottom: 8 }}>
											<TaskCard
												task={task}
												onDone={() => toggleTaskDone(task)}
												onReassign={() => {}}
												onAddLink={() => openLinkModal(task)}
												onDelete={() => deleteTask(task)}
												ownerLabel={getOwnerLabelForId(task.ownerMemberId)}
											/>
											{renderLinkPanel(task)}
										</View>
									))
								)}
							</View>
						</View>
					</View>

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

					{/* Notes */}
					<View style={{ marginTop: 12 }}>
						<Text style={{ fontWeight: "600", marginBottom: 8 }}>Notes</Text>
						<TextInput
							placeholder="Notes about this project..."
							multiline
							value={notes}
							onChangeText={setNotes}
							style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, minHeight: 120, backgroundColor: "#fff", borderRadius: 8 }}
						/>
						<View style={{ flexDirection: "row", marginTop: 8 }}>
							<AppButton title={savingNotes ? "Saving..." : "Save notes"} onPress={saveNotes} disabled={savingNotes} variant="primary" loading={savingNotes} />
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
					{/* Invite modal removed */}

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

				</>
			) : (
				<Text>Loading...</Text>
			)}
		</ScrollView>
	);
}

function getMemberLabel(member: any) {
	const name = (member.displayName ?? member.display_name ?? "").trim();
	if (name) return name;
	const profile = member.profile ?? {};
	const fullName = (profile.full_name ?? "").trim();
	if (fullName) return fullName;
	const username = (profile.username ?? "").trim();
	if (username) return username;
	const email = profile.email ?? "";
	if (email) return email.split("@")[0];
	if (member.user_id) return `Member ${member.user_id.slice(0, 6)}`;
	return "Member";
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
	bundleCard: {
		borderRadius: 16,
		overflow: "hidden",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 10,
		elevation: 3,
	},
	bundleHeaderStrip: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 10,
		paddingHorizontal: 14,
		marginBottom: 6,
	},
	bundleTitle: {
		fontWeight: "700",
		fontSize: 15,
		flex: 1,
	},
	claimButton: {
		paddingVertical: 4,
		paddingHorizontal: 12,
		borderRadius: 999,
		minHeight: 28,
		alignSelf: "flex-start",
		justifyContent: "center",
		alignItems: "center",
	},
	claimButtonText: {
		color: "#fff",
		fontWeight: "700",
		fontSize: 12,
	},
	claimedByPill: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
		borderWidth: 1,
	},
	claimedByText: {
		fontSize: 12,
		fontWeight: "600",
	},
	membersRow: {
		flexDirection: "row",
		flexWrap: "wrap",
	},
	memberPill: {
		backgroundColor: "#F3F4F6",
		paddingVertical: 4,
		paddingHorizontal: 10,
		borderRadius: 999,
		marginRight: 6,
		marginBottom: 6,
	},
	memberPillText: {
		fontWeight: "600",
		color: "#0F172A",
	},
	plannedPill: {
		backgroundColor: "#EEF2FF",
	},
	plannedPillText: {
		color: "#4338CA",
	},
	joinRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
	},
	bundleList: {
		gap: 12,
	},
	bundleHeaderLeft: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	deliverableItem: {
		backgroundColor: "#fff",
		padding: 10,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#E5E7EB",
		marginBottom: 8,
	},
	deliverableTitle: {
		fontWeight: "700",
	},
	deliverableDescription: {
		color: "#4B5563",
		marginTop: 4,
	},
	inlinePanel: {
		marginTop: 8,
		padding: 10,
		borderRadius: 10,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#E5E7EB",
	},
	inlineLabel: {
		fontWeight: "600",
		marginBottom: 6,
	},
	inlineControls: {
		flexDirection: "row",
		justifyContent: "flex-end",
		marginTop: 8,
	},
	linkInput: {
		borderWidth: 1,
		borderColor: "#E5E7EB",
		borderRadius: 8,
		padding: 8,
		backgroundColor: "#fff",
	},
	linksList: {
		marginTop: 6,
	},
	linkRow: {
		borderWidth: 1,
		borderColor: "#E5E7EB",
		borderRadius: 10,
		padding: 8,
		marginTop: 4,
	},
	linkLabel: {
		fontWeight: "600",
	},
	linkUrl: {
		color: colors.primaryBlue,
	},
	joinCodePill: {
		backgroundColor: "#F3F4F6",
		paddingVertical: 4,
		paddingHorizontal: 12,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#E5E7EB",
	},
	joinCodeText: {
		fontFamily: "monospace",
		fontWeight: "700",
		fontSize: 16,
		letterSpacing: 2,
		color: "#0F172A",
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

