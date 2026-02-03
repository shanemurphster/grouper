import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, StyleSheet } from "react-native";
import AppButton from "../../src/components/AppButton";
import { useRouter, useFocusEffect } from "expo-router";
import { listMyProjectsServer, setProjectArchivedServer, ProjectSummary, joinProjectServer } from "../../src/data/projects.server";
import { useSession } from "../../src/state/sessionStore";
import Toast from "../../src/components/Toast";
import { loadProjects } from "../../src/data/projects.local";
import { upsertProject } from "../../src/storage/repo";
import { Project } from "../../src/models/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { themeStyles } from "../../src/theme/styles";
import GradientHeader from "../../src/components/GradientHeader";
import ProjectCard from "../../src/components/ProjectCard";
// AppHeader provided by global Stack header

const LOCAL_DISPLAY_NAME_KEY = "gpai_localDisplayName";

export default function ProjectsListRoute() {
	const router = useRouter();
	const [projects, setProjects] = useState<ProjectSummary[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	const [showArchived, setShowArchived] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [newName, setNewName] = useState("");
	const [timeframe, setTimeframe] = useState<"twoDay" | "oneWeek" | "long">("oneWeek");
	const [displayName, setDisplayName] = useState("");
	const session = useSession();
	const [joinModalOpen, setJoinModalOpen] = useState(false);
	const [joinCode, setJoinCode] = useState("");
	const [joinDisplayName, setJoinDisplayName] = useState("");
	const [joinLoading, setJoinLoading] = useState(false);
	const [toast, setToast] = useState<{ message: string; type?: "info" | "error" | "success" } | null>(null);

	useEffect(() => {
		reload();
		AsyncStorage.getItem(LOCAL_DISPLAY_NAME_KEY).then((v) => setDisplayName(v ?? "Me"));
	}, []);

	useFocusEffect(
		React.useCallback(() => {
			reload();
		}, [])
	);

	async function onRefresh() {
		setRefreshing(true);
		await reload();
		setRefreshing(false);
	}

	async function reload() {
		try {
			const loaded = await listMyProjectsServer();
			setProjects(loaded ?? []);
		} catch (e) {
			// fallback to local cache
			const loaded = await loadProjects();
			setProjects(loaded ?? []);
		}
	}

	async function createProject() {
		const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
		const proj: Project = {
			id,
			name: newName || "Untitled Project",
			timeframe,
			joinCode: undefined,
			members: [],
			tasks: [],
			deliverables: [],
			requests: [],
			createdAt: new Date().toISOString(),
		};
		await upsertProject(proj);
		setCreateOpen(false);
		setNewName("");
		reload();
	}

	const activeProjects = projects.filter((p) => !p.isArchived);
	const archivedProjects = projects.filter((p) => p.isArchived);

	return (
		<View style={themeStyles.screen}>
			<View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
				<GradientHeader title="Projects" subtitle="Your group workspaces" style={{ flex: 1 }} />
				<View style={{ marginLeft: 12, flexDirection: "row" }}>
					<AppButton title="Create" onPress={() => router.push("/projects/create")} variant="primary" />
					<View style={{ width: 8 }} />
					<AppButton title="Join" onPress={() => {
						const def = session?.profile?.full_name ?? (session?.session?.user?.email?.split("@")[0] ?? "Me");
						setJoinDisplayName(def);
						setJoinModalOpen(true);
					}} variant="secondary" />
				</View>
			</View>

			{projects.length === 0 ? (
				<View style={{ alignItems: "center", marginTop: 40 }}>
					<Text style={{ fontSize: 18, fontWeight: "700" }}>No projects yet</Text>
					<Text style={{ color: "#6B7280", marginTop: 8 }}>Create a project to get started.</Text>
					<AppButton title="Create project" onPress={() => router.push("/projects/create")} variant="primary" />
				</View>
			) : (
				<>
					<Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 8 }}>Active Projects</Text>
					<FlatList
						data={activeProjects}
						keyExtractor={(p) => p.id}
						refreshing={refreshing}
						onRefresh={onRefresh}
						renderItem={({ item }) => (
							<View style={{ marginBottom: 8 }}>
								<ProjectCard project={item} onPress={() => router.push(`/project/${item.id}`)} />
								<View style={{ position: "absolute", right: 18, top: 18 }}>
									<AppButton
										title={item.isArchived ? "Unarchive" : "Archive"}
										variant="secondary"
										onPress={async () => {
											try {
												await setProjectArchivedServer({ projectId: item.id, isArchived: !item.isArchived });
											} catch (e) {
												// fallback
												await upsertProject?.({ ...(item as any), isArchived: !item.isArchived });
											}
											reload();
										}}
									/>
								</View>
							</View>
						)}
					/>
					{archivedProjects.length > 0 && (
						<>
					<TouchableOpacity onPress={() => setShowArchived((s) => !s)} style={{ marginTop: 12, marginBottom: 8 }}>
								<Text style={{ color: "#6B7280" }}>{showArchived ? "Hide Archived" : `Archived (${archivedProjects.length})`}</Text>
							</TouchableOpacity>
					{showArchived ? (
								<FlatList
									data={archivedProjects}
									keyExtractor={(p) => p.id}
									renderItem={({ item }) => (
										<View style={{ marginBottom: 8 }}>
											<ProjectCard project={item} onPress={() => router.push(`/project/${item.id}`)} />
											<View style={{ position: "absolute", right: 18, top: 18 }}>
												<AppButton
													title="Unarchive"
													variant="secondary"
													onPress={async () => {
														await upsertProject({ ...item, isArchived: false });
														reload();
													}}
												/>
											</View>
										</View>
									)}
								/>
							) : null}
						</>
					)}
				</>
			)}

			{joinModalOpen ? (
				<View style={{ position: "absolute", left: 16, right: 16, top: 120, backgroundColor: "#fff", padding: 12, borderRadius: 12 }}>
					<Text style={{ fontWeight: "700", marginBottom: 8 }}>Join Project</Text>
					<TextInput placeholder="Join code" value={joinCode} onChangeText={setJoinCode} style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 8 }} />
					<TextInput placeholder="Display name" value={joinDisplayName} onChangeText={setJoinDisplayName} style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, marginBottom: 8 }} />
						<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
							<AppButton title="Cancel" onPress={() => setJoinModalOpen(false)} variant="secondary" />
							<AppButton title="Join" onPress={async () => {
								setJoinLoading(true);
								try {
									const projId = await joinProjectServer({ joinCode: joinCode.trim(), displayName: joinDisplayName.trim() });
									setToast({ message: "Joined project", type: "success" });
									setJoinModalOpen(false);
									await reload();
									router.push(`/project/${projId}`);
								} catch (e: any) {
									console.error("joinProject error", e);
									setToast({ message: `Join failed: ${e?.message ?? String(e)}`, type: "error" });
								} finally {
									setJoinLoading(false);
								}
							}} variant="primary" loading={joinLoading} />
						</View>
				</View>
			) : null}

			{toast ? <Toast message={toast.message} type={toast.type} /> : null}
			{/* Create project navigates to dedicated route */}
		</View>
	);
}

const styles = StyleSheet.create({
	input: {
		borderWidth: 1,
		borderColor: "#ddd",
		padding: 8,
		marginBottom: 8,
	},
});


