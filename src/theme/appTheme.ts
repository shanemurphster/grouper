import { colors } from "./colors";
import { useTheme } from "../state/themeStore";

/** Semantic UI tokens — light and dark surfaces aligned with Home/Profile. */
export type AppTheme = {
	darkMode: boolean;
	bg: string;
	card: string;
	text: string;
	muted: string;
	border: string;
	surface: string;
	surfaceAlt: string;
	inputBg: string;
	shadow: string;
	overlay: string;
	memberPill: string;
	memberPillText: string;
	mePillBg: string;
	mePillBorder: string;
	plannedPillBg: string;
	plannedPillText: string;
	chipBg: string;
	joinCodePillBg: string;
	joinCodeText: string;
	progressTrack: string;
	progressDone: string;
	badgeBlueBg: string;
	badgeBlueText: string;
	warnBg: string;
	warnText: string;
	planPendingBg: string;
	planPendingText: string;
	planFailedBg: string;
	planFailedText: string;
	fileTypeBadgeBg: string;
	pennBlue: string;
	pennRed: string;
	white: string;
};

const lightTheme: Omit<AppTheme, "darkMode"> = {
	bg: colors.lightBackground,
	card: colors.white,
	text: colors.textPrimary,
	muted: colors.textMuted,
	border: "#E5E7EB",
	surface: "#F9FAFB",
	surfaceAlt: "#F8FAFC",
	inputBg: colors.white,
	shadow: colors.shadow,
	overlay: "rgba(15, 23, 42, 0.55)",
	memberPill: "#F3F4F6",
	memberPillText: colors.textPrimary,
	mePillBg: colors.blueLight,
	mePillBorder: colors.pennBlue,
	plannedPillBg: colors.blueLight,
	plannedPillText: "#4338CA",
	chipBg: "#f1f1f1",
	joinCodePillBg: "#F3F4F6",
	joinCodeText: colors.textPrimary,
	progressTrack: "#E5E7EB",
	progressDone: "#16A34A",
	badgeBlueBg: colors.blueLight,
	badgeBlueText: colors.pennBlue,
	warnBg: "#FEF3C7",
	warnText: "#92400E",
	planPendingBg: "#FEF9C3",
	planPendingText: "#854D0E",
	planFailedBg: "#FEE2E2",
	planFailedText: "#991B1B",
	fileTypeBadgeBg: colors.blueLight,
	pennBlue: colors.pennBlue,
	pennRed: colors.pennRed,
	white: colors.white,
};

const darkTheme: Omit<AppTheme, "darkMode"> = {
	bg: "#0F172A",
	card: "#1E293B",
	text: "#F1F5F9",
	muted: "#94A3B8",
	border: "#334155",
	surface: "#0F172A",
	surfaceAlt: "#1E293B",
	inputBg: "#1E293B",
	shadow: colors.shadow,
	overlay: "rgba(15, 23, 42, 0.72)",
	memberPill: "#334155",
	memberPillText: "#F1F5F9",
	mePillBg: "#1E3A5F",
	mePillBorder: colors.pennBlue,
	plannedPillBg: "#312E81",
	plannedPillText: "#A5B4FC",
	chipBg: "#334155",
	joinCodePillBg: "#334155",
	joinCodeText: "#F1F5F9",
	progressTrack: "#334155",
	progressDone: "#4ADE80",
	badgeBlueBg: "#1E3A5F",
	badgeBlueText: "#93C5FD",
	warnBg: "#422006",
	warnText: "#FCD34D",
	planPendingBg: "#422006",
	planPendingText: "#FCD34D",
	planFailedBg: "#450A0A",
	planFailedText: "#FCA5A5",
	fileTypeBadgeBg: "#1E3A5F",
	pennBlue: colors.pennBlue,
	pennRed: colors.pennRed,
	white: colors.white,
};

export function getAppTheme(darkMode: boolean): AppTheme {
	return { darkMode, ...(darkMode ? darkTheme : lightTheme) };
}

export function useAppTheme(): AppTheme {
	const { darkMode } = useTheme();
	return getAppTheme(darkMode);
}

export type BundlePalette = {
	bg: string;
	header: string;
	accent: string;
	summary: string;
	empty: string;
};

const BUNDLE_PALETTES_LIGHT: BundlePalette[] = [
	{ bg: "#EFF6FF", header: "#BFDBFE", accent: colors.pennBlue, summary: "#374151", empty: colors.textMuted },
	{ bg: "#F0FDF4", header: "#BBF7D0", accent: "#16A34A", summary: "#374151", empty: colors.textMuted },
	{ bg: "#FFF7ED", header: "#FED7AA", accent: "#EA580C", summary: "#374151", empty: colors.textMuted },
	{ bg: "#FDF4FF", header: "#E9D5FF", accent: "#9333EA", summary: "#374151", empty: colors.textMuted },
	{ bg: "#FEF2F2", header: "#FECACA", accent: colors.pennRed, summary: "#374151", empty: colors.textMuted },
	{ bg: "#ECFEFF", header: "#A5F3FC", accent: "#0891B2", summary: "#374151", empty: colors.textMuted },
	{ bg: "#FEFCE8", header: "#FEF08A", accent: "#CA8A04", summary: "#374151", empty: colors.textMuted },
];

const BUNDLE_PALETTES_DARK: BundlePalette[] = [
	{ bg: "#1E3A5F", header: "#1E4976", accent: "#60A5FA", summary: "#CBD5E1", empty: "#94A3B8" },
	{ bg: "#14532D", header: "#166534", accent: "#4ADE80", summary: "#CBD5E1", empty: "#94A3B8" },
	{ bg: "#431407", header: "#7C2D12", accent: "#FB923C", summary: "#CBD5E1", empty: "#94A3B8" },
	{ bg: "#3B0764", header: "#581C87", accent: "#C084FC", summary: "#CBD5E1", empty: "#94A3B8" },
	{ bg: "#450A0A", header: "#7F1D1D", accent: "#F87171", summary: "#CBD5E1", empty: "#94A3B8" },
	{ bg: "#164E63", header: "#155E75", accent: "#22D3EE", summary: "#CBD5E1", empty: "#94A3B8" },
	{ bg: "#422006", header: "#713F12", accent: "#FACC15", summary: "#CBD5E1", empty: "#94A3B8" },
];

export function getBundlePalette(index: number, darkMode: boolean): BundlePalette {
	const palettes = darkMode ? BUNDLE_PALETTES_DARK : BUNDLE_PALETTES_LIGHT;
	return palettes[index % palettes.length];
}

export type StatusBadge = { bg: string; text: string; label: string };

const PLAN_STATUS_LIGHT: Record<string, StatusBadge> = {
	ready: { bg: "#D1FAE5", text: "#065F46", label: "Plan ready" },
	pending: { bg: "#FEF9C3", text: "#854D0E", label: "Generating…" },
	failed: { bg: "#FEE2E2", text: "#991B1B", label: "Plan failed" },
};

const PLAN_STATUS_DARK: Record<string, StatusBadge> = {
	ready: { bg: "#064E3B", text: "#6EE7B7", label: "Plan ready" },
	pending: { bg: "#422006", text: "#FCD34D", label: "Generating…" },
	failed: { bg: "#450A0A", text: "#FCA5A5", label: "Plan failed" },
};

const TASK_STATUS_LIGHT: Record<string, StatusBadge> = {
	todo: { bg: "#F3F4F6", text: "#374151", label: "To Do" },
	doing: { bg: "#EFF6FF", text: "#1D4ED8", label: "In Progress" },
	done: { bg: "#D1FAE5", text: "#065F46", label: "Done" },
};

const TASK_STATUS_DARK: Record<string, StatusBadge> = {
	todo: { bg: "#334155", text: "#E2E8F0", label: "To Do" },
	doing: { bg: "#1E3A5F", text: "#93C5FD", label: "In Progress" },
	done: { bg: "#064E3B", text: "#6EE7B7", label: "Done" },
};

export function getPlanStatusBadge(status: string, darkMode: boolean): StatusBadge | null {
	const map = darkMode ? PLAN_STATUS_DARK : PLAN_STATUS_LIGHT;
	return map[status] ?? null;
}

export function getTaskStatusBadge(status: string, darkMode: boolean): StatusBadge | null {
	const map = darkMode ? TASK_STATUS_DARK : TASK_STATUS_LIGHT;
	return map[status] ?? map.todo;
}
