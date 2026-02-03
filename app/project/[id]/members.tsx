import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TextInput, StyleSheet } from "react-native";
import AppButton from "../../../src/components/AppButton";
import { useLocalSearchParams } from "expo-router";
import { getProject, upsertProject } from "../../../src/storage/repo";

export default function MembersRoute() {
	const { id } = useLocalSearchParams() as { id: string };
	const [project, setProject] = useState<any>(null);
	const [name, setName] = useState("");

	useEffect(() => {
		(async () => {
			if (!id) return;
			const p = await getProject(id);
			setProject(p);
		})();
	}, []);

	async function addMember() {
		if (!project || !name) return;
		const newMember = { id: `m-${Date.now()}`, displayName: name };
		const newProject = { ...project, members: [...(project.members ?? []), newMember] };
		await upsertProject(newProject);
		setProject(newProject);
		setName("");
	}

	async function removeMember(idToRemove: string) {
		if (!project) return;
		const members = (project.members ?? []).filter((m: any) => m.id !== idToRemove);
		const tasks = (project.tasks ?? []).map((t: any) => (t.ownerMemberId === idToRemove ? { ...t, ownerMemberId: undefined } : t));
		const newProject = { ...project, members, tasks };
		await upsertProject(newProject);
		setProject(newProject);
	}

	return (
		<View style={{ flex: 1, padding: 12 }}>
			<Text style={{ fontSize: 18, fontWeight: "700" }}>Members</Text>
			<FlatList
				data={project?.members ?? []}
				keyExtractor={(m: any) => m.id}
				renderItem={({ item }: any) => (
					<View style={styles.row}>
						<Text>{item.displayName}</Text>
						<AppButton title="Remove" variant="secondary" onPress={() => removeMember(item.id)} />
					</View>
				)}
			/>
			<TextInput placeholder="Member name" value={name} onChangeText={setName} style={styles.input} />
			<AppButton title="Add member" variant="primary" onPress={addMember} />
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		padding: 12,
		borderBottomWidth: 1,
		borderBottomColor: "#eee",
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	input: {
		borderWidth: 1,
		borderColor: "#ddd",
		padding: 8,
		marginVertical: 8,
	},
});

