import { TimeframeType } from "../models/types";

export const TIMEFRAME_LABELS: Record<TimeframeType, string> = {
	twoDay: "Two Days",
	oneWeek: "One Week",
	long: "Long Term",
};

export function formatTimeframe(timeframe?: string | null): string {
	if (!timeframe) return "";
	return TIMEFRAME_LABELS[timeframe as TimeframeType] ?? timeframe;
}
