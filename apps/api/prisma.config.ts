import "dotenv/config";
import { defineConfig } from "prisma/config";

// biome-ignore lint/style/noDefaultExport: <It's prisma config file, it needs to export default>
export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		url: process.env["DATABASE_URL"],
	},
});
