import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
} from "@nestjs/common";
import {
	ApiCookieAuth,
	ApiOperation,
	ApiParam,
	ApiResponse,
	ApiTags,
} from "@nestjs/swagger";
import { Roles } from "../decorators/roles.decorator";
import { AllowlistService } from "./allowlist.service";
import { CreateAllowlistEntryDto } from "./dto/create-allowlist-entry.dto";

@ApiTags("Allowlist")
@ApiCookieAuth("session-cookie")
@Controller({
	path: "auth/allowlist",
	version: "1",
})
@Roles("admin")
export class AllowlistController {
	constructor(private readonly allowlistService: AllowlistService) {}

	@Get()
	@ApiOperation({ summary: "List all allowlist entries" })
	@ApiResponse({ status: 200, description: "List of allowlist entries" })
	async listEntries() {
		const entries = await this.allowlistService.listEntries();
		return { entries };
	}

	@Post()
	@ApiOperation({ summary: "Add a domain or email to the allowlist" })
	@ApiResponse({ status: 201, description: "Allowlist entry created" })
	async createEntry(@Body() dto: CreateAllowlistEntryDto) {
		const entry = await this.allowlistService.addEntry(dto);
		return { entry };
	}

	@Delete(":entryId")
	@ApiOperation({ summary: "Remove an entry from the allowlist" })
	@ApiParam({
		name: "entryId",
		description: "UUID of the allowlist entry",
		format: "uuid",
	})
	@ApiResponse({ status: 200, description: "Allowlist entry removed" })
	async deleteEntry(@Param("entryId", ParseUUIDPipe) entryId: string) {
		const entry = await this.allowlistService.removeEntry(entryId);
		return { entry };
	}
}
