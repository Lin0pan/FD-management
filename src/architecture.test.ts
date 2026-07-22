import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Proves the architecture boundary is *enforced*, not merely documented.
 *
 * The rule that matters — "the domain layer imports nothing from Next.js, React or Prisma" — used to
 * be a convention guarded by review (docs/technical_documentation.md §3). These tests assert that
 * `npm run lint` actually fails on a violation, so the boundary survives an unattended agent run.
 *
 * Nothing is written to disk: `lintText` resolves the real flat config for the given `filePath`.
 */

const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIdsFor(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((m) => m.ruleId ?? "(fatal)");
}

describe("domain layer boundary", () => {
  it.each([
    ["Prisma", `import { PrismaClient } from "@prisma/client";\nexport const x = PrismaClient;`],
    ["React", `import { useState } from "react";\nexport const x = useState;`],
    ["Next.js", `import { NextResponse } from "next/server";\nexport const x = NextResponse;`],
    ["the filesystem", `import { readFileSync } from "node:fs";\nexport const x = readFileSync;`],
    [
      "an outer layer via alias",
      `import { systemClock } from "@/infrastructure/clock";\nexport const x = systemClock;`,
    ],
    [
      "an outer layer via relative path",
      `import { systemClock } from "../infrastructure/clock";\nexport const x = systemClock;`,
    ],
  ])("rejects importing %s", async (_label, code) => {
    expect(await ruleIdsFor(code, "src/domain/sample.ts")).toContain("no-restricted-imports");
  });

  it("rejects reading the wall clock", async () => {
    const ids = await ruleIdsFor(
      `export const today = () => new Date();\nexport const stamp = () => Date.now();`,
      "src/domain/sample.ts",
    );
    expect(ids.filter((id) => id === "no-restricted-syntax")).toHaveLength(2);
  });

  it("allows constructing a Date from a value that was passed in", async () => {
    const code = `export const midnight = (d: Date) => new Date(d.getFullYear(), 0, 1);`;
    expect(await ruleIdsFor(code, "src/domain/sample.ts")).toEqual([]);
  });

  it("allows a pure module with no imports", async () => {
    const code = `export const add = (a: number, b: number): number => a + b;`;
    expect(await ruleIdsFor(code, "src/domain/sample.ts")).toEqual([]);
  });
});

describe("application layer boundary", () => {
  it("rejects reaching past its ports into infrastructure", async () => {
    const code = `import { systemClock } from "@/infrastructure/clock";\nexport const x = systemClock;`;
    expect(await ruleIdsFor(code, "src/application/sample.ts")).toContain("no-restricted-imports");
  });

  it("rejects importing Prisma directly", async () => {
    const code = `import { PrismaClient } from "@prisma/client";\nexport const x = PrismaClient;`;
    expect(await ruleIdsFor(code, "src/application/sample.ts")).toContain("no-restricted-imports");
  });

  it("allows importing from the domain", async () => {
    const code = `import { formatEuros } from "@/domain/money";\nexport const x = formatEuros;`;
    expect(await ruleIdsFor(code, "src/application/sample.ts")).toEqual([]);
  });
});

describe("infrastructure layer", () => {
  it("is the one place allowed to read the wall clock and import Prisma", async () => {
    const code = `import { PrismaClient } from "@prisma/client";\nexport const now = () => new Date();\nexport const c = PrismaClient;`;
    expect(await ruleIdsFor(code, "src/infrastructure/sample.ts")).toEqual([]);
  });
});
