export const configuration = () => ({
	env: process.env.NODE_ENV || "development",
	port: parseInt(process.env.PORT || "3001", 10),

	google: {
		clientId: process.env.GOOGLE_CLIENT_ID,
		clientSecret: process.env.GOOGLE_CLIENT_SECRET,
		callbackURL: process.env.GOOGLE_CALLBACK_URL,
	},

	session: {
		name: process.env.SESSION_NAME || "slotty.sid",
		ttlHours: parseInt(process.env.SESSION_TTL_HOURS || "24", 10),
		secret: process.env.SESSION_SECRET,
	},

	redis: {
		url: process.env.REDIS_URL || "redis://localhost:6379",
	},

	database: {
		url: process.env.DATABASE_URL,
	},

	webapp: {
		origin: process.env.CORS_ORIGIN || "http://localhost:3000",
		authRedirectURL:
			process.env.AUTH_REDIRECT_URL || "http://localhost:3000/auth/callback",
	},
});
