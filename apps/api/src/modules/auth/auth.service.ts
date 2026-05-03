import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { User } from "@repo/database";
import { Profile } from "passport-google-oauth20";
import { PrismaService } from "prisma/prisma.service";
import {
	BadRequestException,
	ForbiddenException,
	NotFoundException,
} from "@/common/exceptions/business.exception";
import { AllowlistService } from "./allowlist/allowlist.service";

@Injectable()
export class AuthService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly configService: ConfigService,
		private readonly allowlistService: AllowlistService,
	) {}

	async handleGoogleLogin(profile: Profile): Promise<User> {
		const email = profile.emails?.[0]?.value;
		if (!email) {
			throw new BadRequestException(
				"MISSING_EMAIL",
				"Google profile does not include an email.",
			);
		}

		const isAllowed = await this.allowlistService.isAllowed(email);
		if (!isAllowed) {
			throw new ForbiddenException(
				"ACCESS_DENIED_ALLLOWLIST",
				"Access denied. Your account is not on the allowlist.",
			);
		}

		const existing = await this.prisma.user.findFirst({
			where: {
				OR: [{ googleId: profile.id }, { email: email }],
			},
		});

		if (!existing) {
			return this.prisma.user.create({
				data: {
					name: profile.displayName || email,
					email: email,
					role: "student",
					status: "active",
					googleId: profile.id,
				},
			});
		}

		if (existing.status === "disabled") {
			throw new ForbiddenException(
				"USER_DISABLED",
				"User account is disabled.",
			);
		}

		return this.prisma.user.update({
			where: { id: existing.id },
			data: {
				googleId: profile.id ?? existing.googleId,
				name: profile.displayName || existing.name,
			},
		});
	}

	async getSessionUser(userId?: string): Promise<User> {
		if (!userId) {
			throw new BadRequestException(
				"MISSING_SESSION",
				"Session user is missing.",
			);
		}

		const user = await this.prisma.user.findUnique({ where: { id: userId } });
		if (!user) {
			throw new NotFoundException("User not found.");
		}
		return user;
	}

	getWebAppUrl(): string {
		return this.configService.getOrThrow<string>("webapp.authRedirectURL");
	}

	getSessionName(): string {
		return this.configService.get<string>("SESSION_NAME") ?? "slotty.sid";
	}
}
