/**
 * `npm start`: runs `next start` as a child and starts it again when it asks to be restarted — which
 * is how a staged restore takes effect without anyone at the terminal (`local_only/datensicherung`).
 *
 * - Exit code {@link RESTART_EXIT_CODE}: restart at once. `src/infrastructure/process-control.ts`
 *   exits with it after a restore is staged; the two must agree.
 * - Exit code 0, or a stop signal sent to this process: stop for good.
 * - Anything else is a crash: restart after a pause, but give up after {@link MAX_CRASHES} crashes
 *   within {@link CRASH_WINDOW_MS}, so a start that always fails does not loop forever.
 *
 * Spawns `process.execPath` with Next's own entry file rather than `npx`, so it needs no shell and
 * clears the Windows `.cmd` hurdle `scripts/setup.mjs` describes.
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const RESTART_EXIT_CODE = 75;
const MAX_CRASHES = 3;
const CRASH_WINDOW_MS = 60_000;
const CRASH_PAUSE_MS = 2_000;

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const args = ["start", ...process.argv.slice(2)];

/** Instants of the recent crashes, oldest first. */
let crashes = [];
let stopping = false;
let child = null;

function log(message) {
  console.info(`[FD-Management] ${message}`);
}

function run() {
  child = spawn(process.execPath, [nextBin, ...args], {
    stdio: "inherit",
    env: { ...process.env, FD_SUPERVISED: "1" },
  });
  child.on("exit", onExit);
}

function onExit(code, signal) {
  child = null;
  if (stopping) {
    process.exit(code ?? 0);
  }
  if (code === RESTART_EXIT_CODE) {
    log("Neustart …");
    run();
    return;
  }
  if (code === 0) {
    process.exit(0);
  }

  const now = Date.now();
  crashes = [...crashes.filter((at) => now - at < CRASH_WINDOW_MS), now];
  if (crashes.length >= MAX_CRASHES) {
    log(
      `Die Software ist ${crashes.length}-mal hintereinander abgestürzt (zuletzt ${signal ?? `Code ${code}`}). ` +
        "Sie wird nicht erneut gestartet.",
    );
    process.exit(1);
  }
  log(`Abgestürzt (${signal ?? `Code ${code}`}). Neustart in ${CRASH_PAUSE_MS / 1000} Sekunden …`);
  setTimeout(run, CRASH_PAUSE_MS);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    stopping = true;
    if (child === null) {
      process.exit(0);
    }
    child.kill(signal);
  });
}

run();
