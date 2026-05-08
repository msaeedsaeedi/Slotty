import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from "@nestjs/common";
import {
	ApiCookieAuth,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from "@nestjs/swagger";
import { Roles } from "@/modules/auth/decorators/roles.decorator";
import { CreateUserDto } from "./dto/create-user.dto";
import { UsersService } from "./users.service";

@ApiTags("Users")
@ApiCookieAuth("session-cookie")
@Controller({
	path: "users",
	version: "1",
})
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Post()
	@ApiOperation({ summary: "Create a new user (admin only)" })
	@ApiResponse({ status: 201, description: "User created successfully" })
	@Roles("admin")
	async createUser(@Body() dto: CreateUserDto) {
		const user = await this.usersService.createUser(dto);
		return { user };
	}

	@Get()
	@ApiOperation({ summary: "List all users (admin only)" })
	@ApiQuery({ name: "email", required: false, description: "Filter by email" })
	@ApiResponse({ status: 200, description: "List of users" })
	@Roles("admin")
	async listUsers(@Query("email") email?: string) {
		const users = await this.usersService.listUsers(email);
		return { users };
	}

	@Get(":userId")
	@ApiOperation({ summary: "Get a specific user by ID" })
	@ApiParam({ name: "userId", description: "UUID of the user", format: "uuid" })
	@ApiResponse({ status: 200, description: "User details" })
	@ApiResponse({ status: 404, description: "User not found" })
	@Roles("admin")
	async getUser(@Param("userId", ParseUUIDPipe) userId: string) {
		const user = await this.usersService.getUserById(userId);
		return { user };
	}
}
