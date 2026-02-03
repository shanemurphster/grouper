import { Category, Deliverable, Task, TaskSize, TaskStatus } from "../models/types";

const SAMPLE_TITLES: Record<Category, string[]> = {
	Research: [
		"Find 3 primary sources",
		"Summarize related work",
		"Collect data set samples",
	],
	Writing: [
		"Draft introduction paragraph",
		"Write methods section",
		"Edit conclusion",
	],
	Slides: [
		"Create title slide",
		"Make results slide",
		"Design conclusion slide",
	],
	Code: [
		"Set up project scaffold",
		"Implement core function",
		"Write unit tests",
	],
	Coordination: [
		"Schedule meeting",
		"Collect availability",
		"Send reminder",
	],
	Admin: [
		"Create repo",
		"Verify citations",
		"Prepare submission",
	],
};

function pickRandom<T>(arr: T[]) {
	return arr[Math.floor(Math.random() * arr.length)];
}

function randomSize(): TaskSize {
	const r = Math.random();
	if (r < 0.6) return "S";
	if (r < 0.9) return "M";
	return "L";
}

function generateId() {
	return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function generatePlanFromText(prompt: string) {
	// deterministic-ish seed not required here; simple generator
	const deliverables: Deliverable[] = [];
	const tasks: Task[] = [];

	const numDeliverables = 2 + Math.floor(Math.random() * 3); // 2-4
	for (let i = 0; i < numDeliverables; i++) {
		deliverables.push({
			id: generateId(),
			title: `${pickRandom(["Draft", "Final", "Report", "Slides"])}: ${prompt
				.split("\n")[0]
				.slice(0, 40)}${i > 0 ? ` (${i + 1})` : ""}`,
			url: undefined,
		});
	}

	const numTasks = 25 + Math.floor(Math.random() * 26); // 25-50
	const categories = Object.keys(SAMPLE_TITLES) as Category[];
	for (let i = 0; i < numTasks; i++) {
		const category = pickRandom(categories);
		const titleSource = pickRandom(SAMPLE_TITLES[category]);
		const title = `${titleSource} (${Math.floor(Math.random() * 30) + 5} min)`;
		tasks.push({
			id: generateId(),
			title,
			details: `Auto-generated task from prompt: ${prompt.slice(0, 160)}`,
			category,
			status: "todo" as TaskStatus,
			size: randomSize(),
			createdAt: new Date().toISOString(),
		});
	}

	return { deliverables, tasks };
}


