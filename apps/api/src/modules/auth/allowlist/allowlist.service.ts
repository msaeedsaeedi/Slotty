import { Injectable } from "@nestjs/common";
import { AllowedList } from "@prisma/client";
import { PrismaService } from "prisma/prisma.service";
import {
	ConflictException,
	NotFoundException,
} from "@/common/exceptions/business.exception";
import { isUniqueViolation } from "@/common/prisma.helpers";
import { attempt } from "@/utils/attempt.util";
import { CreateAllowlistEntryDto } from "./dto/create-allowlist-entry.dto";

@Injectable()
export class AllowlistService {
	constructor(private readonly prisma: PrismaService) {}

	async listEntries(): Promise<AllowedList[]> {
		return this.prisma.allowedList.findMany({
			orderBy: { createdAt: "desc" },
		});
	}

	async isAllowed(email: string): Promise<boolean> {
		const domain = email.split("@")[1];
		if (!domain) {
			return false;
		}

		const match = await this.prisma.allowedList.findFirst({
			where: {
				OR: [
					{ type: "email", value: email },
					{ type: "domain", value: domain },
				],
			},
		});

		return Boolean(match);
	}

	async addEntry(dto: CreateAllowlistEntryDto): Promise<AllowedList> {
		const [error, entry] = await attempt(
			this.prisma.allowedList.create({
				data: {
					type: dto.type,
					value: dto.value,
				},
			}),
		);

		if (error) {
			if (isUniqueViolation(error)) {
				throw new ConflictException(
					"ALLOWLIST_ENTRY_ALREADY_EXISTS",
					"Allowlist entry already exists.",
				);
			}
			throw error;
		}

		return entry;
	}

	async removeEntry(entryId: string): Promise<AllowedList> {
		const entry = await this.prisma.allowedList.findUnique({
			where: { id: entryId },
		});

		if (!entry) {
			throw new NotFoundException("Allowlist entry not found.");
		}

		await this.prisma.allowedList.delete({
			where: { id: entryId },
		});

		return entry;
	}
}
