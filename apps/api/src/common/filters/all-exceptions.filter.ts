import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
	HttpStatus,
	Logger,
} from "@nestjs/common";
import { Request } from "express";
import { v4 as uuid } from "uuid";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
	private readonly logger = new Logger(AllExceptionsFilter.name);

	catch(exception: unknown, host: ArgumentsHost): void {
		const ctx = host.switchToHttp();
		const response = ctx.getResponse();
		const request = ctx.getRequest<Request>();

		const requestId = uuid();
		const timestamp = new Date().toISOString();

		let status: number;
		let errorCode: string;
		let message: string;
		let details: Record<string, unknown> = {};

		if (exception instanceof HttpException) {
			status = exception.getStatus();
			const exceptionResponse = exception.getResponse();

			if (typeof exceptionResponse === "string") {
				message = exceptionResponse;
				errorCode = this.getErrorCodeFromStatus(status);
			} else {
				const responseObj = exceptionResponse as Record<string, unknown>;
				message = (responseObj.message as string) || exception.message;
				errorCode =
					(responseObj.code as string) || this.getErrorCodeFromStatus(status);
				details = (responseObj.details as Record<string, unknown>) || {};
			}
		} else {
			status = HttpStatus.INTERNAL_SERVER_ERROR;
			errorCode = "INTERNAL_SERVER_ERROR";
			message = "An unexpected error occurred. Please try again later.";
			this.logger.error(
				`Unexpected error: ${exception}`,
				exception instanceof Error ? exception.stack : undefined,
				{ requestId, path: request.url },
			);
		}

		const errorResponse = {
			error: {
				code: errorCode,
				message,
				details,
			},
			requestId,
			timestamp,
		};

		response.status(status).json(errorResponse);
	}

	private getErrorCodeFromStatus(status: number): string {
		switch (status) {
			case HttpStatus.BAD_REQUEST:
				return "BAD_REQUEST";
			case HttpStatus.UNAUTHORIZED:
				return "UNAUTHORIZED";
			case HttpStatus.FORBIDDEN:
				return "FORBIDDEN";
			case HttpStatus.NOT_FOUND:
				return "NOT_FOUND";
			case HttpStatus.CONFLICT:
				return "CONFLICT";
			case HttpStatus.UNPROCESSABLE_ENTITY:
				return "UNPROCESSABLE_ENTITY";
			case HttpStatus.TOO_MANY_REQUESTS:
				return "RATE_LIMIT_EXCEEDED";
			case HttpStatus.SERVICE_UNAVAILABLE:
				return "SERVICE_UNAVAILABLE";
			default:
				return "INTERNAL_SERVER_ERROR";
		}
	}
}
