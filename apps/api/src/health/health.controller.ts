import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "@/modules/auth/decorators/public.decorator";
import { HealthService } from "./health.service";

@Controller({
	path: "health",
	version: "1",
})
export class HealthController {
	constructor(private readonly healthService: HealthService) {}

	@Get()
	@Public()
	async getHealth() {
		const health = await this.healthService.getHealth();

		if (health.status === "error") {
			throw new ServiceUnavailableException(health);
		}

		return health;
	}
}
