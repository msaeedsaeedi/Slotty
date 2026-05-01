import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
} from "@nestjs/common";
import { Roles } from "../decorators/roles.decorator";
import { AllowlistService } from "./allowlist.service";
import { CreateAllowlistEntryDto } from "./dto/create-allowlist-entry.dto";

@Controller({
	path: "auth/allowlist",
	version: "1",
})
@Roles("admin")
export class AllowlistController {
	constructor(private readonly allowlistService: AllowlistService) {}

	@Get()
	async listEntries() {
		const entries = await this.allowlistService.listEntries();
		return { entries };
	}

	@Post()
	async createEntry(@Body() dto: CreateAllowlistEntryDto) {
		const entry = await this.allowlistService.addEntry(dto);
		return { entry };
	}

	@Delete(":entryId")
	async deleteEntry(@Param("entryId", ParseUUIDPipe) entryId: string) {
		const entry = await this.allowlistService.removeEntry(entryId);
		return { entry };
	}
}
