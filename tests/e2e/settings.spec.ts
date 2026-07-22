import { expect, test } from "@playwright/test";
import { de } from "@/i18n/de";

/**
 * The settings round-trip against the built app
 * (tasks/prd-us-14-configure-business-rules.md §US-14.5).
 *
 * These specs are the only proof that the whole chain — form, server action, use case, Prisma
 * adapter, SQLite — actually holds together; four green unit gates missed a `"use server"` export
 * bug that a single page load caught. They therefore drive the real screen rather than the ports.
 *
 * They run **serially against one shared database**: each save appends a dated version, and the
 * later specs assert that a rejected save left the value written by the first one untouched.
 */

/** The price every spec here edits: the per-grown-up price, seeded at 2,00 €. */
const PRICE_LABEL = de.settings.fields.pricePerGrownUp;

/** Today as the date input renders it. Versions are stored at midnight UTC, so read in UTC. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

test.describe.configure({ mode: "serial" });

test.describe("Einstellungen", () => {
  test("a changed price is stored and shown again after a reload", async ({ page }) => {
    await page.goto("/einstellungen");

    const price = page.getByLabel(PRICE_LABEL, { exact: true });
    await expect(price).toHaveValue("2,00");
    // Saving asks for an effective-from date and offers today.
    await expect(page.locator("#effectiveFrom")).toHaveValue(todayIso());

    await price.fill("2,50");
    await page.locator("#reason").fill("Preisanpassung");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();

    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);

    await page.reload();
    await expect(page.getByLabel(PRICE_LABEL, { exact: true })).toHaveValue("2,50");
    // The new version is also listed in the read-only history, with its prices.
    await expect(page.getByTestId("settings-version").first()).toContainText(
      `${de.settings.fields.pricePerGrownUp}: 2,50 €`,
    );
  });

  test("a rejected quota shows a German error and saves nothing", async ({ page }) => {
    await page.goto("/einstellungen");

    await page.getByLabel(PRICE_LABEL, { exact: true }).fill("9,99");
    await page.locator("#quotaN").fill("0");
    await page.locator("#reason").fill("Höchstzahl senken");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();

    await expect(page.getByTestId("settings-error")).toHaveText(
      de.settings.errors.invalidSettings(de.settings.fields.quotaN),
    );

    await page.reload();
    await expect(page.getByLabel(PRICE_LABEL, { exact: true })).toHaveValue("2,50");
  });

  test("a retroactive effective-from date is refused and saves nothing", async ({ page }) => {
    await page.goto("/einstellungen");

    await page.getByLabel(PRICE_LABEL, { exact: true }).fill("9,99");
    await page.locator("#effectiveFrom").fill("2025-01-01");
    await page.locator("#reason").fill("Rückwirkende Änderung");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();

    await expect(page.getByTestId("settings-error")).toContainText(
      "Frühere Fassungen werden nicht überschrieben.",
    );

    await page.reload();
    await expect(page.getByLabel(PRICE_LABEL, { exact: true })).toHaveValue("2,50");
  });

  // The quota-below-*active-customers* rule (FR-4) cannot be reached from the browser yet: there is
  // no Customer model until US-01, so `emptyCustomerCounter` reports 0 and no valid quota (>= 1) can
  // ever fall below it. The rule itself is covered by `src/application/settings/settings.test.ts`;
  // the spec above proves the surrounding path — a rejected quota is explained in German and nothing
  // is written. Enable this once US-01 lands and a real counter is wired into `deps.ts`.
  test.skip("a quota below the active customer count is refused", async ({ page }) => {
    await page.goto("/einstellungen");
  });
});
