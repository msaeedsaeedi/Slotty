import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Assignment } from "../../database/entities/assignment.entity.js";
import { Course } from "../../database/entities/course.entity.js";
import { CreateAssignmentDto } from "./dto/create-assignment.dto.js";
import { UpdateAssignmentDto } from "./dto/update-assignment.dto.js";

@Injectable()
export class AssignmentsService {
	constructor(
		@InjectRepository(Assignment)
		private readonly assignmentsRepository: Repository<Assignment>,
		@InjectRepository(Course)
		private readonly coursesRepository: Repository<Course>,
	) {}

	async createAssignment(courseId: string, dto: CreateAssignmentDto): Promise<Assignment> {
		const course = await this.coursesRepository.findOne({ where: { id: courseId } });
		if (!course) {
			throw new NotFoundException("Course not found.");
		}

		if (dto.demo_window_end <= dto.demo_window_start) {
			throw new BadRequestException("Demo window end must be after start.");
		}

		const assignment = this.assignmentsRepository.create({
			courseId: course.id,
			title: dto.title.trim(),
			demoWindowStart: dto.demo_window_start,
			demoWindowEnd: dto.demo_window_end,
			slotDurationMin: dto.slot_duration_min,
			capacity: dto.capacity,
			freezeBeforeMin: dto.freeze_before_min,
			maxCancellations: dto.max_cancellations,
			defaultVenue: dto.default_venue?.trim() || null,
			isPublished: dto.is_published ?? false,
		});

		return this.assignmentsRepository.save(assignment);
	}

	async listAssignments(courseId: string): Promise<Assignment[]> {
		const course = await this.coursesRepository.findOne({ where: { id: courseId } });
		if (!course) {
			throw new NotFoundException("Course not found.");
		}

		return this.assignmentsRepository.find({
			where: { courseId },
			order: { demoWindowStart: "ASC" },
		});
	}

	async getAssignment(assignmentId: string): Promise<Assignment> {
		const assignment = await this.assignmentsRepository.findOne({
			where: { id: assignmentId },
		});
		if (!assignment) {
			throw new NotFoundException("Assignment not found.");
		}
		return assignment;
	}

	async updateAssignment(
		assignmentId: string,
		dto: UpdateAssignmentDto,
	): Promise<Assignment> {
		const assignment = await this.getAssignment(assignmentId);

		if (dto.title !== undefined) {
			assignment.title = dto.title.trim();
		}
		if (dto.demo_window_start !== undefined) {
			assignment.demoWindowStart = dto.demo_window_start;
		}
		if (dto.demo_window_end !== undefined) {
			assignment.demoWindowEnd = dto.demo_window_end;
		}
		if (dto.slot_duration_min !== undefined) {
			assignment.slotDurationMin = dto.slot_duration_min;
		}
		if (dto.capacity !== undefined) {
			assignment.capacity = dto.capacity;
		}
		if (dto.freeze_before_min !== undefined) {
			assignment.freezeBeforeMin = dto.freeze_before_min;
		}
		if (dto.max_cancellations !== undefined) {
			assignment.maxCancellations = dto.max_cancellations;
		}
		if (dto.default_venue !== undefined) {
			assignment.defaultVenue = dto.default_venue?.trim() || null;
		}
		if (dto.is_published !== undefined) {
			assignment.isPublished = dto.is_published;
		}

		if (assignment.demoWindowEnd <= assignment.demoWindowStart) {
			throw new BadRequestException("Demo window end must be after start.");
		}

		return this.assignmentsRepository.save(assignment);
	}
}
