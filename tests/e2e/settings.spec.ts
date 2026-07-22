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
 * They run **serially against one shared database**: each spec builds on the price the previous one
 * saved, and the last asserts that a rejected save left that value untouched.
 */

/** The price every spec here edits: the per-grown-up price, seeded at 2,00 €. */
const PRICE_LABEL = de.settings.fields.pricePerGrownUp;

test.describe.configure({ mode: "serial" });

test.describe("Einstellungen", () => {
  test("a changed price is stored and shown again after a reload", async ({ page }) => {
    await page.goto("/einstellungen");

    const price = page.getByLabel(PRICE_LABEL, { exact: true });
    await expect(price).toHaveValue("2,00");
    // A change applies at once, so the screen has no effective-from field to fill in.
    await expect(page.locator("#effectiveFrom")).toHaveCount(0);

    await price.fill("2,50");
    // The reason is left empty on purpose: it is optional, and only a real page load proves the
    // whole chain accepts a save without one.
    await expect(page.locator("#reason")).toHaveValue("");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();

    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);

    await page.reload();
    await expect(page.getByLabel(PRICE_LABEL, { exact: true })).toHaveValue("2,50");
    // The new version is also listed in the read-only history, with its prices.
    await expect(page.getByTestId("settings-version").first()).toContainText(
      `${de.settings.fields.pricePerGrownUp}: 2,50 €`,
    );
  });

  test("a second save on the same day is applied too, and both are listed", async ({ page }) => {
    await page.goto("/einstellungen");

    // Saving twice in a row is the behaviour this screen exists for — settings apply at once and
    // are never dated, so nothing about the previous save can stand in the way of the next one.
    await page.getByLabel(PRICE_LABEL, { exact: true }).fill("2,75");
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();
    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);

    await page.reload();
    await expect(page.getByLabel(PRICE_LABEL, { exact: true })).toHaveValue("2,75");

    const versions = page.getByTestId("settings-version");
    await expect(versions).toHaveCount(3);
    // Newest first: the price just saved leads the list and is the one marked as in force.
    await expect(versions.first()).toContainText(`${de.settings.fields.pricePerGrownUp}: 2,75 €`);
    await expect(versions.first()).toContainText(de.settings.history.current);
    await expect(versions.nth(1)).toContainText(`${de.settings.fields.pricePerGrownUp}: 2,50 €`);
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
    await expect(page.getByLabel(PRICE_LABEL, { exact: true })).toHaveValue("2,75");
  });

  // The quota-below-*active-customers* rule (FR-4) still cannot be reached from the browser: a real
  // `PrismaCustomerCounter` is wired into `deps.ts` as of US-01.5, but nothing can put a customer
  // into the register until the registration form lands (US-01.6), so the count is always 0 and no
  // valid quota (>= 1) can fall below it. The rule itself is covered by
  // `src/application/settings/settings.test.ts`; the specs above prove the surrounding path — a
  // rejected quota is explained in German and nothing is written. Enable this once a customer can be
  // registered from the browser.
  test.skip("a quota below the active customer count is refused", async ({ page }) => {
    await page.goto("/einstellungen");
  });
});
