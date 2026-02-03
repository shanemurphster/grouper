import { Category, TaskSize, TimeframeType } from "../models/types";
import { colors } from "../theme/colors";

type Input = { title: string; details?: string; timeframe?: TimeframeType | string };
type Output = { category: Category; size: TaskSize; dueDate?: string | undefined };

function pickCategory(title: string): Category {
	const t = title.toLowerCase();
	if (t.includes("slide") || t.includes("presentation")) return "Slides";
	if (t.includes("code") || t.includes("implement") || t.includes("test")) return "Code";
	if (t.includes("research") || t.includes("sources") || t.includes("collect")) return "Research";
	if (t.includes("write") || t.includes("draft") || t.includes("edit")) return "Writing";
	if (t.includes("meet") || t.includes("schedule") || t.includes("coord")) return "Coordination";
	return pickRandom(["Research", "Writing", "Slides", "Code", "Coordination", "Admin"]);
}

function pickSize(title: string): TaskSize {
	const t = title.toLowerCase();
	if (t.includes("review") || t.includes("edit") || t.includes("short") || t.includes("quick")) return "S";
	if (t.includes("implement") || t.includes("write") || t.includes("collect")) return "M";
	return Math.random() < 0.7 ? "S" : "M";
}

function pickRandom<T>(arr: T[]) {
	return arr[Math.floor(Math.random() * arr.length)];
}

export function autoFillTask(input: Input): Output {
	const category = pickCategory(input.title + " " + (input.details ?? ""));
	const size = pickSize(input.title + " " + (input.details ?? ""));
	let dueDate: string | undefined = undefined;
	if (input.timeframe === "twoDay") {
		const d = new Date();
		d.setDate(d.getDate() + 2);
		dueDate = d.toISOString();
	} else if (input.timeframe === "oneWeek") {
		const d = new Date();
		d.setDate(d.getDate() + 7);
		dueDate = d.toISOString();
	}
	return { category, size, dueDate };
}


