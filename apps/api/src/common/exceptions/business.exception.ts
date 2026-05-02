import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Base class for all custom business exceptions.
 * Extends HttpException so NestJS handles it like any other HTTP exception,
 * but adds a machine-readable `code` property for the API response envelope.
 */
export abstract class BusinessException extends HttpException {
	constructor(
		httpStatus: HttpStatus,
		public readonly code: string,
		message: string,
		public readonly details: Record<string, unknown> = {},
	) {
		super({ code, message, details }, httpStatus);
	}
}

// ─── 400 Bad Request ──────────────────────────────────────────────────────────

export class BadRequestException extends BusinessException {
	constructor(
		code: string,
		message: string,
		details?: Record<string, unknown>,
	) {
		super(HttpStatus.BAD_REQUEST, code, message, details);
	}
}

// ─── 401 Unauthorized ────────────────────────────────────────────────────────

export class UnauthorizedException extends BusinessException {
	constructor(
		code = "UNAUTHORIZED",
		message = "Authentication required. Please log in to continue.",
	) {
		super(HttpStatus.UNAUTHORIZED, code, message);
	}
}

// ─── 403 Forbidden ───────────────────────────────────────────────────────────

export class ForbiddenException extends BusinessException {
	constructor(
		code = "FORBIDDEN",
		message = "You do not have permission to perform this action.",
	) {
		super(HttpStatus.FORBIDDEN, code, message);
	}
}

// ─── 404 Not Found ───────────────────────────────────────────────────────────

export class NotFoundException extends BusinessException {
	constructor(resource: string) {
		super(HttpStatus.NOT_FOUND, "NOT_FOUND", `${resource}`);
	}
}

// ─── 409 Conflict ────────────────────────────────────────────────────────────

export class ConflictException extends BusinessException {
	constructor(code: string, message: string) {
		super(HttpStatus.CONFLICT, code, message);
	}
}

// ─── 422 Unprocessable Entity ───────────────────────────────────────────────

export class UnprocessableEntityException extends BusinessException {
	constructor(code: string, message: string) {
		super(HttpStatus.UNPROCESSABLE_ENTITY, code, message);
	}
}

// ─── 500 Internal Server Error ──────────────────────────────────────────────

export class InternalServerErrorException extends BusinessException {
	constructor(
		message = "An unexpected error occurred. Please try again later.",
	) {
		super(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", message);
	}
}
