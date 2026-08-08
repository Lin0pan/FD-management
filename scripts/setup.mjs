/**
 * One-command setup for a fresh clone: `npm run setup`.
 *
 * The steps below are the ones the README used to ask a person to type, and the **order is the
 * whole reason this file exists**. `prisma generate` writes the location of `.env` into the
 * generated client, so a client generated while `.env` is still absent — which is exactly what
 * `npm install` does on a fresh clone — can never resolve `DATABASE_URL`. The Prisma *CLI* loads
 * `.env` on its own, so `migrate deploy` succeeds anyway and the failure surfaces a step later in
 * `db:seed`, complaining about the environment against a database that had just been built
 * correctly. Nothing about that error points at the ordering. Running the steps from a script
 * instead of a checklist makes the mistake unavailable rather than merely documented.
 *
 * Every step is idempotent, so this is equally the right command on a fresh clone and on a
 * checkout that has been running for months:
 *
 *   - an existing `.env` is left untouched — it is the one file here that may hold local edits;
 *   - `prisma generate` and `migrate deploy` are no-ops when they have nothing to do;
 *   - `db:seed` only fills an *empty* settings table, so a database holding real data is safe.
 *
 * It deliberately does not reset, seed demo data, or delete anything — `db:reset` and `db:demo`
 * stay separate because those destroy data and this must never be the command anyone hesitates
 * over.
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// npm and npx are batch files on Windows, which execFileSync will not resolve without the suffix.
// The suffix alone is not enough and this branch has never run: since the fix for CVE-2024-27980,
// Node refuses to spawn a .cmd without `shell: true`, which is not passed here. Windows is
// therefore documented as unsupported for now (CONTRIBUTING.md) rather than half-claimed, and a
// Windows-capable version is planned. `shell: true` is the likely fix, but it changes how arguments
// are quoted, so it needs proving on a real Windows machine before this note comes out.
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const TOTAL_STEPS = 5;
let currentStep = 0;
let currentLabel = "";

function step(label) {
  currentStep += 1;
  currentLabel = label;
  console.log(`\n[${currentStep}/${TOTAL_STEPS}] ${label}`);
}

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}

function ensureEnvFile() {
  const envPath = join(root, ".env");
  const examplePath = join(root, ".env.example");

  if (existsSync(envPath)) {
    console.log(".env already exists — left untouched.");
    return;
  }
  if (!existsSync(examplePath)) {
    throw new Error(".env.example is missing, so .env cannot be created from it.");
  }
  copyFileSync(examplePath, envPath);
  console.log("Created .env from .env.example.");
}

try {
  step("Installing dependencies");
  run(npm, ["install"]);

  step("Checking .env");
  ensureEnvFile();

  // Must follow .env: see the note at the top of this file.
  step("Generating the Prisma client");
  run(npx, ["prisma", "generate"]);

  step("Applying database migrations");
  run(npx, ["prisma", "migrate", "deploy"]);

  step("Seeding the provisional policy values");
  run(npm, ["run", "db:seed"]);

  console.log("\nSetup complete. Start the app with `npm run dev` (http://localhost:3000).");
} catch (error) {
  console.error(`\nSetup failed at step ${currentStep}/${TOTAL_STEPS}: ${currentLabel}.`);
  console.error(error instanceof Error ? error.message : error);
  console.error(
    "\nThe output above says why. Fix it and run `npm run setup` again — it is safe to repeat.",
  );
  process.exitCode = 1;
}
