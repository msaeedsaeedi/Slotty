import {
	Assignment,
	Booking,
	BookingStatus,
	Course,
	CourseRole,
	DemoSlot,
	Enrollment,
	SlotStatus,
	User,
	UserRole,
	UserStatus,
} from "@repo/database";

export function createMockUser(overrides?: Partial<User>): User {
	return {
		id: crypto.randomUUID(),
		email: `test${Date.now()}@example.com`,
		name: "Test User",
		role: UserRole.student as UserRole,
		status: UserStatus.active as UserStatus,
		googleId: null,
		rollNumber: null,
		deletedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

export function createMockCourse(overrides?: Partial<Course>): Course {
	return {
		id: crypto.randomUUID(),
		code: `CS${Date.now()}`,
		title: "Test Course",
		term: "Fall 2024",
		ownerId: crypto.randomUUID(),
		createdAt: new Date(),
		updatedAt: new Date(),
		deletedAt: null,
		...overrides,
	};
}

export function createMockSlot(overrides?: Partial<DemoSlot>): DemoSlot {
	return {
		id: crypto.randomUUID(),
		assignmentId: crypto.randomUUID(),
		taId: crypto.randomUUID(),
		startsAt: new Date(Date.now() + 86400000), // Tomorrow
		endsAt: new Date(Date.now() + 86400000 + 3600000), // +1 hour
		capacity: 1,
		status: SlotStatus.published as SlotStatus,
		createdAt: new Date(),
		updatedAt: new Date(),
		venue: "Online",
		version: 1,
		...overrides,
	};
}

export function createMockBooking(overrides?: Partial<Booking>): Booking {
	return {
		id: crypto.randomUUID(),
		slotId: crypto.randomUUID(),
		studentId: crypto.randomUUID(),
		assignmentId: crypto.randomUUID(),
		status: BookingStatus.booked as BookingStatus,
		bookedAt: new Date(),
		cancelledAt: null,
		cancelReason: null,
		cancelNote: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

export function createMockAssignment(
	overrides?: Partial<Assignment>,
): Assignment {
	return {
		id: crypto.randomUUID(),
		title: "Test Assignment",
		courseId: crypto.randomUUID(),
		demoWindowStart: new Date(Date.now() + 86400000), // Tomorrow
		slotDurationMin: 60,
		demoWindowEnd: new Date(Date.now() + 172800000), // 2 days from now
		freezeBeforeMin: 60,
		maxCancellations: 2,
		slotCapacity: 1,
		defaultVenue: "Online",
		isPublished: true,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

export function createMockEnrollment(
	overrides?: Partial<Enrollment>,
): Enrollment {
	return {
		id: crypto.randomUUID(),
		userId: crypto.randomUUID(),
		courseId: crypto.randomUUID(),
		roleInCourse: CourseRole.student as CourseRole,
		createdAt: new Date(),
		...overrides,
	};
}
