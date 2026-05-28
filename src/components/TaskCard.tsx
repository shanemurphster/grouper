import React from "react";
import { View, Text, StyleSheet } from "react-native";
import CategoryChip from "./CategoryChip";
import AccessiblePressable from "./AccessiblePressable";
import { colors } from "../theme/colors";
import { useAppTheme } from "../theme/appTheme";

type Props = {
	task: any;
	onDone?: () => void;
	onToggleBlocked?: () => void;
	onDelete?: () => void;
	onReassign?: () => void;
	onAddLink?: () => void;
	bundleColor?: string;
	bundleAccent?: string;
	ownerLabel?: string | null;
};

export default function TaskCard({
	task,
	onDone,
	onReassign,
	onAddLink,
	onDelete,
	bundleColor,
	bundleAccent,
	ownerLabel,
}: Props) {
	const theme = useAppTheme();
	const accentStyle = bundleAccent ? { borderColor: bundleAccent, borderWidth: 1 } : null;
	const isDone = task.status === "done";
	const cardBackground = bundleColor ?? theme.card;
	return (
		<View style={[styles.card, { backgroundColor: cardBackground, shadowColor: theme.shadow }, accentStyle]}>
			<View style={{ flexDirection: "row", alignItems: "center" }}>
				<AccessiblePressable
					onPress={onDone}
					style={styles.checkbox}
					accessibilityLabel={isDone ? "Mark task incomplete" : "Mark task done"}
				>
					<Text style={{ fontSize: 18 }}>{isDone ? "☑" : "☐"}</Text>
				</AccessiblePressable>
				<View style={{ flex: 1, marginLeft: 12 }}>
					<Text style={[styles.title, { color: theme.text }, isDone ? styles.titleDone : null]} numberOfLines={1}>
						{task.title}
					</Text>
					<View style={styles.metaRow}>
						<CategoryChip category={task.category ?? "Research"} />
						<Text style={[styles.metaText, { color: theme.muted }]}>
							{task.size ? task.size : "Size?"} · {task.status}
						</Text>
					</View>
					{task.details ? <Text style={[styles.details, { color: theme.muted }]}>{task.details}</Text> : null}
					{task.url ? <Text style={styles.linkText}>{task.url}</Text> : null}
				</View>
				<View style={{ alignItems: "flex-end" }}>
					<Text
						style={[
							styles.owner,
							{
								backgroundColor: getColorForMember(task.ownerMemberId ?? ""),
								paddingHorizontal: 8,
								paddingVertical: 4,
								borderRadius: 8,
								color: colors.white,
							},
						]}
					>
						{ownerLabel ?? (task.ownerMemberId ? "Member" : "Unassigned")}
					</Text>
					<View style={{ flexDirection: "row", marginTop: 8 }}>
						<AccessiblePressable
							onPress={onReassign}
							style={[styles.actionBtn, { marginLeft: 8, backgroundColor: theme.badgeBlueBg }]}
							accessibilityLabel={`Reassign task ${task.title}`}
						>
							<Text style={[styles.actionText, { color: theme.pennBlue }]}>Reassign</Text>
						</AccessiblePressable>
						{task.blocked ? (
							<View style={[styles.actionBtn, { marginLeft: 8, backgroundColor: theme.warnBg }]}>
								<Text style={{ color: theme.warnText, fontWeight: "700" }}>Blocked</Text>
							</View>
						) : null}
						<AccessiblePressable
							onPress={onAddLink}
							style={[styles.actionBtn, { marginLeft: 8, backgroundColor: theme.badgeBlueBg }]}
							accessibilityLabel={`Add link to task ${task.title}`}
						>
							<Text style={{ color: theme.pennBlue, fontWeight: "700" }}>Link</Text>
						</AccessiblePressable>
						<AccessiblePressable
							onPress={onDelete}
							style={[styles.actionBtn, { marginLeft: 8, backgroundColor: theme.planFailedBg }]}
							accessibilityLabel={`Delete task ${task.title}`}
						>
							<Text style={{ color: colors.pennRed, fontWeight: "700" }}>Delete</Text>
						</AccessiblePressable>
					</View>
				</View>
			</View>
		</View>
	);
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
	metaRow: {
		marginTop: 4,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	metaText: {
		fontSize: 12,
		color: colors.subtleText,
	},
	details: {
		marginTop: 4,
		color: "#374151",
	},
	linkText: {
		marginTop: 4,
		color: colors.primaryBlue,
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
