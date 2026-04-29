import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../../database/entities/user.entity.js";
import { CreateUserDto } from "./dto/create-user.dto.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class UsersService {
	constructor(
		@InjectRepository(User)
		private readonly usersRepository: Repository<User>,
	) {}

	async createUser(dto: CreateUserDto): Promise<User> {
		const email = this.normalizeEmail(dto.email);

		const existing = await this.usersRepository.findOne({ where: { email } });
		if (existing) {
			throw new ConflictException("User with this email already exists.");
		}

		const user = this.usersRepository.create({
			name: dto.name.trim(),
			email,
			role: dto.role,
			status: dto.status ?? "active",
			rollNumber: dto.roll_number?.trim() || null,
		});

		return this.usersRepository.save(user);
	}

	async listUsers(email?: string): Promise<User[]> {
		if (!email) {
			return this.usersRepository.find({ order: { createdAt: "DESC" } });
		}

		const normalized = this.normalizeEmail(email);
		return this.usersRepository.find({
			where: { email: normalized },
			order: { createdAt: "DESC" },
		});
	}

	async getUserById(userId: string): Promise<User> {
		const user = await this.usersRepository.findOne({ where: { id: userId } });
		if (!user) {
			throw new NotFoundException("User not found.");
		}
		return user;
	}

	async getUserByEmail(email: string): Promise<User | null> {
		return this.usersRepository.findOne({ where: { email: this.normalizeEmail(email) } });
	}

	async ensureUserRole(email: string, role: User["role"]): Promise<User> {
		const normalized = this.normalizeEmail(email);
		const existing = await this.usersRepository.findOne({ where: { email: normalized } });
		if (!existing) {
			const user = this.usersRepository.create({
				name: normalized,
				email: normalized,
				role,
				status: "active",
			});
			return this.usersRepository.save(user);
		}

		if (existing.role !== role) {
			throw new BadRequestException(
				`User role mismatch. Expected ${role}, found ${existing.role}.`,
			);
		}

		return existing;
	}

	normalizeEmail(email: string): string {
		const normalized = email.trim().toLowerCase();
		if (!emailRegex.test(normalized)) {
			throw new BadRequestException("Invalid email address.");
		}
		return normalized;
	}
}
