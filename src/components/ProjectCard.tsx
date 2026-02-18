import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { formatTimeframe } from "../utils/formatTimeframe";

type Props = {
	project: any;
	onPress?: () => void;
	onArchive?: (project: any) => void;
	onUnarchive?: (project: any) => void;
};

export default function ProjectCard({ project, onPress }: Props) {
	return (
		<TouchableOpacity onPress={onPress} style={styles.card}>
			<View style={[styles.accent, { backgroundColor: colors.primaryBlue }]} />
			<View style={styles.content}>
				<View style={{ flex: 1 }}>
					<Text style={styles.title}>{project.name}</Text>
					<Text style={styles.subtitle}>{formatTimeframe(project.timeframe)}</Text>

					{/* small stats only when present and meaningful */}
					{(Array.isArray(project.tasks) && project.tasks.length > 0) || (Array.isArray(project.deliverables) && project.deliverables.length > 0) ? (
						<View style={{ flexDirection: "row", marginTop: 6 }}>
							{Array.isArray(project.tasks) && project.tasks.length > 0 ? (
								<Text style={styles.meta}>{project.tasks.length} tasks</Text>
							) : null}
							{Array.isArray(project.tasks) && project.tasks.length > 0 && Array.isArray(project.deliverables) && project.deliverables.length > 0 ? (
								<Text style={styles.meta}> • </Text>
							) : null}
							{Array.isArray(project.deliverables) && project.deliverables.length > 0 ? (
								<Text style={styles.meta}>Deliverables: {(project.deliverables ?? []).filter((d: any) => d.url && d.url.length > 0).length}/{(project.deliverables ?? []).length}</Text>
							) : null}
						</View>
					) : null}
				</View>
				{project.isArchived ? <Text style={styles.archived}>Archived</Text> : null}
			</View>
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: colors.cardWhite,
		borderRadius: 12,
		padding: 12,
		marginBottom: 12,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 8,
		elevation: 3,
		flexDirection: "row",
		alignItems: "center",
	},
	accent: {
		width: 6,
		// stretch full height of card
		alignSelf: "stretch",
		backgroundColor: colors.primaryBlue,
		borderRadius: 4,
		marginRight: 12,
	},
	content: {
		flex: 1,
		paddingVertical: 2,
		flexDirection: "row",
		alignItems: "center",
	},
	title: {
		fontSize: 16,
		fontWeight: "700",
		color: colors.textDark,
	},
	subtitle: {
		fontSize: 13,
		color: colors.mutedGray,
		marginTop: 6,
	},
	meta: {
		marginTop: 8,
		fontSize: 12,
		color: colors.mutedGray,
	},
	archived: {
		color: "#9CA3AF",
		marginLeft: 8,
	},
});


