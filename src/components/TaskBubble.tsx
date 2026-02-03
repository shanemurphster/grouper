import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

type Props = {
	title: string;
	done?: boolean;
	onPress?: () => void;
};

export default function TaskBubble({ title, done, onPress }: Props) {
	return (
		<TouchableOpacity onPress={onPress} style={[styles.bubble, done ? { backgroundColor: "#E6FFFB" } : {}]}>
			<Text style={[styles.text, done ? { textDecorationLine: "line-through", color: colors.muted } : {}]}>{title}</Text>
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	bubble: {
		paddingVertical: 8,
		paddingHorizontal: 12,
		backgroundColor: colors.blueLight,
		borderRadius: 20,
		marginRight: 8,
	},
	text: {
		fontWeight: "600",
		color: colors.pennBlue,
	},
});


