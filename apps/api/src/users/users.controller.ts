import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from "@nestjs/common";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CreateUserDto } from "./dto/create-user.dto";
import { UsersService } from "./users.service";

@Controller({
	path: "users",
	version: "1",
})
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Post()
	@Roles("admin")
	async createUser(@Body() dto: CreateUserDto) {
		const user = await this.usersService.createUser(dto);
		return { user };
	}

	@Get()
	@Roles("admin")
	async listUsers(@Query("email") email?: string) {
		const users = await this.usersService.listUsers(email);
		return { users };
	}

	@Get(":userId")
	@Roles("admin")
	async getUser(@Param("userId", ParseUUIDPipe) userId: string) {
		const user = await this.usersService.getUserById(userId);
		return { user };
	}
}
