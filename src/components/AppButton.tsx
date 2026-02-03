import React from "react";
import { TouchableOpacity, Text, StyleSheet, ViewStyle, ActivityIndicator } from "react-native";
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

  const containerStyle = [
    styles.base,
    isPrimary && styles.primary,
    isSecondary && styles.secondary,
    isGhost && styles.ghost,
    disabled && styles.disabled,
    style,
  ];

  const textStyle = [
    styles.text,
    isPrimary && styles.textPrimary,
    (isSecondary || isGhost) && styles.textSecondary,
    disabled && styles.textDisabled,
  ];

  return (
    <TouchableOpacity accessibilityLabel={accessibilityLabel} onPress={onPress} disabled={disabled || loading} style={containerStyle} activeOpacity={0.8}>
      {loading ? <ActivityIndicator color={isPrimary ? colors.white : colors.pennBlue} /> : <Text style={textStyle}>{title}</Text>}
    </TouchableOpacity>
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

