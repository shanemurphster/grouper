export type TimeframeType = "twoDay" | "oneWeek" | "long";

export type Category = "Research" | "Writing" | "Slides" | "Code" | "Coordination" | "Admin";

export type TaskStatus = "todo" | "doing" | "done";

export type TaskSize = "S" | "M" | "L";

export type RequestType = "takeTask" | "review" | "unblock";

export type RequestStatus = "pending" | "accepted" | "declined";

export type Member = {
	id: string;
	displayName: string;
	contact?: {
		phone?: string;
		email?: string;
		other?: string;
	};
};

export type Task = {
	id: string;
	title: string;
	details?: string;
	category: Category;
	status: TaskStatus;
	size: TaskSize;
	bundleId?: string | null;
	updatedAt?: string;
	blocked?: boolean;
	blockedReason?: string;
	url?: string;
	dueDate?: string;
	ownerMemberId?: string;
	createdAt: string;
};

export type TaskBundle = {
	id: string;
	projectId: string;
	title: string;
	summary?: string | null;
	totalPoints?: number | null;
	claimedByMemberId?: string | null;
	createdAt?: string;
	updatedAt?: string;
};

export type Deliverable = {
	id: string;
	title: string;
	url?: string;
};

export type Request = {
	id: string;
	fromMemberId: string;
	toMemberId: string;
	taskId?: string;
	type: RequestType;
	message?: string;
	status: RequestStatus;
	createdAt: string;
};

export type Project = {
	id: string;
	name: string;
	timeframe: TimeframeType;
	// optional assignment metadata
	assignmentTitle?: string;
	assignmentDetails?: string;
	isArchived?: boolean;
	lastOpenedAt?: string;
	joinCode?: string;
	members: Member[];
	tasks: Task[];
	deliverables: Deliverable[];
	requests: Request[];
	createdAt: string;
	groupSize?: number;
};


