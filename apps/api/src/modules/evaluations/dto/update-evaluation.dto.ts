import { OmitType, PartialType } from "@nestjs/mapped-types";
import { CreateEvaluationDto } from "./create-evaluation.dto";

/**
 * All CreateEvaluationDto fields become optional; bookingId is excluded
 * because a submitted evaluation's booking link is immutable.
 */
export class UpdateEvaluationDto extends PartialType(
	OmitType(CreateEvaluationDto, ["bookingId"] as const),
) {}
