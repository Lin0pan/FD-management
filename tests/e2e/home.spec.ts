import { rmSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { SHARED } from "./registers";

/**
 * The Start dashboard against a fixed clock (tasks/prd-us-17-navigation-shell.md §US-17.5).
 *
 * The screen states two things — what day it is and when the next Ausgabe is — and both are pure
 * functions of the calendar, so asserting either means deciding what day the app thinks it is. The
 * seam is the one `distribution.spec.ts` already drives: while `FD_FIXED_NOW_FILE` — `data/e2e-now.txt`,
 * set in `playwright.config.ts` — holds an ISO instant, `systemClock` returns it instead of the wall
 * clock. It is re-read per call, so writing the file moves the app's today without a restart, and
 * deleting it hands the wall clock back.
 *
 * The expected days follow from the seeded settings alone (`src/infrastructure/prisma/seed.ts`):
 * anchor `2026-W02` = RED, distributions on ISO weekday 4. Hence Thursday 08.01.2026 is a RED
 * distribution day, Thursday 15.01.2026 a BLUE one, and the days between them fall on either side
 * of the first.
 *
 * Three pinned days, and the third is the one that matters: on a Saturday *after* that week's
 * distribution the current week is still RED while the next Ausgabe is BLUE, so a panel that read
 * `view.colour` instead of `nextDistribution.colour` would announce the wrong group — the likely bug
 * in this screen, and invisible on the other two days because there the two fields agree.
 *
 * The spec only reads, so it leaves the shared register exactly as it found it. It does restore the
 * clock in `afterAll`: a pinned today would otherwise make the settings specs, which save a version
 * stamped *now*, assert against January.
 */

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/**
 * The sentence the distribution panel states, without the heading standing above it.
 *
 * Asserted as an exact text rather than a `toContainText`, because half of what this spec proves is
 * a *negative*: on a distribution day the line must say today and must not name a coming date, and a
 * containment check cannot tell the two wordings apart.
 */
function distributionLine(page: Page): Locator {
  return page.getByTestId("next-distribution").locator("p");
}

/** Make the app believe it is this instant, for every request until the next call. */
function pinNow(instant: string): void {
  writeFileSync(NOW_FILE, instant, "utf8");
}

test.describe.configure({ mode: "serial" });

test.describe("Start", () => {
  test.afterAll(() => {
    rmSync(NOW_FILE, { force: true });
  });

  test("says the Ausgabe is today on a distribution day, naming that day's group", async ({
    page,
  }) => {
    // Thursday of the red week: the distribution day itself.
    pinNow("2026-01-08T09:00:00.000Z");
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(de.home.heading);
    await expect(page.getByTestId("today-date")).toHaveText(
      de.home.today("Donnerstag, 8. Januar 2026"),
    );
    // The line says *today* rather than skipping to next week, and it says so in words of its own.
    await expect(distributionLine(page)).toHaveText(
      de.home.distribution.isToday(de.distribution.colours.RED),
    );
    await expect(page.getByTestId("distribution-not-configured")).toHaveCount(0);

    // The to-do signals moved to the hub in US-17.2; this screen is read, not worked through.
    await expect(page.getByTestId("waiting-list-free-slot")).toHaveCount(0);
    await expect(page.getByTestId("cards-due-badge")).toHaveCount(0);
  });

  test("names the coming distribution on a day before it", async ({ page }) => {
    // Tuesday of the red week: two days before its Thursday.
    pinNow("2026-01-06T09:00:00.000Z");
    await page.goto("/");

    await expect(page.getByTestId("today-date")).toHaveText(
      de.home.today("Dienstag, 6. Januar 2026"),
    );
    await expect(distributionLine(page)).toHaveText(
      de.home.distribution.next("Donnerstag, 8. Januar 2026", de.distribution.colours.RED),
    );
  });

  test("names next week's group on a day after this week's distribution", async ({ page }) => {
    // Saturday of the red week: its Thursday has been and gone.
    pinNow("2026-01-10T09:00:00.000Z");
    await page.goto("/");

    await expect(page.getByTestId("today-date")).toHaveText(
      de.home.today("Samstag, 10. Januar 2026"),
    );
    // BLUE, the colour of the distribution being announced — not RED, the colour of the week the
    // reader is standing in. This assertion is the whole reason the third day is pinned.
    await expect(distributionLine(page)).toHaveText(
      de.home.distribution.next("Donnerstag, 15. Januar 2026", de.distribution.colours.BLUE),
    );

    // The week that same Saturday belongs to is still RED, and that the two disagree today is what
    // makes the assertion above worth making: on a day where they agreed, either field would pass.
    // That used to be cross-checked here by looking 10.01.2026 up on the Ausgabe screen, the one
    // place `colour` rather than `nextDistribution.colour` was rendered. US-22 removed that lookup
    // (tasks/prd-us-22-drop-week-colour-lookup.md) and no screen renders `colour` any more — the
    // Ausgabe banner paints `nextDistribution.colour` too, which on this Saturday is the same BLUE
    // asserted above. So the disagreement is now pinned down one layer down, in
    // `src/application/distribution/distribution.test.ts`: "names the next distribution and its
    // colour on a day that is not one" asserts the two fields differ.
  });

  test("still renders when no settings are in force, instead of an error page", async ({
    page,
  }) => {
    // A day before the seeded version was recorded (2026-01-01), so nothing is in force and
    // `getWeekColour` throws `NoSettingsInForce` — the state a database nobody has seeded is in,
    // reachable here without emptying a table every other spec reads.
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
    await expect(page.getByTestId("next-distribution")).toHaveCount(0);
  });
});
