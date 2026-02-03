import React from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../theme/colors";

export default function AppHeader({ right }: { right?: React.ReactNode }) {
	const router = useRouter();

	return (
		<View style={styles.header}>
			<Pressable style={styles.left} onPress={() => router.push("/(tabs)/home")}>
				<Image source={require("../../assets/branding/grouper-logo.png")} style={styles.logoImage} />
				<Text style={styles.title}>Grouper</Text>
			</Pressable>
			<View style={styles.right}>{right ?? null}</View>
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		height: 64,
		backgroundColor: colors.white,
		borderBottomColor: "#E5E7EB",
		borderBottomWidth: 1,
		paddingHorizontal: 12,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	left: {
		flexDirection: "row",
		alignItems: "center",
	},
	logoWrap: {
		width: 44,
		height: 44,
		marginRight: 10,
		justifyContent: "center",
		alignItems: "center",
	},
	logoCircle: {
		position: "absolute",
		width: 28,
		height: 28,
		borderRadius: 8,
	},
	logoAccentBlue: {
		position: "absolute",
		left: 6,
		width: 18,
		height: 6,
		borderRadius: 6,
		backgroundColor: colors.pennBlue,
		transform: [{ rotate: "12deg" }],
	},
	logoAccentRed: {
		position: "absolute",
		bottom: 6,
		right: 6,
		width: 18,
		height: 6,
		borderRadius: 6,
		backgroundColor: colors.pennRed,
		transform: [{ rotate: "-8deg" }],
	},
	title: {
		fontSize: 18,
		fontWeight: "700",
		color: colors.textDark,
	},
	right: {
		flexDirection: "row",
		alignItems: "center",
	},
	logoImage: {
		width: 44,
		height: 44,
		borderRadius: 12,
		backgroundColor: colors.white,
		marginRight: 10,
	},
});

