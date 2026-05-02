import type { Config } from "jest";

const config: Config = {
	rootDir: ".",
	preset: "ts-jest",
	testEnvironment: "node",

	roots: ["<rootDir>/src"],
	testMatch: ["**/*.spec.ts"],

	moduleFileExtensions: ["ts", "js", "json"],

	transform: {
		"^.+\\.(t|j)s$": [
			"ts-jest",
			{
				tsconfig: "<rootDir>/tsconfig.json",
				isolatedModules: true,
			},
		],
	},

	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/src/$1",
		"^@test/(.*)$": "<rootDir>/test/$1",
		"^prisma/(.*)$": "<rootDir>/prisma/$1",
	},

	collectCoverageFrom: [
		"src/**/*.{ts,js}",
		"!src/**/*.spec.ts",
		"!src/**/*.module.ts",
		"!src/**/*.interface.ts",
		"!src/**/*.dto.ts",
		"!src/**/index.ts",
		"!src/**/__tests__/**",
		"!src/**/dist/**",
		"!src/main.ts",
	],

	coverageDirectory: "<rootDir>/coverage",
	coverageProvider: "v8",

	coverageThreshold: {
		global: {
			statements: 80,
			branches: 75,
			functions: 80,
			lines: 80,
		},
	},

	testPathIgnorePatterns: ["/node_modules/", "/dist/"],

	clearMocks: true,
	testTimeout: 10000,
};

// biome-ignore lint/style/noDefaultExport: <jest expects a default export>
export default config;
