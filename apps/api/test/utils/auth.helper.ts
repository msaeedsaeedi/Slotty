import { UserRole, UserStatus } from "@repo/database";
import { createMockUser } from "./factories";

export function createMockSession(userOverrides?: Partial<unknown>) {
	const user = createMockUser(userOverrides);
	return {
		user,
		userId: user.id,
		isAuthenticated: true,
	};
}

// biome-ignore lint/suspicious/noExplicitAny: <Session data can be flexible for testing purposes>
export function mockRequestWithSession(sessionData?: any) {
	return {
		session: sessionData || createMockSession(),
		user: sessionData?.user,
	};
}

export const ROLES = {
	STUDENT: UserRole.student,
	TA: UserRole.ta,
	INSTRUCTOR: UserRole.instructor,
	ADMIN: UserRole.admin,
} as const;

export const STATUSES = {
	ACTIVE: UserStatus.active,
	PENDING: UserStatus.pending_verification,
	DISABLED: UserStatus.disabled,
} as const;
