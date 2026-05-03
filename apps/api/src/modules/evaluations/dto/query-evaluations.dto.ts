import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

export class QueryEvaluationsDto {
	/** Narrow results to a specific assignment within the course. */
	@ApiPropertyOptional({
		description: "Filter by assignment UUID",
		format: "uuid",
	})
	@IsOptional()
	@IsUUID()
	assignmentId?: string;
}
