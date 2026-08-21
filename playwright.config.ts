import { defineConfig, devices } from "@playwright/test";
import {
  DEVICE,
  ENGINE,
  ISOLATED,
  ISOLATED_SPECS,
  SHARED,
  type Register,
} from "./tests/e2e/registers";

/**
 * End-to-end configuration.
 *
 * Playwright runs against the **built** app (`next start`) over a throwaway SQLite file that is
 * migrated and seeded fresh before the server boots — mirroring the CI `e2e-tests` job
 * (docs/architecture/07-deployment-view.md).
 *
 * There are **two** such servers, because there are two kinds of spec. Almost every spec shares one
 * register and only ever adds to it, which keeps the run short and the setup honest. A spec that has
 * to make the register *full*, though, cannot share it with anybody: the quota is a single global
 * number, and the shared database holds customers on numbers well above any quota this suite would
 * set, so "every slot is taken" is unreachable there at any price short of hundreds of rows. Those
 * specs get the `isolated` project below — their own port, their own database, freshly seeded and
 * empty.
 *
 * **Which engine, and which registers, is `tests/e2e/registers.ts`'s to say** — the specs seed the
 * same files this config serves, so neither may state a path the other cannot see. One engine runs
 * per invocation; that module explains why it is not one engine per project.
 */

function url(server: { port: number }): string {
  return `http://127.0.0.1:${server.port}`;
}

/**
 * Boot a server on a database of its own.
 *
 * The database is deleted first so every run starts from the seed: the settings specs append a
 * version stamped *now*, and a run that inherited its predecessor's versions would assert against a
 * history it did not write. The pinned-now file goes with it — a leftover from an aborted run would
 * freeze the app's today for every spec, not just the distribution one. Each server has its own
 * copy of that file, so a spec pinning the clock cannot move the other server's calendar.
 */
function webServer(server: Register) {
  // Single-quoted inside the JS, because the whole `node -e` program is itself in double quotes.
  const scratch = [server.database, server.now].map((file) => `'${file}'`).join(",");
  return {
    command:
      `node -e "const fs=require('fs'); for (const f of [${scratch}]) for (const s of ['','-journal','-wal','-shm']) fs.rmSync(f+s,{force:true})" ` +
      `&& npx prisma migrate deploy && npm run db:seed && npm run start -- --port ${server.port}`,
    url: url(server),
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Relative SQLite urls resolve against the schema directory, hence the `../`.
      DATABASE_URL: `file:../${server.database}`,
      // The test-only clock seam (src/infrastructure/clock.ts). While this file holds an ISO
      // instant the app believes it is that moment, which is how the week-colour banner — a pure
      // function of the calendar — can be asserted at all. A spec that writes it deletes it again.
      FD_FIXED_NOW_FILE: server.now,
    },
  };
}

export default defineConfig({
  testDir: "./tests/e2e",
  // Every spec in a project runs against the *same* SQLite file, and several of them write to it:
  // registering a customer consumes a customer number, the settings specs append a version. Two
  // workers would interleave those writes and each spec would assert against a register the other
  // one moved, so the suite is deliberately serial — it is seconds long, and a flaky gate is worth
  // less than a slow one. The two projects run one after the other for the same reason.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      // Named for the engine, so a report says which of the two gates it came from.
      name: ENGINE,
      testIgnore: ISOLATED_SPECS,
      use: { ...devices[DEVICE], baseURL: url(SHARED) },
    },
    {
      name: `${ENGINE}-isolated`,
      testMatch: ISOLATED_SPECS,
      use: { ...devices[DEVICE], baseURL: url(ISOLATED) },
    },
  ],
  webServer: [webServer(SHARED), webServer(ISOLATED)],
});
