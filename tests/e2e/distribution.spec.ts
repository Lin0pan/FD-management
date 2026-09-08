import { rmSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { de } from "@/i18n/de";
import { SHARED } from "./registers";

/**
 * The week-colour banner against a fixed clock (`tasks/prd-us-03-week-colour.md` §US-03.5).
 *
 * The banner is a pure function of the calendar, so asserting it means deciding what day the app
 * thinks it is. The seam is `FD_FIXED_NOW_FILE` (`src/infrastructure/clock.ts`), re-read per call, so
 * writing the file moves today without restarting the server.
 *
 * The expected colours follow from the seeded settings alone. The banner **names the group only on a
 * distribution day** — that absence is the assertion worth having, a group named on a day nobody can
 * collect being what US-22 removed. The last spec pins down that the withdrawn `?datum=` is ignored
 * rather than refused.
 *
 * `week-colour-week` is the one thing on the screen reading `view.colour` rather than
 * `nextDistribution.colour`, and the Saturday spec is where the two disagree.
 *
 * They only read, but they restore the clock in `afterAll`: a pinned today would make the settings
 * specs, which save a version stamped *now*, assert against January.
 */

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/** Make the app believe it is this instant, for every request until the next call. */
function pinNow(instant: string): void {
  writeFileSync(NOW_FILE, instant, "utf8");
}

test.describe.configure({ mode: "serial" });

test.describe("Ausgabe", () => {
  test.afterAll(() => {
    rmSync(NOW_FILE, { force: true });
  });

  test("names the red group on a red distribution day", async ({ page }) => {
    pinNow("2026-01-08T09:00:00.000Z");
    await page.goto("/ausgabe");

    const banner = page.getByTestId("week-colour-banner");
    await expect(banner).toContainText(de.distribution.banner.isDistributionDay);
    await expect(page.getByTestId("week-colour-group")).toHaveText(
      de.distribution.group(de.distribution.colours.RED),
    );
    await expect(banner).toContainText("08.01.2026");
    await expect(banner).toContainText(de.distribution.banner.week("02"));
    // A distribution day states no "next" — today is it — and carries no week badge either: the
    // week's colour is the group in the headline above, and a badge could only repeat it.
    await expect(page.getByTestId("next-distribution")).toHaveCount(0);
    await expect(page.getByTestId("week-colour-week")).toHaveCount(0);
  });

  test("names the blue group on the following distribution day", async ({ page }) => {
    pinNow("2026-01-15T09:00:00.000Z");
    await page.goto("/ausgabe");

    const banner = page.getByTestId("week-colour-banner");
    await expect(banner).toContainText(de.distribution.banner.isDistributionDay);
    await expect(page.getByTestId("week-colour-group")).toHaveText(
      de.distribution.group(de.distribution.colours.BLUE),
    );
    await expect(banner).toContainText(de.distribution.banner.week("03"));
  });

  test("states the next distribution on a weekday without one", async ({ page }) => {
    // Tuesday of the blue week: two days before its Thursday.
    pinNow("2026-01-13T09:00:00.000Z");
    await page.goto("/ausgabe");

    const banner = page.getByTestId("week-colour-banner");
    await expect(banner).toContainText(de.distribution.banner.noDistributionDay);
    await expect(page.getByTestId("next-distribution")).toHaveText(
      de.distribution.banner.next("15.01.2026", de.distribution.colours.BLUE),
    );
    await expect(banner).toContainText("13.01.2026");
    await expect(banner).toContainText(de.distribution.banner.week("03"));
    // No group headline on a day nobody collects: the sentence above is the only place the group is
    // named, and it names the date it belongs to in the same breath.
    await expect(page.getByTestId("week-colour-group")).toHaveCount(0);
    // The badge states the *week's* colour. Here it agrees with the sentence, because the next
    // distribution is this week's; the spec below is the one where the two part company.
    await expect(page.getByTestId("week-colour-week")).toHaveText(de.distribution.colours.BLUE);
  });

  test("badges the week's own colour, not the colour of the next distribution", async ({
    page,
  }) => {
    // The Saturday after the red Thursday: the week is still red, the next distribution is already
    // blue, and both are true at once. This is the day the badge exists for — without it the screen
    // says only "Gruppe Blau" and a staff member asking which week they are in has to count.
    pinNow("2026-01-10T09:00:00.000Z");
    await page.goto("/ausgabe");

    await expect(page.getByTestId("next-distribution")).toHaveText(
      de.distribution.banner.next("15.01.2026", de.distribution.colours.BLUE),
    );
    await expect(page.getByTestId("week-colour-banner")).toContainText(
      de.distribution.banner.week("02"),
    );
    await expect(page.getByTestId("week-colour-week")).toHaveText(de.distribution.colours.RED);
  });

  test("ignores a ?datum= left over from the retired lookup", async ({ page }) => {
    pinNow("2026-01-08T09:00:00.000Z");
    // The screen once read this parameter and answered about the day it named; US-22 withdrew that
    // (tasks/prd-us-22-drop-week-colour-lookup.md). A URL still carrying it — a bookmark, a link in
    // someone's history — must be inert rather than fatal, and that holds even for a value no
    // calendar has: nothing reads it, so nothing can reject it.
    await page.goto("/ausgabe?datum=2026-13-45");

    await expect(page.getByTestId("week-colour-group")).toHaveText(
      de.distribution.group(de.distribution.colours.RED),
    );
    // No error anywhere on the page: every one this screen can show is an `Alert`, and none of them
    // is rendered. Located by `data-slot` rather than by `role="alert"`, because Next injects a
    // route announcer carrying that role into every page client-side and it would count as one.
    await expect(page.locator('[data-slot="alert"]')).toHaveCount(0);
  });
});
