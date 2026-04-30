import * as Joi from "joi";

export const validationSchema = Joi.object({
	NODE_ENV: Joi.string()
		.valid("development", "production", "test")
		.default("development"),
	PORT: Joi.number().default(3001),

	GOOGLE_CLIENT_ID: Joi.string().required(),
	GOOGLE_CLIENT_SECRET: Joi.string().required(),

	INTERNAL_JWT_SECRET: Joi.string().min(32).required(),

	REDIS_URL: Joi.string().uri().default("redis://localhost:6379"),

	DATABASE_URL: Joi.string().required(),

	CORS_ORIGIN: Joi.string().uri().default("http://localhost:3000"),
});
