import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * Playwright runs against the **built** app (`next start`) over a throwaway SQLite file that is
 * migrated and seeded fresh before the server boots — mirroring the CI `e2e-tests` job
 * (docs/fd_dev_setup_overview.md).
 *
 * There are **two** such servers, because there are two kinds of spec. Almost every spec shares one
 * register and only ever adds to it, which keeps the run short and the setup honest. A spec that has
 * to make the register *full*, though, cannot share it with anybody: the quota is a single global
 * number, and the shared database holds customers on numbers well above any quota this suite would
 * set, so "every slot is taken" is unreachable there at any price short of hundreds of rows. Those
 * specs get the `isolated` project below — their own port, their own database, freshly seeded and
 * empty.
 */

/** The shared register: everything except the specs listed under {@link ISOLATED_SPECS}. */
const SHARED = { port: 3000, database: "data/e2e.db", now: "data/e2e-now.txt" } as const;

/** The register a spec may own outright — empty at boot, and nobody else's assertions ride on it. */
const ISOLATED = {
  port: 3001,
  database: "data/e2e-isolated.db",
  now: "data/e2e-isolated-now.txt",
} as const;

/**
 * The specs that own their register.
 *
 * Add one here only when it must decide the quota or fill every slot — the isolated project costs a
 * second Next server for the whole run, and a spec that merely writes is fine on the shared one.
 */
const ISOLATED_SPECS = ["**/waiting-list.spec.ts"];

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
function webServer(server: { port: number; database: string; now: string }) {
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
      name: "chromium",
      testIgnore: ISOLATED_SPECS,
      use: { ...devices["Desktop Chrome"], baseURL: url(SHARED) },
    },
    {
      name: "isolated",
      testMatch: ISOLATED_SPECS,
      use: { ...devices["Desktop Chrome"], baseURL: url(ISOLATED) },
    },
  ],
  webServer: [webServer(SHARED), webServer(ISOLATED)],
});
