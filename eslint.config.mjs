import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Turn off ESLint rules that conflict with Prettier; must come after the configs it disables.
  prettier,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // FD-Management:
    "coverage/**",
    "data/**",
    "playwright-report/**",
    "test-results/**",
    "src/generated/**",
    "prisma/migrations/**",
  ]),
]);

export default eslintConfig;
