import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * Playwright runs against the **built** app (`next start`) over a throwaway SQLite file that is
 * migrated and seeded fresh before the server boots — mirroring the CI `e2e-tests` job
 * (docs/fd_dev_setup_overview.md). The walking skeleton ships a single smoke spec; the
 * distribution-day and registration flows are added with the features they cover.
 */
const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Every spec runs against the *same* SQLite file, and several of them write to it: registering a
  // customer consumes a customer number, the settings specs append a version. Two workers would
  // interleave those writes and each spec would assert against a register the other one moved, so
  // the suite is deliberately serial — it is seconds long, and a flaky gate is worth less than a
  // slow one.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // The database is deleted first so every run starts from the seed. The settings specs append a
    // version dated *today*, and a version dated on or before the latest one is refused — without
    // the reset, a second run on the same day would fail against its own leftovers.
    command:
      "node -e \"for (const s of ['','-journal','-wal','-shm']) require('fs').rmSync('data/e2e.db'+s,{force:true})\" && npx prisma migrate deploy && npm run db:seed && npm run start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: "file:../data/e2e.db",
    },
  },
});
