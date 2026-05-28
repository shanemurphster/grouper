import React from "react";
import { Pressable, Text, StyleSheet, ViewStyle, ActivityIndicator, Platform, type GestureResponderEvent, type NativeSyntheticEvent, type TargetedEvent } from "react-native";
import { colors } from "../theme/colors";

type Props = {
	variant?: "primary" | "secondary" | "ghost";
	title: string;
	onPress?: () => void;
	disabled?: boolean;
	style?: ViewStyle | ViewStyle[];
	accessibilityLabel?: string;
	loading?: boolean;
};

export default function AppButton({ variant = "primary", title, onPress, disabled, style, accessibilityLabel, loading }: Props) {
	const isPrimary = variant === "primary";
	const isSecondary = variant === "secondary";
	const isGhost = variant === "ghost";
	const isDisabled = Boolean(disabled || loading);

	const containerStyle = [
		styles.base,
		isPrimary && styles.primary,
		isSecondary && styles.secondary,
		isGhost && styles.ghost,
		isDisabled && styles.disabled,
		style,
	];

	const textStyle = [
		styles.text,
		isPrimary && styles.textPrimary,
		(isSecondary || isGhost) && styles.textSecondary,
		isDisabled && styles.textDisabled,
	];

	const label = accessibilityLabel ?? title;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled: isDisabled }}
			disabled={isDisabled}
			onPress={isDisabled ? undefined : onPress}
			onKeyPress={(e) => {
				if (Platform.OS !== "web" || isDisabled || !onPress) return;
				const key = (e as NativeSyntheticEvent<TargetedEvent>).nativeEvent?.key;
				if (key === "Enter" || key === " ") {
					if (typeof (e as { preventDefault?: () => void }).preventDefault === "function") {
						(e as { preventDefault: () => void }).preventDefault();
					}
					onPress(e as unknown as GestureResponderEvent);
				}
			}}
			style={({ pressed }) => [...containerStyle, pressed && !isDisabled ? { opacity: 0.85 } : null]}
			{...(Platform.OS === "web" ? { tabIndex: isDisabled ? -1 : 0 } : {})}
		>
			{loading ? <ActivityIndicator color={isPrimary ? colors.white : colors.pennBlue} /> : <Text style={textStyle}>{title}</Text>}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	base: {
		borderRadius: 14,
		paddingVertical: 10,
		paddingHorizontal: 16,
		alignItems: "center",
		justifyContent: "center",
		minHeight: 40,
	},
	primary: {
		backgroundColor: colors.pennBlue,
	},
	secondary: {
		backgroundColor: colors.white,
		borderWidth: 1,
		borderColor: colors.pennBlue,
	},
	ghost: {
		backgroundColor: "transparent",
	},
	text: {
		fontWeight: "700",
	},
	textPrimary: {
		color: colors.white,
	},
	textSecondary: {
		color: colors.pennBlue,
	},
	disabled: {
		opacity: 0.6,
	},
	textDisabled: {
		color: "#999",
	},
});
