import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { foldName } from "@/domain/customer/nameSearch";
import { de } from "@/i18n/de";
import { germanDayOf } from "@/i18n/format";
import { clearRegister } from "@/infrastructure/prisma/test-support";
import { fillSticky, hydrated } from "./day";
import { fillPersonalData } from "./registration-form";
import { ISOLATED } from "./registers";
import { endSession, endSessionInHook, startSession } from "./session";

/**
 * The campaign reminder through the screens (`tasks/prd-us-40-campaign-reminder.md` §US-40.8):
 * switched on in the settings, ticked at the counter and in the record, renamed, switched off.
 *
 * **It owns a register** (`ISOLATED_SPECS`): „x von y erhalten" is a claim about the whole of one.
 *
 * „At any time" (D3) is proved in the record: the counter builds no lookup at all between
 * afternoons, so the box is ticked there with none running, and at the counter during one.
 */

faker.seed(20261011);

const NOW_FILE = ISOLATED.now;

const GROWN_UP_BIRTH_DATE = "1981-07-14";
const VALID_CERTIFICATE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

/** All odd, so all RED and served by the one afternoon this spec starts (US-31). */
const NUMBERS = {
  /** Ticked in the record without an afternoon running, later unticked there. */
  first: 1,
  /** Served at the counter, which must not tick it (D4). */
  served: 3,
  blocked: 5,
  archived: 7,
  /** Registered through the intake while the campaign runs. */
  registered: 9,
} as const;

const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(ISOLATED.database)}` });

type SeededStatus = "ACTIVE" | "BLOCKED" | "ARCHIVED";

/** A household with one grown-up, a valid certificate and its printed first card. */
async function seedHousehold(customerNumber: number, status: SeededStatus): Promise<number> {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const birthDate = new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`);
  const registered = new Date("2026-01-02T00:00:00.000Z");

  const customer = await prisma.customer.create({
    data: {
      customerNumber,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate,
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      status,
      blockReason: status === "BLOCKED" ? "Ausweis nicht vorgelegt." : null,
      archiveReason: status === "ARCHIVED" ? "Weggezogen." : null,
      archivedAt: status === "ARCHIVED" ? registered : null,
      reminderCount: 0,
      notes: "",
      householdMembers: { create: [{ firstName, lastName, birthDate }] },
      certificates: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: VALID_CERTIFICATE,
          recordedAt: registered,
        },
      },
      cards: {
        create: {
          customerNumber,
          index: 1,
          issuedAt: registered,
          printedAt: registered,
          reason: "FIRST_ISSUE",
          grownUpsAtIssue: 1,
          childrenAtIssue: 0,
        },
      },
    },
    select: { id: true },
  });

  return customer.id;
}

/** Register a RED household on `slot` through the intake. */
async function register(page: Page, slot: number): Promise<number> {
  await page.goto("/kunden/neu");

  const select = page.getByTestId("customer-number-select");
  await hydrated(select);
  await page.locator("#group-RED").check();
  await select.selectOption(String(slot));

  await fillPersonalData(
    page,
    { firstName: faker.person.firstName(), lastName: faker.person.lastName() },
    {
      birthDate: GROWN_UP_BIRTH_DATE,
      certificateType: "Jobcenter-Bescheid",
      certificateValidUntil: VALID_CERTIFICATE.toISOString().slice(0, 10),
    },
  );
  await page.getByTestId("registration-card-printed").check();

  await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();
  await page.waitForURL(/\/kunden\/\d+(\?|$)/);
  await expect(page.getByTestId("customer-number")).toHaveText(String(slot));

  return Number(new URL(page.url()).pathname.split("/").at(-1));
}

/** Type a number at the counter and press Enter, as staff do. A session must be running. */
async function lookUp(page: Page, customerNumber: number): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(String(customerNumber));
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${customerNumber}`));
}

function box(page: Page): Locator {
  return page.getByTestId("campaign-reminder-received");
}

/** Tick or untick the box and wait for the save to come back, not just the optimistic render. */
async function setBox(page: Page, received: boolean): Promise<void> {
  await hydrated(box(page));
  await box(page).setChecked(received);
  await expect(box(page)).toBeEnabled();
  await expect(box(page)).toBeChecked({ checked: received });
}

async function expectProgress(page: Page, received: number, total: number): Promise<void> {
  await page.goto("/einstellungen");
  await expect(page.getByTestId("campaign-reminder-progress")).toHaveText(
    de.settings.campaignReminder.progress(received, total),
  );
}

async function switchOn(page: Page, name: string): Promise<void> {
  await page.goto("/einstellungen");
  await fillSticky(page.getByTestId("campaign-reminder-name"), name);
  await page.getByTestId("campaign-reminder-start").click();
  await expect(page.getByTestId("campaign-reminder-progress")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.describe("Aktionserinnerung", () => {
  const ids: Record<"first" | "served" | "blocked" | "archived", number> = {
    first: 0,
    served: 0,
    blocked: 0,
    archived: 0,
  };

  test.beforeAll(async ({ browser, baseURL }) => {
    rmSync(NOW_FILE, { force: true });
    // A retry replays this against the register the failed attempt left, afternoon included.
    await endSessionInHook({ browser, baseURL });
    await clearRegister(prisma);
    ids.first = await seedHousehold(NUMBERS.first, "ACTIVE");
    ids.served = await seedHousehold(NUMBERS.served, "ACTIVE");
    ids.blocked = await seedHousehold(NUMBERS.blocked, "BLOCKED");
    ids.archived = await seedHousehold(NUMBERS.archived, "ARCHIVED");
  });

  test.afterAll(async ({ browser, baseURL }) => {
    await endSessionInHook({ browser, baseURL });
    await prisma.$disconnect();
  });

  test("shows no checkbox anywhere while no reminder is on", async ({ page }) => {
    await page.goto(`/kunden/${ids.first}`);
    await expect(page.getByTestId("customer-number")).toHaveText(String(NUMBERS.first));
    await expect(box(page)).toHaveCount(0);

    await startSession(page, "RED");
    await lookUp(page, NUMBERS.first);
    await expect(page.getByTestId("counter-customer")).toBeVisible();
    await expect(box(page)).toHaveCount(0);
    await endSession(page);
  });

  test("switches a named reminder on with nobody yet received", async ({ page }) => {
    await switchOn(page, "Weihnachtstüte");

    // The archived household is not part of the campaign: three of the four seeded.
    await expect(page.getByTestId("campaign-reminder-progress")).toHaveText(
      de.settings.campaignReminder.progress(0, 3),
    );
    await expect(page.getByTestId("campaign-reminder-since")).toHaveText(
      de.settings.campaignReminder.since(germanDayOf(new Date())),
    );
  });

  test("ticks a household off with no afternoon running", async ({ page }) => {
    await page.goto("/ausgabe");
    await expect(page.getByTestId("session-start-submit")).toBeVisible();

    await page.goto(`/kunden/${ids.first}`);
    await expect(page.getByRole("checkbox", { name: "Weihnachtstüte" })).not.toBeChecked();
    await expect(page.getByTestId("campaign-reminder-outstanding")).toHaveText(
      de.campaignReminder.outstanding,
    );

    await setBox(page, true);
    await expect(page.getByTestId("campaign-reminder-outstanding")).toHaveCount(0);

    await page.reload();
    await expect(box(page)).toBeChecked();
    await expect(page.getByTestId("campaign-reminder-outstanding")).toHaveCount(0);

    await expectProgress(page, 1, 3);
  });

  test("shows the tick at the counter, and serving a household does not tick it", async ({
    page,
  }) => {
    await startSession(page, "RED");

    await lookUp(page, NUMBERS.first);
    await expect(page.getByRole("checkbox", { name: "Weihnachtstüte" })).toBeChecked();

    await lookUp(page, NUMBERS.served);
    await expect(box(page)).not.toBeChecked();
    await expect(page.getByTestId("campaign-reminder-outstanding")).toBeVisible();
    // Prominent, never in the way: the serve button is there whatever the box says.
    await page.getByTestId("serve-button").click();
    await expect(page.getByTestId("serve-recorded-confirmation")).toBeVisible();

    await lookUp(page, NUMBERS.served);
    await expect(page.getByTestId("already-served")).toBeVisible();
    await expect(box(page)).not.toBeChecked();
    await expect(page.getByTestId("campaign-reminder-outstanding")).toBeVisible();

    await expectProgress(page, 1, 3);
  });

  test("ticks off a blocked household and shows nothing for an archived one", async ({ page }) => {
    await lookUp(page, NUMBERS.blocked);
    await expect(page.getByTestId("counter-customer")).toBeVisible();
    await setBox(page, true);
    await expect(page.getByTestId("campaign-reminder-outstanding")).toHaveCount(0);

    await lookUp(page, NUMBERS.archived);
    await expect(box(page)).toHaveCount(0);
    await page.goto(`/kunden/${ids.archived}`);
    await expect(page.getByTestId("customer-number")).toHaveText(String(NUMBERS.archived));
    await expect(box(page)).toHaveCount(0);

    await expectProgress(page, 2, 3);
  });

  test("unticks a household in the record and the progress follows", async ({ page }) => {
    await page.goto(`/kunden/${ids.first}`);
    await expect(box(page)).toBeChecked();
    await setBox(page, false);
    await expect(page.getByTestId("campaign-reminder-outstanding")).toBeVisible();

    await expectProgress(page, 1, 3);
  });

  test("counts a household registered during the campaign as not yet received", async ({
    page,
  }) => {
    await register(page, NUMBERS.registered);
    await expect(box(page)).not.toBeChecked();
    await expect(page.getByTestId("campaign-reminder-outstanding")).toBeVisible();

    await expectProgress(page, 1, 4);
  });

  test("renames the reminder and keeps the ticks", async ({ page }) => {
    await page.goto("/einstellungen");
    await fillSticky(page.getByTestId("campaign-reminder-name"), "Ostertüte");
    await page.getByTestId("campaign-reminder-rename").click();
    await expect(page.getByText(de.settings.campaignReminder.renamed)).toBeVisible();

    await expectProgress(page, 1, 4);
    await lookUp(page, NUMBERS.blocked);
    await expect(page.getByRole("checkbox", { name: "Ostertüte" })).toBeChecked();
  });

  test("switches the reminder off, forgets every tick, and starts again from nobody", async ({
    page,
  }) => {
    await page.goto("/einstellungen");
    await page.getByTestId("campaign-reminder-end-open").click();
    await expect(page.getByTestId("campaign-reminder-end-warning")).toHaveText(
      de.settings.campaignReminder.endWarning("Ostertüte", 1),
    );
    await page.getByTestId("campaign-reminder-end").click();
    await expect(page.getByTestId("campaign-reminder-start")).toBeVisible();
    await expect(page.getByTestId("campaign-reminder-progress")).toHaveCount(0);

    await lookUp(page, NUMBERS.blocked);
    await expect(page.getByTestId("counter-customer")).toBeVisible();
    await expect(box(page)).toHaveCount(0);
    await page.goto(`/kunden/${ids.blocked}`);
    await expect(page.getByTestId("customer-number")).toHaveText(String(NUMBERS.blocked));
    await expect(box(page)).toHaveCount(0);

    await switchOn(page, "Weihnachtstüte");
    await expect(page.getByTestId("campaign-reminder-progress")).toHaveText(
      de.settings.campaignReminder.progress(0, 4),
    );
    await page.goto(`/kunden/${ids.blocked}`);
    await expect(box(page)).not.toBeChecked();
  });
});
