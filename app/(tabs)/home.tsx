import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native";
import AppButton from "../../src/components/AppButton";
import { useRouter } from "expo-router";
import { signOut } from "../../src/api/supabase";
import { listMyProjectsServer } from "../../src/data/projects.server";
// AppHeader provided by global Stack header
import { getProfile } from "../../src/data/profile.server";
import { loadProjects } from "../../src/data/projects.local";
import { colors } from "../../src/theme/colors";
import { themeStyles } from "../../src/theme/styles";
import GradientHeader from "../../src/components/GradientHeader";
import TaskBubble from "../../src/components/TaskBubble";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LOCAL_MEMBER_ID_KEY = "gpai_localMemberId";

export default function HomeRoute() {
	const router = useRouter();
	const [projects, setProjects] = useState<any[]>([]);
	const [displayName, setDisplayName] = useState("Me");
	const [fullName, setFullName] = useState<string | null>(null);

	useEffect(() => {
		reload();
		// load profile for greeting
		(async () => {
			try {
				const sess = await (await import("../../src/api/supabase")).getSession();
				const user = sess?.data?.session?.user;
				if (user) {
					const p = await getProfile(user.id);
					setFullName(p?.full_name ?? null);
				}
			} catch (e) {
				//
			}
		})();
	}, []);
	useEffect(() => {
		AsyncStorage.getItem("gpai_localDisplayName").then((v) => setDisplayName(v ?? "Me"));
	}, []);

	async function reload() {
		try {
			const ps = await listMyProjectsServer();
			setProjects(ps ?? []);
		} catch (e) {
			// fallback to local
			const ps = await loadProjects();
			setProjects(ps ?? []);
		}
	}

	// collect next tasks assigned to me
	const [localId, setLocalId] = useState<string | null>(null);
	const [nextTasks, setNextTasks] = useState<any[]>([]);

	useEffect(() => {
		AsyncStorage.getItem(LOCAL_MEMBER_ID_KEY).then((v) => setLocalId(v));
	}, []);

	useEffect(() => {
		// compute top 5 tasks assigned to me
		if (!projects || projects.length === 0 || !localId) {
			setNextTasks([]);
			return;
		}
		const allTasks: any[] = [];
		projects.forEach((p) => {
			(p.tasks ?? []).forEach((t: any) => {
				if (t.ownerMemberId === localId && t.status !== "done") allTasks.push({ ...t, projectId: p.id, projectName: p.name });
			});
		});
		const sorted = allTasks.slice(0, 5);
		setNextTasks(sorted);
	}, [projects, localId]);
	const recentProjects = projects.slice(0, 5);

	return (
		<View style={themeStyles.screen}>
			<GradientHeader title={`Hey ${fullName ?? displayName}`} subtitle="Quick overview" />

			<View style={[themeStyles.card, { marginBottom: 12 }]}>
				<Text style={{ fontWeight: "700", fontSize: 16 }}>Your Next Tasks</Text>
				{nextTasks.length === 0 ? (
					<View style={{ padding: 12, marginTop: 8 }}>
						<Text style={{ color: "#6B7280" }}>No upcoming tasks assigned to you.</Text>
					</View>
				) : (
					<View style={{ marginTop: 8 }}>
						<FlatList
							data={nextTasks}
							horizontal
							keyExtractor={(t) => t.id}
							renderItem={({ item }) => <TaskBubble title={item.title} />}
						/>
					</View>
				)}
			</View>

			<View style={[themeStyles.card, { marginBottom: 12 }]}>
				<Text style={{ fontWeight: "700", fontSize: 16 }}>Recent Projects</Text>
				{recentProjects.length === 0 ? (
					<View style={{ padding: 12, marginTop: 8 }}>
						<Text style={{ color: "#6B7280" }}>No recent projects yet.</Text>
					</View>
				) : (
					recentProjects.map((p) => (
						<TouchableOpacity key={p.id} onPress={() => router.push(`/project/${p.id}`)} style={{ marginTop: 8 }}>
							<Text style={{ fontWeight: "600" }}>{p.name}</Text>
							<Text style={{ color: "#6B7280" }}>{p.timeframe}</Text>
						</TouchableOpacity>
					))
				)}
			</View>

			<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
				<AppButton title="Create project" onPress={() => router.push("/projects/create")} variant="primary" />
				<AppButton title="View all projects" onPress={() => router.push("/projects")} variant="secondary" />
			</View>
			<View style={{ marginTop: 12 }}>
				<AppButton title="Sign out" onPress={() => signOut()} variant="ghost" />
			</View>
		</View>
	);
}


