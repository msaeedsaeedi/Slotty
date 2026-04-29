import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UsersService } from "./users.service.js";

@Controller("users")
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Post()
	async createUser(@Body() dto: CreateUserDto) {
		const user = await this.usersService.createUser(dto);
		return { user };
	}

	@Get()
	async listUsers(@Query("email") email?: string) {
		const users = await this.usersService.listUsers(email);
		return { users };
	}

	@Get(":userId")
	async getUser(@Param("userId", ParseUUIDPipe) userId: string) {
		const user = await this.usersService.getUserById(userId);
		return { user };
	}
}
