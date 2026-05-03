import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Linking, ScrollView, Pressable, useWindowDimensions } from "react-native";
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
import { reassignTaskRpc } from "../../src/lib/supabase/rpcs/reassignTask";
import { formatTimeframe } from "../../src/utils/formatTimeframe";
import { normalizePickedFiles } from "../../src/lib/files/normalizePickedFiles";
import { useTheme } from "../../src/state/themeStore";
import { updateDeliverableServer } from "../../src/data/tasks.server";

export default function ProjectDetailRoute() {
	const { id } = useLocalSearchParams() as { id: string };
	const router = useRouter();
	const { width } = useWindowDimensions();
	const isWide = width >= 640;
	const { darkMode } = useTheme();
	const bg = darkMode ? "#0F172A" : colors.lightBackground;
	const cardBg = darkMode ? "#1E293B" : "#fff";
	const textColor = darkMode ? "#F1F5F9" : colors.textPrimary;
	const mutedColor = darkMode ? "#94A3B8" : colors.textMuted;
	const borderColor = darkMode ? "#334155" : "#E5E7EB";
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
	const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
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
	const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string; mime?: string; size?: number } | null>(null);
	const [notes, setNotes] = useState<string>("");
	const [savingNotes, setSavingNotes] = useState(false);
	const [notesChanged, setNotesChanged] = useState(false);
	const [notesSaveStatus, setNotesSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
	const [addDeliverableOpen, setAddDeliverableOpen] = useState(false);
	const [newDeliverableTitle, setNewDeliverableTitle] = useState("");
	const [newDeliverableUrl, setNewDeliverableUrl] = useState("");
	const [addingDeliverable, setAddingDeliverable] = useState(false);
	const [normalizationAlert, setNormalizationAlert] = useState(false);
	const [retryingNormalization, setRetryingNormalization] = useState(false);
	const [deliverableLinkId, setDeliverableLinkId] = useState<string | null>(null);
	const [deliverableLinkValue, setDeliverableLinkValue] = useState("");
	const [deliverableLinkSaving, setDeliverableLinkSaving] = useState(false);
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
	const remainingTasksCount = (tasks ?? []).filter((t: any) => t.status !== "done").length;
	const fileResources = useMemo(() => (resources ?? []).filter((r: any) => r.type === "file"), [resources]);

	useEffect(() => {
		if (!project) return;
		setNotes(project.project_notes ?? "");
		setNotesChanged(false);
		setNotesSaveStatus("idle");
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
				const bundleCount = (detail.taskBundles ?? []).length;
				const taskCount = (detail.tasks ?? []).length;
				const planPayloadExists = Boolean(detail.project?.plan_payload);
				console.info("project detail counts", { project_id: id, planPayloadExists, bundleCount, taskCount });
				setNormalizationAlert(planPayloadExists && bundleCount === 0 && taskCount === 0);
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
			setNormalizationAlert(false);
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

	async function handleRetryNormalization() {
		if (!id || retryingNormalization) return;
		setRetryingNormalization(true);
		setToast({ message: "Retrying normalization...", type: "info" });
		try {
			await retryPlan(id, true);
			setToast({ message: "Normalization retried; refreshing...", type: "success" });
			await reload();
		} catch (e: any) {
			console.error("retryNormalization failed", e);
			setToast({ message: `Retry failed: ${e?.message ?? String(e)}`, type: "error" });
		} finally {
			setRetryingNormalization(false);
		}
	}

	async function handleClaimBundle(bundleId: string) {
		if (!id) return;
		try {
			setToast({ message: "Claiming bundle...", type: "info" });
			try {
				const { claimBundleRpc } = await import("../../src/lib/supabase/rpcs/claimBundle");
				const res = await claimBundleRpc(bundleId);
				if (res?.bundle_id === bundleId) {
					setBundles((bs) => bs.map((b) => (b.id === bundleId ? { ...b, claimed_by_member_id: res.claimed_by_member_id ?? resolvedMemberId } : b)));
					setTasks((ts) => ts.map((t) => (t.bundle_id === bundleId && (!t.ownerMemberId || t.ownerMemberId === null) ? { ...t, ownerMemberId: res.claimed_by_member_id ?? resolvedMemberId } : t)));
				}
			} catch (e) {
				throw e;
			}
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
		const prevTasks = tasks;
		setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t)));
		try {
			await updateTaskServer(task.id, { status: newStatus });
			setToast({ message: "Saved", type: "success" });
		} catch (e: any) {
			console.error("toggleTaskDone failed", e);
			setTasks(prevTasks);
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
			if (!targetId) {
				await updateTaskServer(taskId, { owner_member_id: null, bundle_id: null });
				setTasks((ts) =>
					ts.map((t) =>
						t.id === taskId
							? { ...t, ownerMemberId: null, bundle_id: null, bundleId: null }
							: t
					)
				);
			} else {
				const res = await reassignTaskRpc(taskId, targetId);
				setTasks((ts) =>
					ts.map((t) =>
						t.id === taskId
							? {
									...t,
									ownerMemberId: res?.owner_member_id ?? targetId,
									bundle_id: res?.bundle_id ?? t.bundle_id,
									bundleId: res?.bundle_id ?? t.bundleId,
							  }
							: t
					)
				);
			}
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
							setLinkingTaskId(null);
							setLinkingTaskTitle("");
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
				const source = (selectedFile as any).file instanceof File ? (selectedFile as any).file : selectedFile.uri;
				const uploadRes = await uploadProjectFile(id, source, selectedFile.name);
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
		setNotesSaveStatus("saving");
		setSavingNotes(true);
		try {
			const { updateProjectNotes } = await import("../../src/data/projectDetail.server");
			await updateProjectNotes(id, notes);
			setNotesSaveStatus("saved");
			setNotesChanged(false);
			setToast({ message: "Notes saved", type: "success" });
			await reload();
		} catch (e: any) {
			console.error("saveNotes error", JSON.stringify(e));
			setNotesSaveStatus("error");
			setToast({ message: `Failed to save notes: ${e?.message ?? String(e)}`, type: "error" });
		} finally {
			setSavingNotes(false);
		}
	}

	async function handleAddDeliverable() {
		if (!id) return;
		if (!newDeliverableTitle) {
			setToast({ message: "Provide a title", type: "error" });
			return;
		}
		setAddingDeliverable(true);
		try {
			const { addDeliverable } = await import("../../src/data/projectDetail.server");
			await addDeliverable(id, newDeliverableTitle, newDeliverableUrl ?? null);
			setToast({ message: "Deliverable added", type: "success" });
			setNewDeliverableTitle("");
			setNewDeliverableUrl("");
			setAddDeliverableOpen(false);
			await reload();
		} catch (e: any) {
			console.error("addDeliverable failed", e);
			setToast({ message: `Add failed: ${e?.message ?? String(e)}`, type: "error" });
		} finally {
			setAddingDeliverable(false);
		}
	}

	async function saveDeliverableLink() {
		if (!deliverableLinkId) return;
		if (!deliverableLinkValue.trim()) {
			setToast({ message: "Provide a URL", type: "error" });
			return;
		}
		setDeliverableLinkSaving(true);
		try {
			await updateDeliverableServer(deliverableLinkId, { url: deliverableLinkValue.trim() });
			setToast({ message: "Link saved", type: "success" });
			setDeliverableLinkId(null);
			setDeliverableLinkValue("");
			await reload();
		} catch (e: any) {
			setToast({ message: `Failed: ${e?.message ?? String(e)}`, type: "error" });
		} finally {
			setDeliverableLinkSaving(false);
		}
	}

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

	const BUNDLE_PALETTE = [
		{ bg: "#EFF6FF", header: "#BFDBFE", accent: "#2563EB" },
		{ bg: "#F0FDF4", header: "#BBF7D0", accent: "#16A34A" },
		{ bg: "#FFF7ED", header: "#FED7AA", accent: "#EA580C" },
		{ bg: "#FDF4FF", header: "#E9D5FF", accent: "#9333EA" },
		{ bg: "#FEF2F2", header: "#FECACA", accent: "#DC2626" },
		{ bg: "#ECFEFF", header: "#A5F3FC", accent: "#0891B2" },
		{ bg: "#FEFCE8", header: "#FEF08A", accent: "#CA8A04" },
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
		<ScrollView style={[themeStyles.screen, { backgroundColor: bg }]} contentContainerStyle={{ paddingBottom: 120 }}>
			{project ? (
				<>
					{/* Back row */}
					<View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
						<TouchableOpacity onPress={() => router.push("/projects")}>
							<Text style={{ color: colors.pennBlue, fontWeight: "600" }}>← Back to Projects</Text>
						</TouchableOpacity>
					</View>

					{/* Project title + meta — two-column on wide */}
					<View style={[{ marginBottom: 14 }, isWide && { flexDirection: "row", gap: 20, alignItems: "flex-start" }]}>
						<View style={isWide ? { flex: 1 } : {}}>
							<Text style={[styles.title, { color: textColor }]}>{project.name}</Text>
							<View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, flexWrap: "wrap", gap: 8 }}>
								<View style={styles.pill}>
									<Text style={styles.pillText}>{formatTimeframe(project.timeframe)}</Text>
								</View>
								<Text style={{ color: mutedColor }}>{remainingTasksCount} tasks remaining</Text>
								{project?.plan_status && project.plan_status !== "ready" ? (
									<View style={{
										backgroundColor: project.plan_status === "failed" ? "#FEE2E2" : "#FEF9C3",
										paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
									}}>
										<Text style={{ color: project.plan_status === "failed" ? "#991B1B" : "#854D0E", fontSize: 12, fontWeight: "700" }}>
											{project.plan_status === "pending" ? "Generating plan…" : "Plan failed"}
										</Text>
									</View>
								) : null}
							</View>
						</View>
						{isWide && (project.description || project.assignment_details) ? (
							<View style={{ flex: 1, backgroundColor: cardBg, borderRadius: 12, padding: 14 }}>
								<Text style={{ fontWeight: "700", color: colors.pennRed, marginBottom: 6, fontSize: 13 }}>Description</Text>
								<Text style={{ color: mutedColor, lineHeight: 20, fontSize: 13 }} numberOfLines={4}>
									{project.description ?? (project.assignment_details ?? "").slice(0, 300)}
								</Text>
							</View>
						) : null}
					</View>

					{/* Progress bar */}
					{(() => {
						const total = (tasks ?? []).length;
						const done = (tasks ?? []).filter((t: any) => t.status === "done" || t.status === "completed").length;
						const pct = total > 0 ? Math.round((done / total) * 100) : 0;
						return (
							<View style={{ marginBottom: 12 }}>
								{total === 0 ? (
									<Text style={{ color: mutedColor, fontSize: 13 }}>No tasks yet</Text>
								) : (
									<>
										<View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
											<Text style={{ fontSize: 13, color: mutedColor }}>{done} of {total} tasks complete</Text>
											<Text style={{ fontSize: 13, fontWeight: "700", color: pct === 100 ? "#16A34A" : colors.pennBlue }}>{pct}%</Text>
										</View>
										<View style={{ height: 8, backgroundColor: darkMode ? "#334155" : "#E5E7EB", borderRadius: 999, overflow: "hidden" }}>
											<View style={{ height: "100%", width: `${pct}%` as any, backgroundColor: pct === 100 ? "#16A34A" : colors.pennBlue, borderRadius: 999 }} />
										</View>
									</>
								)}
							</View>
						);
					})()}

					{/* Join code / share card */}
					<View style={[styles.joinCard, { backgroundColor: cardBg }]}>
						<View style={styles.joinRow}>
							<View style={styles.joinCodePill}>
								<Text style={styles.joinCodeText}>{project.join_code ?? project.joinCode ?? "—"}</Text>
							</View>
							<AppButton
								title={joinCopied ? "✓ Copied!" : "Share Project"}
								variant="primary"
								onPress={async () => {
									const code = project.join_code ?? project.joinCode ?? "";
									const msg = `Join my Grouper project with code: ${code}`;
									try {
										if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
											await navigator.clipboard.writeText(msg);
										} else {
											const clipboard = require("expo-clipboard");
											await clipboard.setStringAsync(msg);
										}
										setJoinCopied(true);
										if (joinCopyTimerRef.current) clearTimeout(joinCopyTimerRef.current);
										joinCopyTimerRef.current = setTimeout(() => setJoinCopied(false), 2000);
										setToast({ message: "Copied share message!", type: "success" });
									} catch {
										setToast({ message: "Copy failed", type: "error" });
									}
								}}
								style={{ marginLeft: 8 }}
							/>
							<AppButton
								title="Add task"
								variant="secondary"
								onPress={() => router.push(`/project/${id}/add-task`)}
								style={{ marginLeft: 8 }}
							/>
						</View>
					</View>

					{/* Assignment + Files — two-column on wide */}
					<View style={isWide ? { flexDirection: "row", gap: 12, alignItems: "flex-start", marginTop: 12 } : {}}>
					{/* Assignment (collapsible) */}
					{(project.assignmentTitle || project.assignment_title || project.assignmentDetails || project.assignment_details || fileResources.length > 0) ? (() => {
						const assignText = (project.assignmentDetails ?? project.assignment_details ?? "").trim();
						const assignTitle = (project.assignmentTitle ?? project.assignment_title ?? "").trim();
						const isExpanded = collapsed.assignment === true;
						return (
							<View style={[{ marginTop: isWide ? 0 : 12 }, isWide && { flex: 1 }]}>
								<TouchableOpacity
									onPress={() => setCollapsed((c) => ({ ...c, assignment: !c.assignment }))}
									style={{ backgroundColor: cardBg, padding: 12, borderRadius: 12 }}
									activeOpacity={0.7}
								>
									<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
										<Text style={{ fontWeight: "700", color: colors.pennRed, fontSize: 15 }}>Assignment</Text>
										<Text style={{ color: mutedColor, fontSize: 16 }}>{isExpanded ? "▾" : "▸"}</Text>
									</View>

									{!isExpanded ? (
										<View style={{ marginTop: 6 }}>
											{assignTitle ? <Text style={{ fontWeight: "600", color: textColor, marginBottom: 2 }} numberOfLines={1}>{assignTitle}</Text> : null}
											{assignText ? (
												<Text style={{ color: mutedColor, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>{assignText}</Text>
											) : fileResources.length > 0 ? (
												<Text style={{ color: mutedColor, fontSize: 13, fontStyle: "italic" }}>Provided via attached files</Text>
											) : null}
											{fileResources.length > 0 ? (
												<Text style={{ color: mutedColor, fontSize: 12, marginTop: 4 }}>{fileResources.length} file(s) attached</Text>
											) : null}
										</View>
									) : null}

									{isExpanded ? (
										<View style={{ marginTop: 8 }}>
											{assignTitle ? <Text style={{ fontWeight: "700", marginBottom: 6, color: textColor }}>{assignTitle}</Text> : null}
											{assignText ? (
												<Text style={{ color: textColor, lineHeight: 20 }}>{assignText}</Text>
											) : fileResources.length > 0 ? (
												<Text style={{ color: mutedColor, fontStyle: "italic" }}>Assignment provided via {fileResources.length} attached file(s)</Text>
											) : (
												<Text style={{ color: mutedColor }}>No assignment details</Text>
											)}
											{fileResources.length > 0 ? (
												<Text style={{ color: mutedColor, marginTop: 8, fontSize: 12 }}>{fileResources.length} file(s) attached</Text>
											) : null}
										</View>
									) : null}
								</TouchableOpacity>
							</View>
						);
					})() : null}

					{/* People */}
					<View style={{ marginTop: 16 }}>
						<Text style={{ fontWeight: "700", fontSize: 15, marginBottom: 8, color: textColor }}>People</Text>
						<View style={styles.membersRow}>
							{(members ?? []).map((m) => {
								const isMe = m.id === resolvedMemberId;
								return (
									<View
										key={m.id}
										style={[
											styles.memberPill,
											isMe ? { borderWidth: 1.5, borderColor: colors.primaryBlue, backgroundColor: "#EFF6FF" } : null,
										]}
									>
										<Text style={[styles.memberPillText, isMe ? { color: colors.primaryBlue } : null]}>
											{getMemberLabel(m)}{isMe ? " (You)" : ""}
										</Text>
									</View>
								);
							})}
						</View>
						{plannedMembers.length > 0 ? (
							<>
								<Text style={{ fontWeight: "600", marginTop: 8, marginBottom: 6, color: "#6B7280", fontSize: 13 }}>Invited / Planned</Text>
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

					{/* Deliverables */}
					<View style={{ marginTop: 16 }}>
						<TouchableOpacity
							onPress={() => setCollapsed((c) => ({ ...c, deliverables: !c.deliverables }))}
							style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
						>
							<Text style={{ fontWeight: "700", fontSize: 15, color: textColor }}>
								Deliverables{(deliverables ?? []).length > 0 ? ` (${deliverables.length})` : ""}
							</Text>
							<Text style={{ color: mutedColor }}>{collapsed.deliverables ? "▸" : "▾"}</Text>
						</TouchableOpacity>
						{!collapsed.deliverables ? (
							<View style={{ backgroundColor: cardBg, padding: 12, borderRadius: 12 }}>
								{(deliverables ?? []).length === 0 ? (
									<Text style={{ color: mutedColor }}>No deliverables yet</Text>
								) : (
									deliverables.map((d: any) => (
										<View key={d.id} style={[styles.deliverableItem, { backgroundColor: darkMode ? "#0F172A" : "#F9FAFB", borderColor }]}>
											<Text style={[styles.deliverableTitle, { color: textColor }]}>{d.title ?? d.label}</Text>
											{d.description ? <Text style={[styles.deliverableDescription, { color: mutedColor }]}>{d.description}</Text> : null}

											{/* Link row */}
											<View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
												{d.url ? (
													<AppButton
														title="Open Link"
														variant="primary"
														onPress={async () => { try { await Linking.openURL(d.url); } catch {} }}
														style={{ paddingVertical: 5, paddingHorizontal: 12 }}
													/>
												) : null}
												{d.isDeliverable !== false ? (
													<AppButton
														title={d.url ? "Edit Link" : "Add Link"}
														variant="secondary"
														onPress={() => {
															setDeliverableLinkId(d.id);
															setDeliverableLinkValue(d.url ?? "");
														}}
														style={{ paddingVertical: 5, paddingHorizontal: 12 }}
													/>
												) : null}
											</View>

											{/* Inline link input */}
											{deliverableLinkId === d.id ? (
												<View style={{ marginTop: 8 }}>
													<TextInput
														value={deliverableLinkValue}
														onChangeText={setDeliverableLinkValue}
														placeholder="https://..."
														placeholderTextColor={mutedColor}
														autoCapitalize="none"
														autoCorrect={false}
														style={{ borderWidth: 1, borderColor, borderRadius: 8, padding: 8, color: textColor, backgroundColor: cardBg, marginBottom: 8 }}
													/>
													<View style={{ flexDirection: "row", gap: 8 }}>
														<AppButton
															title="Cancel"
															variant="secondary"
															onPress={() => { setDeliverableLinkId(null); setDeliverableLinkValue(""); }}
														/>
														<AppButton
															title={deliverableLinkSaving ? "Saving…" : "Save"}
															variant="primary"
															onPress={saveDeliverableLink}
															disabled={deliverableLinkSaving}
														/>
													</View>
												</View>
											) : null}
										</View>
									))
								)}
								<View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8 }}>
									<AppButton title="Add deliverable" variant="primary" onPress={() => setAddDeliverableOpen(true)} />
								</View>
							</View>
						) : null}
					</View>

					{/* Files */}
					<View style={[{ marginTop: isWide ? 0 : 16 }, isWide && { flex: 1 }]}>
						<TouchableOpacity
							onPress={() => setCollapsed((c) => ({ ...c, files: !c.files }))}
							style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
						>
							<Text style={{ fontWeight: "700", fontSize: 15, color: textColor }}>
								Files{fileResources.length > 0 ? ` (${fileResources.length})` : ""}
							</Text>
							<Text style={{ color: mutedColor }}>{collapsed.files ? "▸" : "▾"}</Text>
						</TouchableOpacity>
						{!collapsed.files ? (
							<View style={{ backgroundColor: cardBg, padding: 12, borderRadius: 12 }}>
								{fileResources.length === 0 ? (
									<Text style={{ color: mutedColor }}>No files uploaded</Text>
								) : (
									fileResources.map((r: any) => {
										const isExpanded = expandedFiles[r.id] === true;
										return (
											<View key={r.id} style={{ marginBottom: 10, borderBottomWidth: 1, borderBottomColor: borderColor, paddingBottom: 10 }}>
												<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
													<TouchableOpacity
														style={{ flex: 1, marginRight: 8 }}
														onPress={() => setExpandedFiles((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
													>
														<Text style={{ fontWeight: "600", color: textColor }}>{r.label}</Text>
														<View style={{ flexDirection: "row", alignItems: "center", marginTop: 3, gap: 8, flexWrap: "wrap" }}>
															{r.mimeType ? (
																<View style={{ backgroundColor: colors.blueLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
																	<Text style={{ fontSize: 10, color: colors.pennBlue, fontWeight: "600" }}>
																		{r.mimeType.split("/").pop()?.toUpperCase()}
																	</Text>
																</View>
															) : null}
															{r.sizeBytes ? (
																<Text style={{ fontSize: 11, color: mutedColor }}>{formatFileSize(r.sizeBytes)}</Text>
															) : null}
															{r.createdAt ? (
																<Text style={{ fontSize: 11, color: mutedColor }}>
																	{new Date(r.createdAt).toLocaleDateString()}
																</Text>
															) : null}
															<Text style={{ fontSize: 11, color: mutedColor }}>{isExpanded ? "▾" : "▸"}</Text>
														</View>
													</TouchableOpacity>
													<View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
														<AppButton
															title="Open"
															variant="secondary"
															onPress={async () => {
																try {
																	const url = await getSignedFileUrl(r.filePath);
																	Linking.openURL(url);
																} catch {
																	setToast({ message: "Failed to open file", type: "error" });
																}
															}}
															style={{ paddingVertical: 4, paddingHorizontal: 10 }}
														/>
														<TouchableOpacity onPress={() => handleDeleteResource(r.id)} style={{ padding: 6 }}>
															<Text style={{ color: colors.pennRed, fontSize: 12 }}>Delete</Text>
														</TouchableOpacity>
													</View>
												</View>
												{isExpanded ? (
													<View style={{ marginTop: 8, backgroundColor: darkMode ? "#0F172A" : "#F8FAFC", padding: 10, borderRadius: 8 }}>
														{r.textContent ? (
															<>
																<Text style={{ fontWeight: "600", marginBottom: 4, color: textColor, fontSize: 12 }}>Extracted text preview</Text>
																<Text style={{ color: mutedColor, fontSize: 12, lineHeight: 18 }} numberOfLines={10}>{r.textContent}</Text>
															</>
														) : (
															<Text style={{ color: mutedColor, fontStyle: "italic", fontSize: 12 }}>No extracted text available</Text>
														)}
													</View>
												) : null}
											</View>
										);
									})
								)}
							</View>
						) : null}
					</View>
					</View>{/* end two-column wrapper */}

					{/* Plan status alerts */}
					{project?.plan_status === "failed" ? (
						<View style={{ marginTop: 14 }}>
							<Text style={{ color: colors.pennRed, fontWeight: "600", marginBottom: 8 }}>Plan generation failed.</Text>
							{project.plan_error ? <Text style={{ color: "#6B7280", marginBottom: 8 }}>{project.plan_error}</Text> : null}
							<AppButton
								title={planRetrying ? "Retrying..." : "Retry plan generation"}
								variant="primary"
								onPress={async () => {
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
								}}
								disabled={planRetrying}
							/>
						</View>
					) : project?.plan_status === "pending" ? (
						<View style={{ marginTop: 14 }}>
							<Text style={{ color: "#6B7280", fontWeight: "600" }}>Generating plan…</Text>
						</View>
					) : null}

					{normalizationAlert ? (
						<View style={{ marginTop: 12, backgroundColor: "#fef3c7", padding: 12, borderRadius: 10 }}>
							<Text style={{ fontWeight: "600", color: "#92400e" }}>Plan exists but tasks not normalized.</Text>
							<Text style={{ color: "#92400e", marginBottom: 8 }}>Tap to retry normalization.</Text>
							<View style={{ flexDirection: "row" }}>
								<AppButton
									title={retryingNormalization ? "Retrying..." : "Retry normalization"}
									variant="secondary"
									onPress={handleRetryNormalization}
									disabled={retryingNormalization}
									loading={retryingNormalization}
								/>
							</View>
						</View>
					) : null}

					{/* Bundles */}
					{(bundles ?? []).length > 0 ? (
						<View style={{ marginTop: 20, marginBottom: 12 }}>
							<Text style={{ fontWeight: "700", fontSize: 18, marginBottom: 10, color: textColor }}>Bundles</Text>
							<View style={styles.bundleList}>
								{bundles.map((b, idx) => {
									const bTasks = (tasks ?? []).filter((t: any) => t.bundle_id === b.id);
									const claimed = Boolean(b.claimed_by_member_id);
									const palette = getBundleColor(idx);
									const bundleTitle = getBundleDisplayTitle(b);
									return (
										<Pressable key={b.id} style={({ pressed }) => [styles.bundleCard, { backgroundColor: palette.bg, opacity: pressed ? 0.93 : 1 }]}>
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
																					} catch {
																						setToast({ message: "Failed to open link", type: "error" });
																					}
																				}}
																				style={styles.linkRow}
																			>
																				<Text style={styles.linkLabel}>{link.label}</Text>
																				<Text numberOfLines={1} style={styles.linkUrl}>{link.url}</Text>
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
																				onPress={() => { setReassignTaskId(null); setReassignMemberId(null); }}
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

					{/* Member task views */}
					<View style={{ gap: 12 }}>
						{(members ?? []).map((m) => {
							const label = getMemberLabel(m);
							return (
								<View key={m.id} style={[styles.bubble, { backgroundColor: cardBg }]}>
									<View style={styles.bubbleHeader}>
										<View style={styles.avatar}>
											<Text style={{ color: "#fff", fontWeight: "700" }}>{label.slice(0, 1).toUpperCase()}</Text>
										</View>
										<Text style={[styles.memberName, { color: textColor }]}>{label}</Text>
										<Text style={[styles.memberCount, { color: mutedColor }]}>{(tasksByMember[m.id] ?? []).length}</Text>
									</View>
									<View style={styles.bubbleBody}>
										{(tasksByMember[m.id] ?? []).length === 0 ? (
											<Text style={{ color: mutedColor }}>No tasks</Text>
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
							);
						})}
					</View>

					{/* Resources (non-file) */}
					<View style={{ marginTop: 16 }}>
						<Text style={{ fontWeight: "700", fontSize: 15, color: textColor, marginBottom: 8 }}>Resources</Text>
						{(resources ?? []).filter((r: any) => r.type !== "file").length === 0 ? (
							<Text style={{ color: mutedColor, marginBottom: 8 }}>No resources yet</Text>
						) : (
							(resources ?? []).filter((r: any) => r.type !== "file").map((r: any) => (
								<View key={r.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
									{r.type === "link" ? (
										<TouchableOpacity onPress={() => { try { Linking.openURL(r.url); } catch {} }} style={{ flex: 1 }}>
											<Text style={{ color: colors.pennBlue }}>{r.label}</Text>
											<Text numberOfLines={1} style={{ color: mutedColor, fontSize: 11 }}>{r.url}</Text>
										</TouchableOpacity>
									) : (
										<View style={{ flex: 1 }}>
											<Text style={{ fontWeight: "700", color: textColor }}>{r.label}</Text>
											<Text numberOfLines={2} style={{ color: mutedColor }}>{r.textContent}</Text>
										</View>
									)}
									<TouchableOpacity onPress={() => handleDeleteResource(r.id)} style={{ padding: 6 }}>
										<Text style={{ color: colors.pennRed, fontSize: 12 }}>Delete</Text>
									</TouchableOpacity>
								</View>
							))
						)}
						{/* Add link inline */}
						<View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 }}>
							<TextInput
								placeholder="Title"
								placeholderTextColor={mutedColor}
								value={newLinkLabel}
								onChangeText={setNewLinkLabel}
								style={{ flex: 1, borderWidth: 1, borderColor, borderRadius: 8, padding: 8, color: textColor, backgroundColor: cardBg }}
							/>
							<TextInput
								placeholder="https://..."
								placeholderTextColor={mutedColor}
								value={newLinkUrl}
								onChangeText={setNewLinkUrl}
								style={{ flex: 2, borderWidth: 1, borderColor, borderRadius: 8, padding: 8, color: textColor, backgroundColor: cardBg }}
							/>
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
										setToast({ message: `Add failed: ${e?.message ?? String(e)}`, type: "error" });
									} finally {
										setAddingLink(false);
									}
								}}
							/>
						</View>
					</View>

					{/* Notes */}
					<View style={{ marginTop: 16 }}>
						<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
							<Text style={{ fontWeight: "700", fontSize: 15, color: textColor }}>Notes</Text>
							{notesSaveStatus === "saving" ? (
								<Text style={{ color: mutedColor, fontSize: 12 }}>Saving…</Text>
							) : notesChanged ? (
								<Text style={{ color: "#CA8A04", fontSize: 12 }}>Unsaved changes</Text>
							) : notesSaveStatus === "saved" ? (
								<Text style={{ color: "#16A34A", fontSize: 12 }}>Saved</Text>
							) : notesSaveStatus === "error" ? (
								<Text style={{ color: colors.pennRed, fontSize: 12 }}>Save failed</Text>
							) : null}
						</View>
						<TextInput
							placeholder="Notes about this project..."
							placeholderTextColor={mutedColor}
							multiline
							value={notes}
							onChangeText={(v) => { setNotes(v); setNotesChanged(true); setNotesSaveStatus("idle"); }}
							style={{
								borderWidth: 1,
								borderColor: notesChanged ? "#CA8A04" : notesSaveStatus === "error" ? colors.pennRed : borderColor,
								padding: 10,
								minHeight: 120,
								backgroundColor: cardBg,
								borderRadius: 10,
								lineHeight: 20,
								color: textColor,
							}}
						/>
						<View style={{ flexDirection: "row", marginTop: 8 }}>
							<AppButton
								title={savingNotes ? "Saving…" : "Save notes"}
								onPress={saveNotes}
								disabled={savingNotes || !notesChanged}
								variant="primary"
								loading={savingNotes}
							/>
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
								<TouchableOpacity
									onPress={async () => {
										try {
											const docPicker = await import("expo-document-picker");
											const res = await docPicker.getDocumentAsync({ type: "*/*" });
											const picked = normalizePickedFiles(res);
											if (picked.length > 0) {
												const p = picked[0];
												setSelectedFile({ uri: p.uri ?? "", name: p.name, mime: p.mimeType, size: p.size, file: p.file as any });
											}
										} catch {
											setToast({ message: "File picker unavailable", type: "error" });
										}
									}}
									style={{ padding: 12, backgroundColor: "#f3f4f6", borderRadius: 8, marginBottom: 8 }}
								>
									<Text>{selectedFile ? `Selected: ${selectedFile.name}` : "Pick file"}</Text>
								</TouchableOpacity>
							)}
							<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
								<AppButton title="Cancel" variant="secondary" onPress={() => setResourceModalOpen(false)} />
								<AppButton title="Save" variant="primary" onPress={handleAddResource} />
							</View>
						</View>
					) : null}

					{/* Add deliverable modal */}
					{addDeliverableOpen ? (
						<View style={{ position: "absolute", left: 16, right: 16, bottom: 80, backgroundColor: "#fff", padding: 12, borderRadius: 12 }}>
							<Text style={{ fontWeight: "700", marginBottom: 8 }}>Add deliverable</Text>
							<TextInput
								placeholder="Title"
								value={newDeliverableTitle}
								onChangeText={setNewDeliverableTitle}
								style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 8 }}
							/>
							<TextInput
								placeholder="https://..."
								value={newDeliverableUrl}
								onChangeText={setNewDeliverableUrl}
								style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 8 }}
							/>
							<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
								<AppButton title="Cancel" variant="secondary" onPress={() => setAddDeliverableOpen(false)} />
								<AppButton
									title={addingDeliverable ? "Adding..." : "Save"}
									variant="primary"
									onPress={handleAddDeliverable}
									loading={addingDeliverable}
									disabled={addingDeliverable}
								/>
							</View>
						</View>
					) : null}

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
			{toast ? <Toast message={toast.message} type={toast.type} /> : null}
		</ScrollView>
	);
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
		backgroundColor: "#F9FAFB",
		padding: 10,
		borderRadius: 10,
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
