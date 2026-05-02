import type { Config } from "jest";

const config: Config = {
	moduleFileExtensions: ["js", "json", "ts"],
	rootDir: "src",
	testRegex: ".*\\.spec\\.ts$",
	transform: {
		"^.+\\.(t|j)s$": "ts-jest",
	},
	collectCoverageFrom: [
		"**/*.(t|j)s",
		"!**/*.interface.ts",
		"!**/dto/**",
		"!**/*.module.ts",
	],
	coverageDirectory: "./coverage",
	testEnvironment: "node",
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/$1",
		"^@test/(.*)$": "<rootDir>/../test/$1",
		"^prisma/(.*)$": "<rootDir>/../prisma/$1",
	},
	testPathIgnorePatterns: ["/node_modules/", "/e2e/"],
};

// biome-ignore lint/style/noDefaultExport: <Jest requires default export>
export default config;
