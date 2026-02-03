import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getProject, upsertProject } from "../../../src/storage/repo";
import { themeStyles } from "../../../src/theme/styles";
import Snackbar from "../../../src/components/Snackbar";

export default function RequestsRoute() {
	const { id } = useLocalSearchParams() as { id: string };
	const [requests, setRequests] = useState<any[]>([]);
	const [project, setProject] = useState<any>(null);
	const [lastAction, setLastAction] = useState<any | null>(null);
	const [showSnackbar, setShowSnackbar] = useState(false);

	useEffect(() => {
		load();
	}, []);

	async function load() {
		if (!id) return;
		const p = await getProject(id);
		setProject(p);
		setRequests((p?.requests ?? []).filter((r: any) => r.status === "pending"));
	}

	async function accept(r: any) {
		if (!project) return;
		const updatedRequests = project.requests.map((req: any) => (req.id === r.id ? { ...req, status: "accepted" } : req));
		const newProject = { ...project, requests: updatedRequests };
		await upsertProject(newProject);
		load();
	}

	async function decline(r: any) {
		if (!project) return;
		const prev = JSON.parse(JSON.stringify(project));
		const updatedRequests = project.requests.map((req: any) => (req.id === r.id ? { ...req, status: "declined" } : req));
		const tasks = project.tasks.map((t: any) => (t.id === r.taskId ? { ...t, ownerMemberId: undefined, updatedAt: new Date().toISOString() } : t));
		const newProject = { ...project, requests: updatedRequests, tasks };
		await upsertProject(newProject);
		load();
		setLastAction({ type: "decline", before: prev, message: `Declined: ${r.message}`, undo: async () => {
			await upsertProject(prev);
			setProject(prev);
			load();
		}});
		setShowSnackbar(true);
	}

	function getMemberName(id: string) {
		return project?.members?.find((m: any) => m.id === id)?.displayName ?? id;
	}

	return (
		<View style={[themeStyles.screen, { paddingTop: 8 }]}>
			<Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>Requests</Text>
			{requests.length === 0 ? (
				<View style={[themeStyles.card, { alignItems: "center" }]}>
					<Text style={{ color: "#6B7280" }}>No requests at the moment.</Text>
				</View>
			) : (
				<FlatList
					data={requests}
					keyExtractor={(r) => r.id}
					renderItem={({ item }) => (
						<View style={[themeStyles.card, styles.row, { marginBottom: 12 }]}>
							<View style={{ flex: 1 }}>
								<Text style={{ fontWeight: "600" }}>{item.message}</Text>
								<Text style={{ fontSize: 12, color: "#666", marginTop: 6 }}>From: {getMemberName(item.fromMemberId)}</Text>
							</View>
							<View style={{ justifyContent: "center" }}>
								<TouchableOpacity onPress={() => accept(item)} style={styles.acceptBtn}>
									<Text style={{ color: "#fff", fontWeight: "700" }}>Accept</Text>
								</TouchableOpacity>
								<TouchableOpacity onPress={() => decline(item)} style={styles.declineBtn}>
									<Text style={{ color: "#374151", fontWeight: "600" }}>Decline</Text>
								</TouchableOpacity>
							</View>
						</View>
					)}
				/>
			)}
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
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
	},
	acceptBtn: {
		backgroundColor: "#10B981",
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 8,
		marginBottom: 8,
	},
	declineBtn: {
		backgroundColor: "#F3F4F6",
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 8,
	},
});

