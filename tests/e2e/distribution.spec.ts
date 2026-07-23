import { rmSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { de } from "@/i18n/de";

/**
 * The week-colour banner against a fixed clock
 * (tasks/prd-us-03-week-colour.md §US-03.5).
 *
 * The banner is a pure function of the calendar, so asserting it at all means deciding what day the
 * app thinks it is. The seam is `FD_FIXED_NOW_FILE` (see `src/infrastructure/clock.ts`): while that
 * file — `data/e2e-now.txt`, set in `playwright.config.ts` — holds an ISO instant, `systemClock`
 * returns it instead of the wall clock. It is re-read per call, so writing the file moves the app's
 * today without restarting the server, and deleting it hands the wall clock back.
 *
 * The expected colours follow from the seeded settings alone (`src/infrastructure/prisma/seed.ts`):
 * anchor `2026-W02` = RED, distributions on ISO weekday 4, Thursday. Hence Thursday 08.01.2026 is a
 * RED distribution day, the Thursday after it is BLUE, and the Tuesday between them is no
 * distribution day at all.
 *
 * These specs only read, so they leave the shared database exactly as they found it. They do
 * restore the clock in `afterAll` — a pinned today would otherwise make the settings specs, which
 * save a version stamped *now*, assert against January.
 */

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = "data/e2e-now.txt";

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
    await expect(banner).toContainText(de.distribution.banner.week("2026-W02"));
    // A distribution day states no "next" — today is it.
    await expect(page.getByTestId("next-distribution")).toHaveCount(0);
  });

  test("names the blue group on the following distribution day", async ({ page }) => {
    pinNow("2026-01-15T09:00:00.000Z");
    await page.goto("/ausgabe");

    const banner = page.getByTestId("week-colour-banner");
    await expect(banner).toContainText(de.distribution.banner.isDistributionDay);
    await expect(page.getByTestId("week-colour-group")).toHaveText(
      de.distribution.group(de.distribution.colours.BLUE),
    );
    await expect(banner).toContainText(de.distribution.banner.week("2026-W03"));
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
    // The banner names the colour of the distribution it announces, not of the day it is read on —
    // here they agree, because the next distribution falls in the same week.
    await expect(page.getByTestId("week-colour-group")).toHaveText(
      de.distribution.group(de.distribution.colours.BLUE),
    );
  });

  test("looks up the colour of a week two years out", async ({ page }) => {
    pinNow("2026-01-08T09:00:00.000Z");
    await page.goto("/ausgabe");

    await page.getByLabel(de.distribution.lookup.label).fill("2028-07-20");
    await page.getByRole("button", { name: de.distribution.lookup.submit, exact: true }).click();

    await expect(page.getByTestId("lookup-colour")).toHaveText(
      de.distribution.group(de.distribution.colours.RED),
    );
    await expect(page.getByTestId("lookup-result")).toContainText(
      de.distribution.lookup.result("20.07.2028", "2028-W29", de.distribution.colours.RED),
    );
    // The looked-up day is itself a Thursday, so the screen says so rather than naming a next one.
    await expect(page.getByTestId("lookup-result")).toContainText(
      de.distribution.lookup.isDistributionDay,
    );
    // Today's banner is untouched by the lookup.
    await expect(page.getByTestId("week-colour-group")).toHaveText(
      de.distribution.group(de.distribution.colours.RED),
    );
  });
});
