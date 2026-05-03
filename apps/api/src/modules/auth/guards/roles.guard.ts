import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import { UsersService } from "@/modules/users/users.service";
import { ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly usersService: UsersService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
			ROLES_KEY,
			[context.getHandler(), context.getClass()],
		);

		if (!requiredRoles || requiredRoles.length === 0) {
			return true;
		}

		const request = context.switchToHttp().getRequest<Request>();
		const session = request.session as { userId?: string } | undefined;
		if (!session?.userId) {
			throw new UnauthorizedException();
		}

		const user = await this.usersService.getUserById(session.userId);
		if (user.status === "disabled") {
			throw new ForbiddenException("User account is disabled.");
		}

		(request as { user?: unknown }).user = user;

		if (!requiredRoles.includes(user.role)) {
			throw new ForbiddenException("Forbidden.");
		}

		return true;
	}
}
