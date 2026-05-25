export type UserRole = "student" | "ta" | "instructor" | "admin";

export interface User {
	id: string;
	name: string;
	email: string;
	rollNumber?: string;
	role: UserRole;
	status: string;
}

export interface Course {
	id: string;
	code: string;
	title: string;
	term: string;
	ownerId: string;
	owner?: User;
	assignments?: Assignment[];
	createdAt: string;
}

export interface Assignment {
	id: string;
	courseId: string;
	title: string;
	demoWindowStart: string;
	demoWindowEnd: string;
	slotDurationMin: number;
	slotCapacity: number;
	freezeBeforeMin: number;
	maxCancellations: number;
	defaultVenue?: string;
	isPublished: boolean;
	createdAt: string;
}

export interface DemoSlot {
	id: string;
	assignmentId: string;
	taId: string;
	startsAt: string;
	endsAt: string;
	venue?: string;
	capacity: number;
	bookedCount: number;
	status: "draft" | "published" | "booked" | "completed" | "cancelled";
	version: number;
	ta?: User;
}

export type BookingStatus =
	| "booked"
	| "completed"
	| "no_show"
	| "cancelled_by_student"
	| "cancelled_by_ta";

export interface Booking {
	id: string;
	slotId: string;
	studentId: string;
	assignmentId: string;
	status: BookingStatus;
	bookedAt: string;
	cancelledAt?: string;
	cancelReason?: string;
	cancelNote?: string;
	slot?: DemoSlot;
	assignment?: Assignment;
	student?: User;
	evaluation?: Evaluation;
}

export interface Evaluation {
	id: string;
	bookingId: string;
	taId: string;
	rubricScores: Record<string, unknown>;
	totalScore?: number;
	privateNote?: string;
	submittedAt?: string;
	visibleToInstructor: boolean;
	createdAt: string;
}

export interface Notification {
	id: string;
	userId: string;
	type: string;
	title: string;
	body: string;
	data: Record<string, unknown>;
	readAt?: string;
	createdAt: string;
}
