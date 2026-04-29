export type HealthChecks = {
	database: string;
	redis: string;
	queue: string;
};

export type HealthResponse = {
	status: "ok";
	version: string;
	timestamp: string;
	checks: HealthChecks;
};
