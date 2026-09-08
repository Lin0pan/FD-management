/**
 * Helpers shared by the infrastructure integration tests. Test-only: nothing in `src/app`,
 * `src/application` or `src/domain` imports this module.
 */

import { execFileSync } from "node:child_process";
import type { PrismaClient } from "@prisma/client";

/**
 * Build the schema in a throwaway SQLite file. Running the migrations rather than pointing Prisma at
 * a hand-built schema is the point: these tests prove the adapters against the schema DF will run,
 * constraints and all.
 *
 * **The Windows spawn is two hurdles, not one.** A bare `npx` fails `ENOENT`, because `execFileSync`
 * resolves it through `PATHEXT` and npm's shim has no extension; `npx.cmd` then fails `EINVAL`,
 * because since CVE-2024-27980 Node refuses to spawn a `.cmd` without a named interpreter. `cmd.exe
 * /d /c` is that interpreter and keeps the arguments a list — `shell: true` clears both hurdles by
 * concatenating them, which Node 26 deprecates (DEP0190). `scripts/setup.mjs` does the same.
 *
 * **Half of what a failure prints is a decoy**: `beforeAll` throws, so `afterAll` piles a second
 * failure (`Cannot read properties of undefined (reading '$disconnect')`) on top, and Vitest counts
 * the tests as *skipped* rather than failed — the summary reads `898 passed | 176 skipped`.
 *
 * `url` must be an **absolute** `file:` path: the generated client resolves a relative one against
 * the working directory and the CLI against `prisma/`, so it would migrate one file and query another.
 */
export function migrateThrowawayDatabase(url: string): void {
  const args = ["prisma", "migrate", "deploy"];
  const [file, argv]: [string, string[]] =
    process.platform === "win32" ? ["cmd.exe", ["/d", "/c", "npx.cmd", ...args]] : ["npx", args];

  execFileSync(file, argv, { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
}

/**
 * Empty the customer register and everything hanging off it, children first.
 *
 * No relation cascades on delete (ADR-010), so `customer.deleteMany()` alone is a foreign-key error
 * in any test that registered a household. The order below is the price of that protection, stated
 * once so the next table added has one place to be listed rather than five.
 */
export async function clearRegister(prisma: PrismaClient): Promise<void> {
  await prisma.distributionRecord.deleteMany();
  await prisma.reminderLog.deleteMany();
  await prisma.card.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.householdMember.deleteMany();
  // A re-registered household points at the record it was pre-filled from (US-11.3), and that link
  // is `onDelete: Restrict` too — so dropping the links first is the self-reference's "children
  // first".
  await prisma.customer.updateMany({ data: { previousCustomerId: null } });
  await prisma.customer.deleteMany();
}

/**
 * The same for the settings history. A version owns its egg rule's rows (US-28.5) under the same
 * `onDelete: Restrict`, so `settingsVersion.deleteMany()` alone is a foreign-key error the moment a
 * version carries a rule — which, the seed carrying DF's, is every version worth testing against.
 */
export async function clearSettings(prisma: PrismaClient): Promise<void> {
  await prisma.eggAllowanceRow.deleteMany();
  await prisma.settingsVersion.deleteMany();
}
