import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { CERTIFICATE_TYPE_OTHER } from "@/app/certificate-type-resolver";
import { de } from "@/i18n/de";
import { SHARED } from "./registers";
import { fillSticky, hydrated } from "./day";
import { fillPersonalData as fillPersonalDataOn, type Person } from "./registration-form";

/**
 * The Nachweis-Art vocabulary, end to end (`tasks/prd-us-33-certificate-types-from-settings.md`
 * §US-33.7): a type added on `/einstellungen` reaching the intake's own drop-down, a household
 * registered with it carrying that word to its record, "Sonstiges" saving exactly what was typed
 * when nothing configured fits, and a type removed afterwards leaving what was already saved alone.
 *
 * Every piece is proved on its own elsewhere — the domain's fold, the port's round trip, the use
 * case's audit entry, the control's prefill rule. What none of them can see is the one sentence DF
 * cares about: *the word typed into settings is the word a staff member picks at the counter, and
 * removing it later does not rewrite what is already on file.*
 *
 * Runs early, on the **shared** register (`registers.ts`): this file writes the certificate types
 * that later specs' registrations read, exercising the control's selected-option path rather than
 * always falling onto "Sonstiges" for want of a configured word.
 */

faker.seed(20260916);

const GROWN_UP_BIRTH_DATE = "1984-05-19";
const CERTIFICATE_VALID_UNTIL = "2028-06-30";

const JOBCENTER = "Jobcenter-Bescheid";
const TEMPORARY = "Rentenbescheid";
const GRUNDSICHERUNG = "Grundsicherungsbescheid";
const FREE_TEXT_TYPE = "Nachweis vom Sozialgericht Paderborn";

/**
 * The database the built app is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is taken from `registers.ts` — the one place that knows which engine this run drives, and
 * therefore which register is behind it. It is resolved to an absolute path because a relative
 * SQLite url resolves against the schema directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(SHARED.database)}` });

/** Open the settings screen and wait until React owns the certificate-type card. */
async function openSettings(page: Page): Promise<void> {
  await page.goto("/einstellungen");
  await hydrated(page.getByTestId("add-certificate-type-row"));
}

/** The one row's input, by the position `certificate-type-table.tsx` names it under. */
function typeInput(page: Page, index: number): Locator {
  return page.locator(`#certificateTypeLabel-${index}`);
}

/** Append a blank row and type the label into it — `EggRuleTable`'s own gesture. */
async function addRow(page: Page, label: string): Promise<void> {
  const before = await page.getByTestId("certificate-type-row").count();
  await page.getByTestId("add-certificate-type-row").click();
  await fillSticky(typeInput(page, before), label);
}

function saveButton(page: Page): Locator {
  return page.getByRole("button", { name: de.settings.certificateTypes.save, exact: true });
}

async function saveAccepted(page: Page): Promise<void> {
  await saveButton(page).click();
  await expect(page.getByTestId("certificate-types-saved")).toHaveText(
    de.settings.certificateTypes.saved,
  );
}

/**
 * The rows exactly as the card renders them *right now*, without a reload.
 *
 * Reading `textContent` goes blind on this screen (US-004's own progress note) — a filled `<input>`'s
 * value is an attribute, not a text node — so each row's controlled value is read off the element
 * directly.
 */
async function currentRows(page: Page): Promise<ReadonlyArray<string>> {
  return page
    .getByTestId("certificate-type-row")
    .locator("input")
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

/** The values `/kunden/neu`'s own drop-down currently offers, in the order it renders them. */
async function offeredTypes(page: Page): Promise<ReadonlyArray<string | null>> {
  return page
    .locator("#certificateType option")
    .evaluateAll((options) => options.map((option) => option.getAttribute("value")));
}

async function registerHousehold(page: Page, certificateType: string): Promise<number> {
  await page.goto("/kunden/neu");
  const applicant: Person = {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
  };
  await fillPersonalDataOn(page, applicant, {
    birthDate: GROWN_UP_BIRTH_DATE,
    certificateType,
    certificateValidUntil: CERTIFICATE_VALID_UNTIL,
  });
  await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();
  await page.waitForURL(/\/kunden\/\d+(\?|$)/);
  return Number(new URL(page.url()).pathname.split("/").at(-1));
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.configure({ mode: "serial" });

test.describe("Arten des Nachweises", () => {
  /** The household registered under the configured type, read back in the removal test. */
  let configuredHouseholdId: number;

  test("adding a type and removing another in the same save is proved on the card itself", async ({
    page,
  }) => {
    await openSettings(page);
    await expect(page.getByTestId("certificate-type-row")).toHaveCount(0);

    // A first save with two rows, so the second has something of its own to remove alongside an add.
    await addRow(page, JOBCENTER);
    await addRow(page, TEMPORARY);
    await saveAccepted(page);
    expect(await currentRows(page)).toEqual([JOBCENTER, TEMPORARY]);

    // One save, an add and a remove together — asserted on the card that just saved it, no
    // `page.goto` in between. A navigation would reseed the card from the server and prove nothing
    // about the panel that a staff member is actually looking at.
    await addRow(page, GRUNDSICHERUNG);
    await page.getByTestId("remove-certificate-type-row-1").click();
    await saveAccepted(page);
    expect(await currentRows(page)).toEqual([JOBCENTER, GRUNDSICHERUNG]);

    // And it was actually written, not merely redrawn: a fresh load agrees, sorted by the domain's
    // own fold rather than the order the rows were typed in.
    await page.reload();
    expect(await currentRows(page)).toEqual(
      [JOBCENTER, GRUNDSICHERUNG].slice().sort((a, b) => a.localeCompare(b, "de")),
    );
  });

  test("a type on settings appears at the intake, and a household registered with it carries the word to its record", async ({
    page,
  }) => {
    await page.goto("/kunden/neu");
    const offered = await offeredTypes(page);
    expect(offered).toContain(JOBCENTER);
    expect(offered).toContain(GRUNDSICHERUNG);
    // "Sonstiges" is always last, after whatever DF configured.
    expect(offered.at(-1)).toBe(CERTIFICATE_TYPE_OTHER);

    configuredHouseholdId = await registerHousehold(page, JOBCENTER);
    await expect(page.getByRole("main")).toContainText(JOBCENTER);

    const saved = await prisma.customer.findUniqueOrThrow({
      where: { id: configuredHouseholdId },
      select: { certificates: { select: { type: true } } },
    });
    expect(saved.certificates.map((certificate) => certificate.type)).toEqual([JOBCENTER]);
  });

  test('"Sonstiges" saves exactly the free text typed, even though it matches nothing configured', async ({
    page,
  }) => {
    const id = await registerHousehold(page, FREE_TEXT_TYPE);
    await expect(page.getByRole("main")).toContainText(FREE_TEXT_TYPE);

    const saved = await prisma.customer.findUniqueOrThrow({
      where: { id },
      select: { certificates: { select: { type: true } } },
    });
    // The typed spelling, character for character — never joined to the configured list (US-33.1).
    expect(saved.certificates.map((certificate) => certificate.type)).toEqual([FREE_TEXT_TYPE]);
  });

  test("removing a type from settings leaves a record already saved with it exactly as it was", async ({
    page,
  }) => {
    await openSettings(page);
    const before = await currentRows(page);
    const removedIndex = before.indexOf(JOBCENTER);
    expect(removedIndex).toBeGreaterThanOrEqual(0);

    await page.getByTestId(`remove-certificate-type-row-${removedIndex}`).click();
    await saveAccepted(page);
    expect(await currentRows(page)).not.toContain(JOBCENTER);

    // No longer offered to the next household …
    await page.goto("/kunden/neu");
    expect(await offeredTypes(page)).not.toContain(JOBCENTER);

    // … but the household saved under it a moment ago still shows it, unrewritten: the stored string
    // is a snapshot in the sense `grownUpsAtIssue` is, not a reference into the list that named it.
    await page.goto(`/kunden/${configuredHouseholdId}`);
    await expect(page.getByRole("main")).toContainText(JOBCENTER);
  });
});
