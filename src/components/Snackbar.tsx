import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";

type Props = {
	message: string;
	actionLabel?: string;
	onAction?: () => void;
	onDismiss?: () => void;
	duration?: number;
};

export default function Snackbar({ message, actionLabel, onAction, onDismiss, duration = 5000 }: Props) {
	useEffect(() => {
		const t = setTimeout(() => {
			onDismiss?.();
		}, duration);
		return () => clearTimeout(t);
	}, []);

	return (
		<Animated.View style={styles.container}>
			<Text style={styles.message}>{message}</Text>
			{actionLabel ? (
				<TouchableOpacity onPress={onAction} style={styles.action}>
					<Text style={styles.actionText}>{actionLabel}</Text>
				</TouchableOpacity>
			) : null}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		bottom: 24,
		left: 16,
		right: 16,
		backgroundColor: "#111827",
		padding: 12,
		borderRadius: 8,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	message: {
		color: "white",
		flex: 1,
	},
	action: {
		marginLeft: 12,
	},
	actionText: {
		color: "#60A5FA",
		fontWeight: "700",
	},
});


