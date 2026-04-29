import Joi from "joi";

const envSchema = Joi.object({
	NODE_ENV: Joi.string().valid("development", "test", "production").default("development"),
	PORT: Joi.number().integer().min(1).max(65535).default(3001),
	APP_VERSION: Joi.string().default("dev"),
	ENABLE_SWAGGER: Joi.string().valid("true", "false").default("false"),
	DATABASE_URL: Joi.string().min(1).required(),
	REDIS_URL: Joi.string().min(1).default("redis://localhost:6379"),
}).unknown(true);

export function validateEnv(config: Record<string, unknown>) {
	const { error, value } = envSchema.validate(config, { abortEarly: false });

	if (error) {
		throw new Error(`Config validation error: ${error.message}`);
	}

	return value;
}
