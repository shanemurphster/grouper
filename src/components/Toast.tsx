import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

export default function Toast({ message, type = "info" }: { message: string; type?: "info" | "error" | "success" }) {
	return (
		<View style={[styles.wrap, type === "error" ? styles.error : type === "success" ? styles.success : styles.info]}>
			<Text style={styles.text}>{message}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		position: "absolute",
		bottom: 28,
		left: 16,
		right: 16,
		padding: 12,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 1000,
	},
	text: { color: colors.white },
	info: { backgroundColor: colors.pennBlue },
	success: { backgroundColor: "#10B981" },
	error: { backgroundColor: colors.pennRed },
});

