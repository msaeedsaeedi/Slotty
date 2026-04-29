import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, Repository } from "typeorm";
import { Assignment } from "../../database/entities/assignment.entity.js";
import { DemoSlot } from "../../database/entities/demo-slot.entity.js";
import { User } from "../../database/entities/user.entity.js";
import { GenerateSlotsDto } from "./dto/generate-slots.dto.js";
import { ListSlotsQueryDto } from "./dto/list-slots-query.dto.js";
import { UpdateSlotDto } from "./dto/update-slot.dto.js";

@Injectable()
export class SlotsService {
	constructor(
		@InjectRepository(DemoSlot)
		private readonly slotsRepository: Repository<DemoSlot>,
		@InjectRepository(Assignment)
		private readonly assignmentsRepository: Repository<Assignment>,
		@InjectRepository(User)
		private readonly usersRepository: Repository<User>,
	) {}

	async generateSlots(assignmentId: string, dto: GenerateSlotsDto) {
		const assignment = await this.assignmentsRepository.findOne({
			where: { id: assignmentId },
		});
		if (!assignment) {
			throw new NotFoundException("Assignment not found.");
		}

		const ta = await this.usersRepository.findOne({ where: { id: dto.ta_id } });
		if (!ta) {
			throw new NotFoundException("TA user not found.");
		}
		if (ta.role !== "ta") {
			throw new BadRequestException("Slot owner must be a TA.");
		}

		if (assignment.demoWindowEnd <= assignment.demoWindowStart) {
			throw new BadRequestException("Demo window end must be after start.");
		}

		const durationMs = assignment.slotDurationMin * 60 * 1000;
		if (durationMs <= 0) {
			throw new BadRequestException("Slot duration must be greater than zero.");
		}

		const slots: DemoSlot[] = [];
		let cursor = new Date(assignment.demoWindowStart);
		const windowEnd = new Date(assignment.demoWindowEnd);

		while (cursor.getTime() + durationMs <= windowEnd.getTime()) {
			const endsAt = new Date(cursor.getTime() + durationMs);
			const slot = this.slotsRepository.create({
				assignmentId: assignment.id,
				taId: ta.id,
				startsAt: new Date(cursor),
				endsAt,
				venue: assignment.defaultVenue ?? null,
				capacity: assignment.capacity,
				status: "draft",
				version: 1,
			});
			slots.push(slot);
			cursor = endsAt;
		}

		if (slots.length === 0) {
			return { slots: [], count: 0 };
		}

		const saved = await this.slotsRepository.save(slots);
		return { slots: saved, count: saved.length };
	}

	async listSlots(assignmentId: string, query: ListSlotsQueryDto) {
		const assignment = await this.assignmentsRepository.findOne({
			where: { id: assignmentId },
		});
		if (!assignment) {
			throw new NotFoundException("Assignment not found.");
		}

		const where: Record<string, unknown> = { assignmentId };
		if (query.status) {
			where.status = query.status;
		}
		if (query.date) {
			const dayStart = new Date(`${query.date}T00:00:00Z`);
			const dayEnd = new Date(`${query.date}T23:59:59.999Z`);
			if (Number.isNaN(dayStart.getTime())) {
				throw new BadRequestException("Invalid date format. Use YYYY-MM-DD.");
			}
			where.startsAt = Between(dayStart, dayEnd);
		}

		const slots = await this.slotsRepository.find({
			where,
			order: { startsAt: "ASC" },
		});

		return { slots, meta: { total: slots.length } };
	}

	async updateSlot(slotId: string, dto: UpdateSlotDto) {
		if (dto.status === undefined && dto.venue === undefined) {
			throw new BadRequestException("Nothing to update.");
		}

		const slot = await this.slotsRepository.findOne({ where: { id: slotId } });
		if (!slot) {
			throw new NotFoundException("Slot not found.");
		}

		if (dto.status !== undefined) {
			slot.status = dto.status;
		}

		if (dto.venue !== undefined) {
			const nextVenue = dto.venue.trim();
			if (nextVenue.length === 0) {
				throw new BadRequestException("Venue cannot be empty.");
			}
			if (slot.venue !== nextVenue) {
				slot.venue = nextVenue;
				slot.version += 1;
			}
		}

		return { slot: await this.slotsRepository.save(slot) };
	}
}
