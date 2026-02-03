import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";

type Props = {
	title: string;
	subtitle?: string;
	style?: any;
};

export default function GradientHeader({ title, subtitle, style }: Props) {
	return (
		<LinearGradient colors={[colors.pennBlue, colors.pennRed]} style={[styles.header, style]}>
			<Text style={[styles.title, { color: colors.white }]}>{title}</Text>
			{subtitle ? <Text style={[styles.subtitle, { color: "rgba(255,255,255,0.9)" }]}>{subtitle}</Text> : null}
		</LinearGradient>
	);
}

const styles = StyleSheet.create({
	header: {
		paddingVertical: 18,
		paddingHorizontal: 16,
		borderRadius: 16,
		marginBottom: 12,
	},
	title: {
		color: "white",
		fontSize: 20,
		fontWeight: "700",
	},
	subtitle: {
		color: "rgba(255,255,255,0.9)",
		fontSize: 13,
		marginTop: 4,
	},
});


