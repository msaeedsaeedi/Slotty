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
	@IsOptional()
	@IsUUID()
	cursor?: string;

	/**
	 * Number of notifications to return per page. Capped at 100.
	 */
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit?: number = 20;
}
