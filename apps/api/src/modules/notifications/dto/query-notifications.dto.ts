import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
	IsBoolean,
	IsInt,
	IsOptional,
	IsUUID,
	Max,
	Min,
} from "class-validator";

export class QueryNotificationsDto {
	/**
	 * When `true`, only return unread notifications.
	 * Accepts the query-string literals "true" and "false".
	 */
	@ApiPropertyOptional({
		description: "Filter to unread notifications only",
		type: Boolean,
	})
	@IsOptional()
	@Transform(({ value }) => {
		if (value === "true") return true;
		if (value === "false") return false;
		return value;
	})
	@IsBoolean()
	unread?: boolean;

	/**
	 * Cursor for pagination — the `id` of the last item from the previous page.
	 */
	@ApiPropertyOptional({
		description: "Pagination cursor (last item ID from previous page)",
		format: "uuid",
	})
	@IsOptional()
	@IsUUID()
	cursor?: string;

	/**
	 * Number of notifications to return per page. Capped at 100.
	 */
	@ApiPropertyOptional({
		description: "Number of items per page (1-100)",
		minimum: 1,
		maximum: 100,
		default: 20,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit?: number = 20;
}
