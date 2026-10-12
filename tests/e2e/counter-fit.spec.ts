import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { foldName } from "@/domain/customer/nameSearch";
import { clearRegister } from "@/infrastructure/prisma/test-support";
import { fillSticky, hydrated } from "./day";
import { ISOLATED } from "./registers";
import { endSessionInHook, startSessionInHook } from "./session";

/**
 * The whole mask on one MacBook Air screen (`tasks/prd-us-41-counter-screen-redesign.md` §US-41.9,
 * FR-9): after the lookup, the bottom of „Ausgabemaske" sits inside 1440 × 800 with nothing
 * scrolled, in the canvas's three fullest states — `Main`, `Z2` and `Z3`.
 *
 * **It owns a register** (`ISOLATED_SPECS`): the campaign reminder `Main` needs is switched on for
 * the whole register, and every household on the shared one would grow a checkbox with it.
 */

// A fixed seed so a failure is reproducible. Only names and addresses come from Faker; the note is
// a literal because its two lines are the fixture.
faker.seed(20261012);

const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(ISOLATED.database)}` });

/** Odd, so all three are RED (US-31) and the one afternoon this spec starts serves them all. */
const NUMBERS = { main: 11, served: 13, blocked: 15 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;
/** On the real clock, so the certificates are dated from it (`progress.txt`: session.spec.ts). */
const EXPIRED_CERTIFICATE = new Date(Date.now() - 7 * DAY_MS);
const VALID_CERTIFICATE = new Date(Date.now() + 365 * DAY_MS);
const GROWN_UP_BIRTH_DATE = new Date("1985-02-11T00:00:00.000Z");
const CHILD_BIRTH_DATE = new Date("2020-06-15T00:00:00.000Z");

const TWO_LINE_NOTE = "Kommt meist zu zweit.\nHolt für die Nachbarin mit ab.";

/** The screen the mask is drawn for. */
const MACBOOK_AIR = { width: 1440, height: 800 } as const;

interface Household {
  readonly customerNumber: number;
  readonly certificateValidUntil: Date;
  readonly blockReason?: string;
  readonly reminderCount?: number;
}

/** Two grown-ups and a child with a printed card — the household row's fuller shape. */
async function seedHousehold(household: Household): Promise<void> {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();
  const registered = new Date(Date.now() - 400 * DAY_MS);

  await prisma.customer.create({
    data: {
      customerNumber: household.customerNumber,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate: GROWN_UP_BIRTH_DATE,
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      status: household.blockReason === undefined ? "ACTIVE" : "BLOCKED",
      blockReason: household.blockReason ?? null,
      reminderCount: household.reminderCount ?? 0,
      notes: TWO_LINE_NOTE,
      householdMembers: {
        create: [
          { firstName, lastName, birthDate: GROWN_UP_BIRTH_DATE },
          { firstName: faker.person.firstName(), lastName, birthDate: GROWN_UP_BIRTH_DATE },
          { firstName: faker.person.firstName(), lastName, birthDate: CHILD_BIRTH_DATE },
        ],
      },
      certificates: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: household.certificateValidUntil,
          recordedAt: registered,
        },
      },
      cards: {
        create: {
          customerNumber: household.customerNumber,
          index: 1,
          issuedAt: registered,
          printedAt: registered,
          reason: "FIRST_ISSUE",
          grownUpsAtIssue: 2,
          childrenAtIssue: 1,
        },
      },
    },
  });
}

/** Type a number at the counter and press Enter, as staff do. */
async function lookUp(page: Page, customerNumber: number): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(String(customerNumber));
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${customerNumber}`));
  await expect(page.getByTestId("counter-customer")).toBeVisible();
}

/** The claim itself: the mask's bottom edge inside the window, and the page never scrolled. */
async function expectMaskFits(page: Page): Promise<void> {
  const mask = page.locator('section[aria-label="Ausgabemaske"]');
  await expect(mask).toBeVisible();
  const { bottom, scrollY } = await mask.evaluate((element) => ({
    bottom: element.getBoundingClientRect().bottom,
    scrollY: window.scrollY,
  }));
  expect(scrollY).toBe(0);
  expect(bottom).toBeLessThanOrEqual(MACBOOK_AIR.height);
}

test.describe.configure({ mode: "serial" });
test.use({ viewport: MACBOOK_AIR });

test.describe("Ausgabemaske auf einem Bildschirm", () => {
  test.beforeAll(async ({ browser, baseURL }) => {
    rmSync(ISOLATED.now, { force: true });
    // A retry replays this against the register the failed attempt left, afternoon included.
    await endSessionInHook({ browser, baseURL });
    await clearRegister(prisma);

    await seedHousehold({
      customerNumber: NUMBERS.main,
      certificateValidUntil: EXPIRED_CERTIFICATE,
      reminderCount: 2,
    });
    await seedHousehold({
      customerNumber: NUMBERS.served,
      certificateValidUntil: VALID_CERTIFICATE,
    });
    await seedHousehold({
      customerNumber: NUMBERS.blocked,
      certificateValidUntil: VALID_CERTIFICATE,
      blockReason: "Hat zweimal für einen anderen Haushalt abgeholt, ohne Vollmacht.",
    });

    const page = await browser.newPage({ baseURL });
    try {
      await page.goto("/einstellungen");
      await fillSticky(page.getByTestId("campaign-reminder-name"), "Weihnachtstüte");
      await page.getByTestId("campaign-reminder-start").click();
      await expect(page.getByTestId("campaign-reminder-progress")).toBeVisible();
    } finally {
      await page.close();
    }
    await startSessionInHook({ browser, baseURL }, "RED");
  });

  test.afterAll(async ({ browser, baseURL }) => {
    await endSessionInHook({ browser, baseURL });
    await prisma.$disconnect();
  });

  test("fits a household with an expired certificate, a campaign box and a two-line note", async ({
    page,
  }) => {
    await lookUp(page, NUMBERS.main);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED",
    );
    await expect(page.getByTestId("campaign-reminder-received")).not.toBeChecked();
    await expect(page.getByTestId("counter-notes")).toHaveText(TWO_LINE_NOTE);

    await expectMaskFits(page);
  });

  // Before anything is served: „Ausgabe verwerfen" still wraps the header line onto a second row.
  test("fits a blocked household with its reason above the note", async ({ page }) => {
    await lookUp(page, NUMBERS.blocked);
    await expect(page.getByTestId("session-discard-open")).toBeVisible();
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute("data-verdict", "BLOCKED");
    await expect(page.getByTestId("counter-verdict-detail")).toBeVisible();
    await expect(page.getByTestId("counter-notes")).toHaveText(TWO_LINE_NOTE);

    await expectMaskFits(page);
  });

  test("fits a household already served, with the removal open", async ({ page }) => {
    await lookUp(page, NUMBERS.served);
    await hydrated(page.getByTestId("serve-button"));
    await page.getByTestId("serve-button").click();
    await expect(page.getByTestId("serve-recorded-confirmation")).toBeVisible();

    await lookUp(page, NUMBERS.served);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "ALREADY_SERVED",
    );
    await expectMaskFits(page);

    // `Z2` draws the removal's confirmation open: the tallest the footer gets.
    await page.getByTestId("correct-remove-open").click();
    await expect(page.getByTestId("correct-remove-warning")).toBeVisible();
    await expectMaskFits(page);
  });
});
