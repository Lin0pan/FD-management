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
 * On Windows this takes two hurdles rather than one. Spawning `npx` fails with `spawnSync npx
 * ENOENT` even though the file is right there next to node.exe, because `execFileSync` resolves a
 * bare name through `PATHEXT` and npm's extensionless shim has no extension to match. Asking for
 * `npx.cmd` clears that and hits the second: since the fix for CVE-2024-27980 Node refuses to spawn
 * a `.cmd` at all unless something is named to interpret it, and fails with `EINVAL`. `cmd.exe` is
 * that interpreter, and passing it `/d /c` keeps the arguments a list — `shell: true` would clear
 * both hurdles too, but by concatenating them into one string, which Node 26 then deprecates
 * (DEP0190) on every run. `scripts/setup.mjs` spawns npm the same way for the same reason.
 *
 * Worth knowing by sight, because half of what it prints is a decoy: `beforeAll` throws, so the
 * client is never assigned and `afterAll` piles a second failure — `Cannot read properties of
 * undefined (reading '$disconnect')` — on top of the real one. Vitest also counts the tests
 * themselves as *skipped* rather than failed, so the summary line reads `898 passed | 176 skipped`
 * and invites the eye straight past it.
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

/**
 * Empty the settings history and everything hanging off it, children first — the same "children
 * first" `clearRegister` above exists for, on the other half of the schema.
 *
 * A settings version owns its egg rule's rows (US-28.5) and the relation is `onDelete: Restrict`
 * like every other one, so `settingsVersion.deleteMany()` on its own is a foreign-key error the
 * moment a version carries a rule — which, since the seed carries DF's, is every version worth
 * testing against.
 */
export async function clearSettings(prisma: PrismaClient): Promise<void> {
  await prisma.eggAllowanceRow.deleteMany();
  await prisma.settingsVersion.deleteMany();
}
