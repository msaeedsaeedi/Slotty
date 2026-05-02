import { Injectable } from "@nestjs/common";
import { User } from "@prisma/client";
import { PrismaService } from "prisma/prisma.service";
import { ConflictException } from "@/common/exceptions/business.exception";
import { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class UsersService {
	constructor(private readonly prisma: PrismaService) {}

	async createUser(dto: CreateUserDto): Promise<User> {
		const email = dto.email.toLowerCase().trim();

		const existing = await this.prisma.user.findUnique({ where: { email } });
		if (existing) {
			throw new ConflictException(
				"USER_ALREADY_EXISTS",
				"User with this email already exists.",
			);
		}

		return this.prisma.user.create({
			data: {
				name: dto.name.trim(),
				email,
				role: dto.role,
				status: dto.status ?? "active",
				rollNumber: dto.roll_number?.trim() || null,
			},
		});
	}

	async listUsers(email?: string): Promise<User[]> {
		if (!email) {
			return this.prisma.user.findMany({ orderBy: { createdAt: "desc" } });
		}

		const emailNormalized = email.toLowerCase().trim();
		return this.prisma.user.findMany({
			where: { email: { contains: emailNormalized } },
			orderBy: { createdAt: "desc" },
		});
	}

	async getUserById(userId: string): Promise<User> {
		const user = await this.prisma.user.findUnique({ where: { id: userId } });
		if (!user) {
			throw new ConflictException("USER_NOT_FOUND", "User not found.");
		}
		return user;
	}
}
