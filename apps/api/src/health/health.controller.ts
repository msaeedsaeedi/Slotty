import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "./health.types.js";

@Controller("health")
export class HealthController {
	@Get()
	getHealth(): HealthResponse {
		return {
			status: "ok",
			version: process.env.APP_VERSION ?? "dev",
			timestamp: new Date().toISOString(),
			checks: {
				database: "unconfigured",
				redis: "unconfigured",
				queue: "unconfigured",
			},
		};
	}
}
