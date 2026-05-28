import React from "react";
import {
	Pressable,
	Platform,
	type PressableProps,
	type GestureResponderEvent,
	type NativeSyntheticEvent,
	type TargetedEvent,
} from "react-native";

type Props = PressableProps & {
	accessibilityLabel: string;
	disabled?: boolean;
};

function activateFromKey(
	e: NativeSyntheticEvent<TargetedEvent>,
	onPress: PressableProps["onPress"],
	disabled?: boolean
) {
	if (disabled || !onPress) return;
	const key = e.nativeEvent?.key;
	if (key !== "Enter" && key !== " ") return;
	if (typeof (e as { preventDefault?: () => void }).preventDefault === "function") {
		(e as { preventDefault: () => void }).preventDefault();
	}
	onPress(e as unknown as GestureResponderEvent);
}

export default function AccessiblePressable({
	accessibilityLabel,
	disabled,
	onPress,
	onKeyPress,
	children,
	style,
	...rest
}: Props) {
	const isDisabled = Boolean(disabled);

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			accessibilityState={{ disabled: isDisabled }}
			disabled={isDisabled}
			onPress={isDisabled ? undefined : onPress}
			onKeyPress={(e) => {
				onKeyPress?.(e);
				if (Platform.OS === "web") activateFromKey(e, onPress, isDisabled);
			}}
			style={style}
			{...(Platform.OS === "web" ? { tabIndex: isDisabled ? -1 : 0 } : {})}
			{...rest}
		>
			{children}
		</Pressable>
	);
}
