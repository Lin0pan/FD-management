import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit-test configuration.
 *
 * Coverage is deliberately scoped to `src/domain` and `src/application` only — the pure layers where
 * near-100% coverage is a *consequence* of TDD, not a target chased elsewhere (see
 * docs/fd_dev_setup_overview.md §TDD). Playwright specs under `tests/e2e` are excluded here; they run
 * via `npm run test:e2e`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/domain/**", "src/application/**"],
      exclude: ["**/*.{test,spec}.ts"],
      reporter: ["text", "html", "lcov"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
