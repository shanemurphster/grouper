import React from "react";
import { TouchableOpacity, StyleSheet, Text, ViewStyle } from "react-native";
import { colors } from "../theme/colors";

type Props = {
	onPress: () => void;
	style?: ViewStyle;
};

export default function FloatingButton({ onPress, style }: Props) {
	return (
		<TouchableOpacity onPress={onPress} style={[styles.button, style]}>
			<Text style={styles.plus}>+</Text>
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	button: {
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: colors.pennBlue,
		justifyContent: "center",
		alignItems: "center",
		position: "absolute",
		bottom: 24,
		right: 16,
		elevation: 4,
	},
	plus: {
		color: colors.white,
		fontSize: 32,
		lineHeight: 32,
	},
});


