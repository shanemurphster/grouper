import { StyleSheet } from "react-native";
import { colors } from "./colors";

export const themeStyles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: colors.backgroundWhite,
		padding: 12,
	},
	card: {
		backgroundColor: colors.cardWhite,
		borderRadius: 16,
		padding: 12,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 8,
		elevation: 3,
	},
	title: {
		fontSize: 20,
		fontWeight: "700",
		color: colors.textDark,
	},
	subtitle: {
		fontSize: 14,
		color: colors.mutedGray,
	},
});


