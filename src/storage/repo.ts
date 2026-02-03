import AsyncStorage from "@react-native-async-storage/async-storage";
import { Project } from "../models/types";

const PROJECTS_KEY = "gpai_projects_v1";

export async function loadProjects(): Promise<Project[]> {
	const raw = await AsyncStorage.getItem(PROJECTS_KEY);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as Project[];
		// migrate/normalize older projects to include new fields
		const migrated = parsed.map((p) => migrateProject(p));
		// sort by lastOpenedAt desc then createdAt
		migrated.sort((a, b) => {
			const aTime = a.lastOpenedAt ?? a.createdAt;
			const bTime = b.lastOpenedAt ?? b.createdAt;
			return new Date(bTime).getTime() - new Date(aTime).getTime();
		});
		return migrated;
	} catch (e) {
		console.warn("Failed to parse projects from storage", e);
		return [];
	}
}

export async function saveProjects(projects: Project[]): Promise<void> {
	await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export async function upsertProject(project: Project): Promise<void> {
	const projects = await loadProjects();
	const idx = projects.findIndex((p) => p.id === project.id);
	if (idx === -1) {
		projects.push(project);
	} else {
		projects[idx] = project;
	}
	await saveProjects(projects);
}

export async function getProject(id: string): Promise<Project | null> {
	const projects = await loadProjects();
	const found = projects.find((p) => p.id === id) ?? null;
	return found;
}

function migrateProject(p: any): Project {
	// shallow clone
	const project: any = { ...p };
	project.isArchived = project.isArchived ?? false;
	project.lastOpenedAt = project.lastOpenedAt ?? project.lastOpenedAt;
	// assignment fields (new in vX)
	project.assignmentTitle = project.assignmentTitle ?? undefined;
	project.assignmentDetails = project.assignmentDetails ?? undefined;
	project.tasks = (project.tasks ?? []).map((t: any) => {
		const task = { ...t };
		task.blocked = task.blocked ?? false;
		task.blockedReason = task.blockedReason ?? undefined;
		task.updatedAt = task.updatedAt ?? task.createdAt ?? new Date().toISOString();
		task.url = task.url ?? undefined;
		return task;
	});
	project.requests = project.requests ?? [];
	project.deliverables = project.deliverables ?? [];
	project.members = project.members ?? [];
	return project as Project;
}


