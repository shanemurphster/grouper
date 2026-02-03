import React, { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert } from "react-native";
import AppButton from "../../../src/components/AppButton";
import { Picker } from "@react-native-picker/picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createTaskServer } from "../../../src/data/tasks.server";
import { autoFillTask } from "../../../src/services/taskAutoFill";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchProjectDetail } from "../../../src/data/projectDetail.server";
import Toast from "../../../src/components/Toast";

const LOCAL_MEMBER_ID_KEY = "gpai_localMemberId";

export default function AddTaskRoute() {
	const { id } = useLocalSearchParams() as { id: string };
	const router = useRouter();
	const [title, setTitle] = useState("");
	const [details, setDetails] = useState("");
	const [assignee, setAssignee] = useState<string | "unassigned">("unassigned");
	const [localMemberId, setLocalMemberId] = useState<string | null>(null);
	const [project, setProject] = useState<any>(null);
	const [toast, setToast] = useState<{ message: string; type?: "info" | "error" | "success" } | null>(null);

	useEffect(() => {
		AsyncStorage.getItem(LOCAL_MEMBER_ID_KEY).then((v) => setLocalMemberId(v));
		// fetch project from server when needed could be added
	}, []);

	// load project members for assignee picker
	useEffect(() => {
		async function loadProject() {
			if (!id) return;
			try {
				const detail = await fetchProjectDetail(id);
				if (detail) {
					setProject(detail.project ?? detail);
					// default assignee to "Me" if we have local id
					const local = await AsyncStorage.getItem(LOCAL_MEMBER_ID_KEY);
					setAssignee(local ?? "unassigned");
				}
			} catch (e) {
				// ignore
			}
		}
		loadProject();
	}, [id]);

	async function save() {
		if (!id) return;
		const payload: any = {
			title: title || "Untitled",
			details: details || undefined,
			category: "Research",
			status: "todo",
			size: "S",
			ownerMemberId: assignee === "unassigned" ? null : assignee,
			blocked: false,
		};
		const classification = autoFillTask({ title: payload.title, details: payload.details ?? "", projectTimeframe: project?.timeframe ?? "oneWeek" });
		payload.category = classification.category;
		payload.size = classification.size;
		if (classification.dueDate) payload.dueDate = classification.dueDate;
		try {
			const created = await createTaskServer(id, payload);
			console.log("Created task", created?.id, created);
			// show success toast briefly before navigating back so user sees feedback
			setToast({ message: "Saved", type: "success" });
			setTimeout(() => {
				setToast(null);
				router.replace(`/project/${id}`);
			}, 700);
			// server will auto-create assignment request when appropriate
		} catch (e) {
			console.error("createTaskServer failed", e);
			setToast({ message: `Failed to save: ${String(e)}`, type: "error" });
			Alert.alert("Failed to create task", String(e));
		}
	}

	return (
		<View style={{ flex: 1, padding: 12 }}>
			<Text style={{ fontSize: 18, fontWeight: "700" }}>Add Task</Text>
			<TextInput placeholder="Title" value={title} onChangeText={setTitle} style={styles.input} />
			<TextInput placeholder="Details" value={details} onChangeText={setDetails} style={[styles.input, { height: 80 }]} multiline />
			{/* Assignee picker */}
			<View style={{ marginBottom: 8 }}>
				<Text style={{ marginBottom: 6, fontWeight: "600" }}>Assignee</Text>
				<View style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 8, overflow: "hidden" }}>
					<Picker selectedValue={assignee} onValueChange={(v) => setAssignee(v)}>
						<Picker.Item label="Unassigned" value="unassigned" />
						{localMemberId ? <Picker.Item label="Me" value={localMemberId} /> : null}
						{(project?.members ?? []).map((m: any) => (
							<Picker.Item key={m.id} label={m.displayName ?? m.display_name ?? "Member"} value={m.id} />
						))}
					</Picker>
				</View>
			</View>
			{/* request toggle removed — requests are auto-created on the server when assigning to others */}
			<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
				<AppButton title="Cancel" variant="secondary" onPress={() => router.back()} />
				<AppButton title="Save" variant="primary" onPress={save} />
			</View>
			{toast ? <Toast message={toast.message} type={toast.type} /> : null}
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

