import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

type Props = {
	category: keyof typeof colors.category;
};

export default function CategoryChip({ category }: Props) {
	const bg = colors.category[category as any] ?? "#DDD";
	return (
		<View style={[styles.chip, { backgroundColor: bg + "22" }]}>
			<View style={[styles.dot, { backgroundColor: bg }]} />
			<Text style={styles.text}>{category}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	chip: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 6,
		paddingHorizontal: 10,
		borderRadius: 16,
	},
	dot: {
		width: 10,
		height: 10,
		borderRadius: 6,
		marginRight: 8,
	},
	text: {
		color: "#051826",
		fontWeight: "600",
		fontSize: 12,
	},
});


