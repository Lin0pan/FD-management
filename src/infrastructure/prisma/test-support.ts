/**
 * Helpers shared by the infrastructure integration tests. Test-only: nothing in `src/app`,
 * `src/application` or `src/domain` imports this module.
 */

import { execFileSync } from "node:child_process";
import type { PrismaClient } from "@prisma/client";

/**
 * Build the schema in a throwaway SQLite file, so an integration test has something to talk to.
 *
 * Every test here migrates its own file under `mkdtemp` and deletes it afterwards, which is what
 * keeps `data/fd.db` out of the suite. Running the migrations rather than pointing Prisma at a
 * hand-built schema is the point: what these tests are for is proving the adapters against the
 * schema DF will actually run, constraints and all.
 *
 * On Windows `npx` is a batch file, which `execFileSync` will not resolve without the suffix and —
 * since the fix for CVE-2024-27980 — will not start even then, because Node refuses to spawn a
 * `.cmd` unless something is asked to interpret it. Naming `cmd.exe` supplies that interpreter and
 * keeps the arguments a list; `shell: true` would concatenate them into one string instead and make
 * Node 26 print a DEP0190 deprecation. `scripts/setup.mjs` spawns npm the same way for the same
 * reason. The failure this avoids is worth knowing by sight, because it names none of the above: the
 * migration throws inside `beforeAll`, the client is therefore never assigned, and every test in the
 * file reports `Cannot read properties of undefined (reading '$disconnect')` from `afterAll`.
 *
 * `url` must be an **absolute** `file:` path — the generated client resolves a relative one against
 * the working directory while the CLI resolves it against `prisma/`, so a relative path quietly
 * migrates one file and then queries another.
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
 * No relation in schema.prisma cascades on delete (US-10.3): the database *refuses* to remove a
 * household that still owns members, a certificate, a card, a distribution record or a reminder log,
 * because in production the only way out of the register is archiving. That protection makes
 * `customer.deleteMany()` on its own a foreign-key error in any test that registered a household, so
 * the order below is the price of it — and having it stated once means the next table to be added
 * has one place to be listed rather than five.
 */
export async function clearRegister(prisma: PrismaClient): Promise<void> {
  await prisma.distributionRecord.deleteMany();
  await prisma.reminderLog.deleteMany();
  await prisma.card.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.householdMember.deleteMany();
  // A re-registered household points at the archived record it was pre-filled from (US-11.3), and
  // that link is `onDelete: Restrict` like every other: a customer with a successor cannot be
  // deleted either. Dropping the links first is the self-reference's version of "children first".
  await prisma.customer.updateMany({ data: { previousCustomerId: null } });
  await prisma.customer.deleteMany();
}
