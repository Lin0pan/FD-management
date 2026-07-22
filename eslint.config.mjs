import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

/**
 * The clock rule: a *zero-argument* `new Date()` and `Date.now()` read the wall clock, which makes
 * a rule untestable. `new Date(someValue)` is a pure transformation of a value that was passed in,
 * so it stays allowed — otherwise every date calculation would have to move to infrastructure.
 */
const noWallClock = [
  {
    selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
    message:
      "Reading the wall clock here makes the rule untestable. Take a `Clock` port and use `clock.now()`; the only `new Date()` lives in src/infrastructure/clock.ts.",
  },
  {
    selector: 'MemberExpression[object.name="Date"][property.name="now"]',
    message:
      "Reading the wall clock here makes the rule untestable. Take a `Clock` port and use `clock.now()`; the only wall-clock read lives in src/infrastructure/clock.ts.",
  },
];

const frameworkAndPersistence = [
  "next",
  "next/*",
  "react",
  "react-dom",
  "server-only",
  "@prisma/client",
  ".prisma/client",
  "prisma",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Turn off ESLint rules that conflict with Prettier; must come after the configs it disables.
  prettier,

  /**
   * Architecture boundary — dependencies point inwards only: app → application → domain.
   *
   * This was a convention guarded by review (docs/technical_documentation.md §3). Review is exactly
   * what is absent when an autonomous agent runs unattended, so the boundary is a build failure now.
   * Covered by src/architecture.test.ts.
   */
  {
    name: "fd/domain-boundary",
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                ...frameworkAndPersistence,
                "@/app/*",
                "@/application/*",
                "@/infrastructure/*",
                "**/app/**",
                "**/application/**",
                "**/infrastructure/**",
                "fs",
                "node:fs",
                "node:fs/promises",
                "child_process",
                "node:child_process",
              ],
              message:
                "The domain layer is pure: it imports nothing from Next.js, React, Prisma, the filesystem, or an outer layer. Dependencies point inwards only.",
            },
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...noWallClock],
    },
  },
  {
    name: "fd/application-boundary",
    files: ["src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                ...frameworkAndPersistence,
                "@/app/*",
                "@/infrastructure/*",
                "**/app/**",
                "**/infrastructure/**",
              ],
              message:
                "The application layer reaches persistence and time only through the interfaces in ports.ts — never through Prisma, Next.js or an infrastructure module directly.",
            },
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...noWallClock],
    },
  },
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
