import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import CategoryChip from "./CategoryChip";
import { colors } from "../theme/colors";

type Props = {
	task: any;
	onDone?: () => void;
	onToggleBlocked?: () => void;
	onDelete?: () => void;
	onReassign?: () => void;
	onAddLink?: () => void;
};

export default function TaskCard({ task, onDone, onReassign, onAddLink, onDelete }: Props) {
	return (
		<View style={styles.card}>
			<View style={{ flexDirection: "row", alignItems: "center" }}>
				<TouchableOpacity onPress={onDone} style={styles.checkbox} accessibilityLabel="Toggle done">
					<Text style={{ fontSize: 18 }}>{task.status === "done" ? "☑" : "☐"}</Text>
				</TouchableOpacity>
				<CategoryChip category={task.category ?? "Research"} />
				<View style={{ flex: 1, marginLeft: 12 }}>
					{/* size prefix */}
					<Text style={[styles.title, task.status === "done" ? styles.titleDone : null]}>
						{(task.size === "L" && "Large — ") || (task.size === "M" && "Medium — ") || (task.size === "S" && "Small — ") || ""}
						{task.title}
					</Text>
					<Text style={styles.subtitle}>{task.category} • {task.size}</Text>
					{task.url ? <Text style={{ color: colors.pennBlue, marginTop: 6 }}>{task.url}</Text> : null}
				</View>
				<View style={{ alignItems: "flex-end" }}>
					<Text style={[styles.owner, { backgroundColor: getColorForMember(task.ownerMemberId ?? ""), paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, color: colors.white }]}>{task.ownerMemberId ?? "Unassigned"}</Text>
					<View style={{ flexDirection: "row", marginTop: 8 }}>
						<TouchableOpacity onPress={onReassign} style={[styles.actionBtn, { marginLeft: 8 }]}>
							<Text style={styles.actionText}>Reassign</Text>
						</TouchableOpacity>
						{task.blocked ? (
							<TouchableOpacity onPress={() => {}} style={[styles.actionBtn, { marginLeft: 8, backgroundColor: "#FEF3C7" }]}>
								<Text style={{ color: "#B45309", fontWeight: "700" }}>Blocked</Text>
							</TouchableOpacity>
						) : null}
						<TouchableOpacity onPress={onAddLink} style={[styles.actionBtn, { marginLeft: 8, backgroundColor: colors.blueLight }]}>
							<Text style={{ color: colors.pennBlue, fontWeight: "700" }}>Link</Text>
						</TouchableOpacity>
						<TouchableOpacity onPress={onDelete} style={[styles.actionBtn, { marginLeft: 8, backgroundColor: "#FEE2E2" }]}>
							<Text style={{ color: colors.pennRed, fontWeight: "700" }}>Delete</Text>
						</TouchableOpacity>
					</View>
				</View>
			</View>
		</View>
	);
}

function prettyStatus(s: string) {
	if (s === "todo") return "To-Do";
	if (s === "doing") return "Doing";
	if (s === "done") return "Done";
	return s;
}

function getColorForMember(id: string) {
	const palette = ["#60A5FA", "#7C3AED", "#F59E0B", "#34D399", "#14B8A6", "#9CA3AF"];
	if (!id) return "#6B7280";
	let hash = 0;
	for (let i = 0; i < id.length; i++) hash = (hash << 5) - hash + id.charCodeAt(i);
	const idx = Math.abs(hash) % palette.length;
	return palette[idx];
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: colors.card,
		borderRadius: 12,
		padding: 12,
		marginBottom: 10,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.06,
		shadowRadius: 6,
		elevation: 2,
	},
	title: {
		fontSize: 15,
		fontWeight: "700",
		color: colors.text,
	},
	subtitle: {
		fontSize: 12,
		color: colors.subtleText,
		marginTop: 4,
	},
	owner: {
		fontSize: 12,
		color: colors.subtleText,
	},
	actionBtn: {
		backgroundColor: colors.blueLight,
		paddingVertical: 6,
		paddingHorizontal: 8,
		borderRadius: 8,
	},
	actionText: {
		color: colors.pennBlue,
		fontWeight: "600",
	},
	checkbox: {
		width: 32,
		alignItems: "center",
		justifyContent: "center",
	},
	titleDone: {
		textDecorationLine: "line-through",
		opacity: 0.6,
	},
});

