import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // A transaction holds one connection, and pg@9 drops its queue for concurrent queries on one
  // client: run queries on `tx` one after another (issue #95, docs ch. 7). Promise.all on `db`
  // is fine, since the pool spreads it over connections.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='Promise'][callee.property.name=/^(all|allSettled|any|race)$/] Identifier[name='tx']",
          message: "Don't run queries on a transaction client concurrently: await them one after another (issue #95, docs ch. 7).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    "test-results/**",
    "playwright-report/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
