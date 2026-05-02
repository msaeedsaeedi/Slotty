import { IsOptional, IsUUID } from "class-validator";

export class QueryEvaluationsDto {
	/** Narrow results to a specific assignment within the course. */
	@IsOptional()
	@IsUUID()
	assignmentId?: string;
}
