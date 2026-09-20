import { expect, test } from "@playwright/test";
import { de } from "@/i18n/de";
import { endSessionInHook, startSessionInHook } from "./session";

/**
 * The distribution screen between afternoons (`tasks/prd-us-34-distribution-session.md` §US-34.7).
 *
 * This file used to pin the clock and assert the week-colour banner, which decided everything about
 * a distribution from the calendar. The session replaced it: nothing here is a function of the day
 * any more, so no spec in this file moves the clock.
 *
 * What it proves is the screen with **nothing running** — the start form is offered, and the counter
 * and the tally are not, there being nothing to record against. The whole afternoon is US-34.11's.
 *
 * It holds **one afternoon of its own, ended before the first test**: every file sorting before this
 * one now leaves an ended session behind (US-34.10), so what the start form preselects is a fact
 * about a session this spec wrote rather than about who happened to run last.
 *
 * The last spec pins down that the withdrawn `?datum=` is ignored rather than refused.
 */

test.describe("Ausgabe", () => {
  test.beforeAll(async ({ browser, baseURL }) => {
    await startSessionInHook({ browser, baseURL }, "BOTH");
    await endSessionInHook({ browser, baseURL });
  });

  test("offers the three afternoons when none is running", async ({ page }) => {
    await page.goto("/ausgabe");

    const options = de.distribution.session.start.options;
    await expect(page.locator("#session-groups-RED")).toHaveCount(1);
    await expect(page.locator("#session-groups-BLUE")).toHaveCount(1);
    await expect(page.locator("#session-groups-BOTH")).toHaveCount(1);
    await expect(page.getByText(options.BOTH, { exact: true })).toBeVisible();
    await expect(page.getByTestId("session-start-submit")).toHaveText(
      de.distribution.session.start.submit,
    );
    // „Rot und Blau" and nothing else: the afternoon that ended last served both groups, so there is
    // no group that was not up, and `proposeGroups` offers both again. That a merged period carries
    // itself forward is the whole of the proposal's job; the alternating case is US-34.11's.
    await expect(page.locator("#session-groups-BOTH")).toBeChecked();
    await expect(page.locator('input[name="groups"]:checked')).toHaveCount(1);
  });

  test("offers no counter and no tally while no session runs", async ({ page }) => {
    await page.goto("/ausgabe");

    await expect(page.getByTestId("session-header")).toHaveCount(0);
    await expect(page.getByTestId("counter-input")).toHaveCount(0);
    await expect(page.getByTestId("group-progress")).toHaveCount(0);
  });

  test("ignores a ?datum= left over from the retired lookup", async ({ page }) => {
    // The screen once read this parameter and answered about the day it named; US-22 withdrew that
    // (tasks/prd-us-22-drop-week-colour-lookup.md). A URL still carrying it — a bookmark, a link in
    // someone's history — must be inert rather than fatal, and that holds even for a value no
    // calendar has: nothing reads it, so nothing can reject it. A `?nummer=` with no session running
    // is inert for the same reason: there is no lookup to make it an error (US-34.7).
    await page.goto("/ausgabe?datum=2026-13-45&nummer=201");

    await expect(page.getByTestId("session-start-submit")).toBeVisible();
    // No error anywhere on the page: every one this screen can show is an `Alert`, and none of them
    // is rendered. Located by `data-slot` rather than by `role="alert"`, because Next injects a
    // route announcer carrying that role into every page client-side and it would count as one —
    // and `:visible`, because the last session's reopen confirmation is an `Alert` that sits in the
    // markup inside a closed `<details>`.
    await expect(page.locator('[data-slot="alert"]:visible')).toHaveCount(0);
  });
});
