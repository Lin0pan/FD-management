import { rmSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { de } from "@/i18n/de";
import { germanDateTime } from "@/i18n/format";
import { SHARED } from "./registers";
import { endSession, startSession } from "./session";

/**
 * The Start dashboard against a fixed clock (`tasks/prd-us-17-navigation-shell.md` §US-17.5,
 * US-34.9).
 *
 * The date is a pure function of the calendar, so asserting it means deciding what day the app
 * thinks it is. The seam is `FD_FIXED_NOW_FILE`, re-read per call, so writing the file moves the
 * app's today without a restart and deleting it hands the wall clock back.
 *
 * The last spec is the one thing here that is **not** a function of the calendar: the afternoon under
 * way (US-34.9). It starts one and ends it again through the counter's own controls, which is also
 * what keeps this file's pinned instant the one the panel has to print.
 *
 * It otherwise only reads, but it does restore the clock in `afterAll`: a pinned today would make the
 * settings specs, which save a version stamped *now*, assert against January.
 */

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/** Make the app believe it is this instant, for every request until the next call. */
function pinNow(instant: string): void {
  writeFileSync(NOW_FILE, instant, "utf8");
}

test.describe.configure({ mode: "serial" });

test.describe("Start", () => {
  test.afterAll(() => {
    rmSync(NOW_FILE, { force: true });
  });

  test("states the day and nothing else while no afternoon is under way", async ({ page }) => {
    // Any day the seeded version is in force on; nothing about the date decides what is shown.
    pinNow("2026-01-08T09:00:00.000Z");
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(de.home.heading);
    await expect(page.getByTestId("today-date")).toHaveText(
      de.home.today("Donnerstag, 8. Januar 2026"),
    );
    await expect(page.getByTestId("distribution-not-configured")).toHaveCount(0);

    // The to-do signals moved to the hub in US-17.2; this screen is read, not worked through.
    await expect(page.getByTestId("waiting-list-free-slot")).toHaveCount(0);
    await expect(page.getByTestId("cards-due-badge")).toHaveCount(0);
  });

  test("still renders when no settings are in force, instead of an error page", async ({
    page,
  }) => {
    // A day before the seeded version was recorded (2026-01-01), so nothing is in force and
    // `readCurrentSettings` throws `NoSettingsInForce` — the state a database nobody has seeded is
    // in, reachable here without emptying a table every other spec reads.
    pinNow("2025-12-31T09:00:00.000Z");
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(de.home.heading);
    // The date is the half of the screen that does not depend on DF having configured anything.
    await expect(page.getByTestId("today-date")).toHaveText(
      de.home.today("Mittwoch, 31. Dezember 2025"),
    );
    const panel = page.getByTestId("distribution-not-configured");
    await expect(panel).toContainText(de.home.distribution.notConfigured);
    await expect(panel.getByRole("link", { name: de.home.settingsLink })).toHaveAttribute(
      "href",
      "/einstellungen",
    );
  });

  test("states the afternoon under way, and nothing at all when none is", async ({ page }) => {
    // Back onto a day the seeded settings are in force on, so the panel is read against the screen
    // DF actually see rather than the unconfigured one above.
    const started = "2026-01-08T09:00:00.000Z";
    pinNow(started);

    await page.goto("/");
    await expect(page.getByTestId("running-session")).toHaveCount(0);

    await startSession(page, "BOTH");
    await page.goto("/");

    // Both badges, because a merged afternoon is a thing this screen has to be able to state — and
    // the instant it began, which is what a session nobody ended looks like on Friday morning.
    const panel = page.getByTestId("running-session");
    await expect(panel).toContainText(de.distribution.session.running);
    const groups = page.getByTestId("running-session-groups");
    await expect(groups).toContainText(de.distribution.colours.RED);
    await expect(groups).toContainText(de.distribution.colours.BLUE);
    await expect(page.getByTestId("running-session-started")).toHaveText(
      de.distribution.session.onStartScreen.startedAt(germanDateTime(new Date(started))),
    );
    // The way to the screen that can end it — the act the panel exists to prompt.
    await expect(
      panel.getByRole("link", { name: de.distribution.session.onStartScreen.link }),
    ).toHaveAttribute("href", "/ausgabe");
    // The screen keeps the date: the panel is added above it, not instead of it.
    await expect(page.getByTestId("today-date")).toBeVisible();

    // And the afternoon ended, the screen is byte-for-byte the one the other specs assert.
    await endSession(page);
    await page.goto("/");
    await expect(page.getByTestId("running-session")).toHaveCount(0);
  });
});
