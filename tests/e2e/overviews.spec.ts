import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { foldName } from "@/domain/customer/nameSearch";
import { clearRegister } from "@/infrastructure/prisma/test-support";
import { ISOLATED } from "./registers";
import { endSession, endSessionInHook, startSession } from "./session";

/**
 * Two entry points, one count (`tasks/prd-us-38-overviews-and-to-dos.md` §US-38.5).
 *
 * Start's „Zu erledigen“ and the Übersichten tiles read the same use cases, which the unit suite
 * proves of the fakes. What only the screens can show is that the pages have not drifted apart:
 * the same number on Start, on Übersichten and on the Kunden hub, and a to-do that leaves once the
 * card is reissued.
 *
 * **It owns a register** (`ISOLATED_SPECS`): „nothing due" and „two afternoons" are claims about
 * the whole of one, which the shared register's other specs would falsify.
 */

// A fixed seed so a failure is reproducible; only the name and address come from Faker.
faker.seed(20260929);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at for the isolated server. */
const NOW_FILE = ISOLATED.now;

/** Now, read once. The spec runs on the real clock — nothing it asserts depends on the day. */
const NOW = new Date();
const VALID_CERTIFICATE = new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000);
const GROWN_UP_BIRTH_DATE = new Date("1985-02-11T00:00:00.000Z");

/** The household whose card is out of date. Odd, so RED; the group plays no part here. */
const CUSTOMER_NUMBER = 1;

/** The isolated server's database, opened a second time (see `session-detail.spec.ts`). */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(ISOLATED.database)}` });

/**
 * Insert a one-person household whose only card printed **two** grown-ups — due for reissue
 * (US-13, „Haushalt geändert") from the moment it exists.
 */
async function seedHouseholdWithStaleCard(): Promise<void> {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();

  await prisma.customer.create({
    data: {
      customerNumber: CUSTOMER_NUMBER,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate: GROWN_UP_BIRTH_DATE,
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      status: "ACTIVE",
      reminderCount: 0,
      notes: "",
      householdMembers: { create: [{ firstName, lastName, birthDate: GROWN_UP_BIRTH_DATE }] },
      certificates: {
        create: { type: "Jobcenter-Bescheid", validUntil: VALID_CERTIFICATE, recordedAt: NOW },
      },
      cards: {
        create: [
          {
            customerNumber: CUSTOMER_NUMBER,
            index: 1,
            issuedAt: NOW,
            reason: "FIRST_ISSUE",
            grownUpsAtIssue: 2,
            childrenAtIssue: 0,
          },
        ],
      },
    },
  });
}

/** The two tiles' figures, read off Übersichten. */
async function expectTiles(
  page: Page,
  { cardsDue, pastSessions }: { cardsDue: number; pastSessions: number },
): Promise<void> {
  await page.goto("/uebersichten");
  await expect(page.getByTestId("overview-cards-due")).toHaveText(String(cardsDue));
  await expect(page.getByTestId("overview-past-sessions")).toHaveText(String(pastSessions));
}

/** Every tab marked on the current page — one, and only one, is the claim. */
async function markedSections(page: Page): Promise<ReadonlyArray<string>> {
  return page
    .getByTestId("main-nav")
    .locator('a[aria-current="page"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("data-testid") ?? ""));
}

test.describe.configure({ mode: "serial" });

test.describe("Übersichten und Zu erledigen", () => {
  test.beforeAll(async () => {
    // The real clock, taken back: an earlier spec on this server may have died with a pin in place.
    rmSync(NOW_FILE, { force: true });
    // Emptied, because every figure below is the whole register's — and a CI retry replays this.
    await clearRegister(prisma);
  });

  test.afterAll(async ({ browser, baseURL }) => {
    await endSessionInHook({ browser, baseURL });
    await prisma.$disconnect();
  });

  test("leaves „Zu erledigen“ off Start while nothing is due, and shows the tile at 0", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("to-dos")).toHaveCount(0);

    await expectTiles(page, { cardsDue: 0, pastSessions: 0 });
  });

  test("counts one card due the same on Start, Übersichten and the Kunden hub", async ({
    page,
  }) => {
    await seedHouseholdWithStaleCard();

    await page.goto("/");
    await expect(page.getByTestId("to-dos")).toBeVisible();
    await expect(page.getByTestId("to-do-cards-due-count")).toHaveText("1");

    await expectTiles(page, { cardsDue: 1, pastSessions: 0 });

    await page.goto("/kunden");
    await expect(page.getByTestId("cards-due-badge")).toHaveText(
      de.customerList.actions.cardsDueBadge(1),
    );
  });

  test("leads from the Start row to the list, marked as Übersichten", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("to-do-cards-due").click();

    await expect(page).toHaveURL(/\/karten-neuausstellung$/);
    await expect(page.getByRole("heading", { level: 1, name: de.cardsDue.heading })).toBeVisible();
    expect(await markedSections(page)).toEqual(["nav-overviews"]);
  });

  test("drops the to-do from Start once the card is reissued", async ({ page }) => {
    await page.goto("/karten-neuausstellung");
    const row = page.getByTestId("cards-due-row");
    await expect(row).toHaveCount(1);
    await row.getByTestId("stale-reissue-open").click();
    await row.getByTestId("stale-reissue-submit").click();
    await expect(row).toHaveCount(0);

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("to-dos")).toHaveCount(0);

    await expectTiles(page, { cardsDue: 0, pastSessions: 0 });
  });

  test("counts the afternoons the list shows, the running one included", async ({ page }) => {
    await startSession(page, "RED");
    await endSession(page);
    await startSession(page, "BLUE");

    await expectTiles(page, { cardsDue: 0, pastSessions: 2 });
    await page.goto("/ausgabetermine");
    await expect(page.getByTestId("past-session-row")).toHaveCount(2);
  });

  test("counts no discarded afternoon", async ({ page }) => {
    await endSession(page);
    await startSession(page, "RED");
    await page.getByTestId("session-discard-open").click();
    await page.getByTestId("session-discard-submit").click();
    await expect(page.getByTestId("session-start-submit")).toBeVisible();

    await expectTiles(page, { cardsDue: 0, pastSessions: 2 });
    await page.goto("/ausgabetermine");
    await expect(page.getByTestId("past-session-row")).toHaveCount(2);
  });
});
