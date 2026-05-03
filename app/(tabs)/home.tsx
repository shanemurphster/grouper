import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, useWindowDimensions } from "react-native";
import AppButton from "../../src/components/AppButton";
import { useRouter } from "expo-router";
import { signOut } from "../../src/api/supabase";
import { listMyProjectsServer, listMyTasksServer, joinProjectServer } from "../../src/data/projects.server";
import { getProfile } from "../../src/data/profile.server";
import { loadProjects } from "../../src/data/projects.local";
import { colors } from "../../src/theme/colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSession } from "../../src/state/sessionStore";
import { useTheme } from "../../src/state/themeStore";
import Toast from "../../src/components/Toast";
import { updateTaskServer } from "../../src/data/tasks.server";

const PLAN_STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
	ready:   { bg: "#D1FAE5", text: "#065F46", label: "Plan ready" },
	pending: { bg: "#FEF9C3", text: "#854D0E", label: "Generating…" },
	failed:  { bg: "#FEE2E2", text: "#991B1B", label: "Plan failed" },
};

const TASK_STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
	todo:  { bg: "#F3F4F6", text: "#374151", label: "To Do" },
	doing: { bg: "#EFF6FF", text: "#1D4ED8", label: "In Progress" },
	done:  { bg: "#D1FAE5", text: "#065F46", label: "Done" },
};

const TASKS_DEFAULT_LIMIT = 5;

export default function HomeRoute() {
	const router = useRouter();
	const { width } = useWindowDimensions();
	const isWide = width >= 640;
	const session = useSession();
	const { darkMode } = useTheme();

	const [projects, setProjects] = useState<any[]>([]);
	const [tasks, setTasks] = useState<any[]>([]);
	const [displayName, setDisplayName] = useState("Me");
	const [fullName, setFullName] = useState<string | null>(null);
	const [joinModalOpen, setJoinModalOpen] = useState(false);
	const [joinCode, setJoinCode] = useState("");
	const [joinDisplayName, setJoinDisplayName] = useState("");
	const [joinLoading, setJoinLoading] = useState(false);
	const [tasksExpanded, setTasksExpanded] = useState(false);
	const [toast, setToast] = useState<{ message: string; type?: "info" | "error" | "success" } | null>(null);

	const bg = darkMode ? "#0F172A" : colors.lightBackground;
	const cardBg = darkMode ? "#1E293B" : "#fff";
	const textColor = darkMode ? "#F1F5F9" : colors.textPrimary;
	const mutedColor = darkMode ? "#94A3B8" : colors.textMuted;
	const borderColor = darkMode ? "#334155" : "#E5E7EB";

	useEffect(() => {
		reload();
		(async () => {
			try {
				const sess = await (await import("../../src/api/supabase")).getSession();
				const user = sess?.data?.session?.user;
				if (user) {
					const p = await getProfile(user.id);
					setFullName(p?.full_name ?? null);
				}
			} catch {}
		})();
	}, []);

	useEffect(() => {
		AsyncStorage.getItem("gpai_localDisplayName").then((v) => setDisplayName(v ?? "Me"));
	}, []);

	async function reload() {
		try {
			const ps = await listMyProjectsServer();
			setProjects(ps ?? []);
		} catch {
			const ps = await loadProjects();
			setProjects(ps ?? []);
		}
		try {
			const ts = await listMyTasksServer();
			setTasks(ts ?? []);
		} catch {
			setTasks([]);
		}
	}

	async function toggleTaskDone(task: any) {
		const newStatus = task.status === "done" ? "todo" : "done";
		const prev = tasks;
		setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
		try {
			await updateTaskServer(task.id, { status: newStatus });
		} catch (e: any) {
			setTasks(prev);
			setToast({ message: `Failed: ${e?.message ?? String(e)}`, type: "error" });
		}
	}

	const taskCountByProject = tasks.reduce<Record<string, number>>((acc, t: any) => {
		const pid = t.projectId ?? t.project_id;
		if (pid) acc[pid] = (acc[pid] ?? 0) + 1;
		return acc;
	}, {});

	const greeting = fullName ?? displayName;
	const visibleTasks = tasksExpanded ? tasks : tasks.slice(0, TASKS_DEFAULT_LIMIT);

	return (
		<ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={{ paddingBottom: 40 }}>
			{/* Header */}
			<View style={{ backgroundColor: colors.pennBlue, paddingTop: 20, paddingBottom: 24, paddingHorizontal: 20 }}>
				<Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>Hey {greeting}</Text>
				<Text style={{ color: "rgba(255,255,255,0.75)", marginTop: 4, fontSize: 14 }}>Here's what's on your plate</Text>
			</View>

			{/* Quick Actions */}
			<View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
				<TouchableOpacity
					onPress={() => router.push("/projects/create")}
					style={{ flex: 1, backgroundColor: colors.pennBlue, paddingVertical: 12, borderRadius: 12, alignItems: "center" }}
				>
					<Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>+ Create Project</Text>
				</TouchableOpacity>
				<TouchableOpacity
					onPress={() => {
						const def = session?.profile?.full_name ?? (session?.session?.user?.email?.split("@")[0] ?? "Me");
						setJoinDisplayName(def ?? "");
						setJoinModalOpen(true);
					}}
					style={{ flex: 1, backgroundColor: cardBg, paddingVertical: 12, borderRadius: 12, alignItems: "center", borderWidth: 1.5, borderColor: colors.pennBlue }}
				>
					<Text style={{ color: colors.pennBlue, fontWeight: "700", fontSize: 14 }}>Join Project</Text>
				</TouchableOpacity>
			</View>

			{/* Your Tasks */}
			<View style={{ paddingHorizontal: 16, marginTop: 20 }}>
				<Text style={{ fontSize: 17, fontWeight: "800", color: textColor, marginBottom: 10 }}>Your Tasks</Text>
				{tasks.length === 0 ? (
					<View style={{ backgroundColor: cardBg, padding: 20, borderRadius: 14, alignItems: "center" }}>
						<Text style={{ color: mutedColor }}>No tasks assigned to you.</Text>
					</View>
				) : (
					<View style={{ gap: 8 }}>
						{visibleTasks.map((t: any) => {
							const statusStyle = TASK_STATUS_STYLE[t.status ?? "todo"] ?? TASK_STATUS_STYLE.todo;
							const isDone = t.status === "done";
							return (
								<View
									key={t.id}
									style={{
										backgroundColor: cardBg,
										borderRadius: 12,
										paddingVertical: 10,
										paddingRight: 12,
										paddingLeft: 4,
										flexDirection: "row",
										alignItems: "center",
										shadowColor: "#000",
										shadowOffset: { width: 0, height: 1 },
										shadowOpacity: 0.04,
										shadowRadius: 4,
										elevation: 1,
									}}
								>
									{/* Checkbox — does NOT navigate */}
									<TouchableOpacity
										onPress={() => toggleTaskDone(t)}
										style={{ width: 44, alignItems: "center", justifyContent: "center" }}
										accessibilityLabel={isDone ? "Mark incomplete" : "Mark done"}
									>
										<View style={{
											width: 22,
											height: 22,
											borderRadius: 6,
											borderWidth: 2,
											borderColor: isDone ? colors.pennBlue : borderColor,
											backgroundColor: isDone ? colors.pennBlue : "transparent",
											alignItems: "center",
											justifyContent: "center",
										}}>
											{isDone ? <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>✓</Text> : null}
										</View>
									</TouchableOpacity>

									{/* Card body — navigates to project */}
									<TouchableOpacity
										onPress={() => router.push(`/project/${t.projectId ?? t.project_id}`)}
										activeOpacity={0.85}
										style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
									>
										<View style={{ flex: 1, marginRight: 10 }}>
											<Text
												style={{ fontWeight: "600", color: isDone ? mutedColor : textColor, textDecorationLine: isDone ? "line-through" : "none" }}
												numberOfLines={1}
											>
												{t.title}
											</Text>
											<Text style={{ fontSize: 12, color: mutedColor, marginTop: 2 }}>{t.projectName ?? "Project"}</Text>
										</View>
										<View style={{ backgroundColor: statusStyle.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
											<Text style={{ color: statusStyle.text, fontSize: 11, fontWeight: "600" }}>{statusStyle.label}</Text>
										</View>
									</TouchableOpacity>
								</View>
							);
						})}

						{/* Show more / show less */}
						{tasks.length > TASKS_DEFAULT_LIMIT ? (
							<TouchableOpacity
								onPress={() => setTasksExpanded((v) => !v)}
								style={{ alignItems: "center", paddingVertical: 8 }}
							>
								<Text style={{ color: colors.pennBlue, fontWeight: "600", fontSize: 13 }}>
									{tasksExpanded ? "Show less" : `Show ${tasks.length - TASKS_DEFAULT_LIMIT} more`}
								</Text>
							</TouchableOpacity>
						) : null}
					</View>
				)}
			</View>

			{/* Your Projects */}
			<View style={{ paddingHorizontal: 16, marginTop: 24 }}>
				<Text style={{ fontSize: 17, fontWeight: "800", color: textColor, marginBottom: 10 }}>Your Projects</Text>
				{projects.length === 0 ? (
					<View style={{ backgroundColor: cardBg, padding: 20, borderRadius: 14, alignItems: "center" }}>
						<Text style={{ color: mutedColor }}>No projects yet. Create one to get started.</Text>
					</View>
				) : (
					<View style={isWide ? { flexDirection: "row", flexWrap: "wrap", gap: 10 } : { gap: 10 }}>
						{projects.map((p) => {
							const myTaskCount = taskCountByProject[p.id] ?? 0;
							const statusStyle = PLAN_STATUS_STYLE[(p as any).plan_status ?? ""] ?? null;
							return (
								<TouchableOpacity
									key={p.id}
									onPress={() => router.push(`/project/${p.id}`)}
									activeOpacity={0.85}
									style={{
										backgroundColor: cardBg,
										borderRadius: 14,
										padding: 16,
										borderLeftWidth: 4,
										borderLeftColor: colors.pennBlue,
										shadowColor: "#000",
										shadowOffset: { width: 0, height: 2 },
										shadowOpacity: 0.05,
										shadowRadius: 6,
										elevation: 2,
										...(isWide ? { width: "48%" as any } : {}),
									}}
								>
									<Text style={{ fontWeight: "700", fontSize: 15, color: textColor }} numberOfLines={2}>{p.name}</Text>
									<View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8, flexWrap: "wrap" }}>
										{statusStyle ? (
											<View style={{ backgroundColor: statusStyle.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
												<Text style={{ color: statusStyle.text, fontSize: 11, fontWeight: "700" }}>{statusStyle.label}</Text>
											</View>
										) : null}
										{myTaskCount > 0 ? (
											<View style={{ backgroundColor: "#EFF6FF", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
												<Text style={{ color: colors.pennBlue, fontSize: 11, fontWeight: "700" }}>
													{myTaskCount} task{myTaskCount !== 1 ? "s" : ""} assigned
												</Text>
											</View>
										) : null}
									</View>
								</TouchableOpacity>
							);
						})}
					</View>
				)}
			</View>

			{/* Sign out */}
			<View style={{ paddingHorizontal: 16, marginTop: 28 }}>
				<AppButton title="Sign out" onPress={() => signOut()} variant="ghost" />
			</View>

			{/* Join modal */}
			{joinModalOpen ? (
				<View style={{
					position: "absolute", left: 16, right: 16, top: 100,
					backgroundColor: cardBg, padding: 20, borderRadius: 16,
					shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 20, elevation: 10,
				}}>
					<Text style={{ fontWeight: "700", fontSize: 16, marginBottom: 14, color: textColor }}>Join a Project</Text>
					<TextInput
						placeholder="Join code"
						placeholderTextColor={mutedColor}
						value={joinCode}
						onChangeText={setJoinCode}
						autoCapitalize="characters"
						style={{ borderWidth: 1, borderColor, borderRadius: 8, padding: 10, marginBottom: 10, letterSpacing: 2, color: textColor, backgroundColor: cardBg }}
					/>
					<TextInput
						placeholder="Your display name"
						placeholderTextColor={mutedColor}
						value={joinDisplayName}
						onChangeText={setJoinDisplayName}
						style={{ borderWidth: 1, borderColor, borderRadius: 8, padding: 10, marginBottom: 14, color: textColor, backgroundColor: cardBg }}
					/>
					<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
						<AppButton title="Cancel" onPress={() => setJoinModalOpen(false)} variant="secondary" />
						<AppButton
							title="Join"
							onPress={async () => {
								setJoinLoading(true);
								try {
									const projId = await joinProjectServer({ joinCode: joinCode.trim(), displayName: joinDisplayName.trim() });
									setToast({ message: "Joined project!", type: "success" });
									setJoinModalOpen(false);
									setJoinCode("");
									await reload();
									router.push(`/project/${projId}`);
								} catch (e: any) {
									setToast({ message: `Join failed: ${e?.message ?? String(e)}`, type: "error" });
								} finally {
									setJoinLoading(false);
								}
							}}
							variant="primary"
							loading={joinLoading}
						/>
					</View>
				</View>
			) : null}

			{toast ? <Toast message={toast.message} type={toast.type} /> : null}
		</ScrollView>
	);
}
