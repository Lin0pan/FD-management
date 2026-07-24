import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { germanTime } from "@/i18n/format";

/**
 * The distribution-day happy path, driven through the built app
 * (tasks/prd-us-05-record-attendance.md §US-05.5).
 *
 * `recordAttendance` is proved case by case against fakes, and the once-per-day constraint against a
 * throwaway SQLite file. What neither can see is the counter loop a staff member actually performs:
 * type a number, read the verdict, press the button, watch the screen switch to today's record and
 * the field re-focus for the next customer. So this spec records a hand-out on the real screen
 * against a real database and asserts the German confirmation, then proves the two things the UI must
 * never let slip — a second hand-out on the same day (the button is simply gone, and only one row
 * exists) and a cleared "Bezahlt" box (the row stores `paid = false`).
 *
 * Two households are seeded straight through Prisma: both RED, active, current certificate, one card.
 * They take numbers in the 220s so the registration and card specs, which allocate the *lowest* free
 * number in the shared `data/e2e.db`, keep the low sequence they assert against, and so they stay
 * clear of the counter spec's 201–206/239 and the portions spec's 211.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every date
// stays a literal, because what is under test is decided by dates.
faker.seed(20260724);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = "data/e2e-now.txt";

/**
 * The day this spec is judged on: Thursday 08.01.2026, 09:00 UTC.
 *
 * It follows from the seeded settings alone (`src/infrastructure/prisma/seed.ts`): anchor `2026-W02`
 * = RED, distributions on ISO weekday 4. So it is a RED distribution day, which is what makes a RED
 * household clear to serve. In January Berlin is UTC+1, so the hand-out is recorded at 10:00 local —
 * the time the confirmation and today's record both name.
 */
const TODAY = "2026-01-08T09:00:00.000Z";
/** The Berlin wall-clock time of {@link TODAY}, as `germanTime` renders it on the screen. */
const SERVED_AT = germanTime(new Date(TODAY));
/** The Europe/Berlin calendar day of {@link TODAY}, as `berlinDayKey` writes it to the record. */
const TODAYS_DAY_KEY = "2026-01-08";

/** The numbers this spec owns. Well clear of the low sequence the other specs consume. */
const NUMBERS = {
  paid: 221,
  unpaid: 222,
} as const;

/** Born well before 13 years ago: a grown-up. Comfortably inside the last 13 years: a child. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
const CHILD_BIRTH_DATE = "2020-06-15";
const VALID_CERTIFICATE = "2027-06-30";

/**
 * The database the built app is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is spelled out. It is absolute because a relative SQLite url resolves against the schema
 * directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve("data/e2e.db")}` });

/** Make the app believe it is {@link TODAY}, for every request until the file is removed. */
function pinToday(): void {
  writeFileSync(NOW_FILE, TODAY, "utf8");
}

/** Insert one RED, active household with a grown-up, a child, a current certificate and one card. */
async function seedHousehold(customerNumber: number): Promise<void> {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();
  const childFirstName = faker.person.firstName();

  await prisma.customer.create({
    data: {
      customerNumber,
      firstName,
      lastName,
      birthDate: new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      group: "RED",
      status: "ACTIVE",
      reminderCount: 0,
      notes: "",
      householdMembers: {
        create: [
          { firstName, lastName, birthDate: new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`) },
          {
            firstName: childFirstName,
            lastName,
            birthDate: new Date(`${CHILD_BIRTH_DATE}T00:00:00.000Z`),
          },
        ],
      },
      certificate: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: new Date(`${VALID_CERTIFICATE}T00:00:00.000Z`),
        },
      },
      cards: {
        create: [
          { index: 1, issuedAt: new Date("2026-01-02T00:00:00.000Z"), reason: "FIRST_ISSUE" },
        ],
      },
    },
  });
}

/** Every distribution record a household holds, found via its surrogate id from the customer number. */
async function recordsFor(
  customerNumber: number,
): Promise<ReadonlyArray<{ paid: boolean; dayKey: string; showedUp: boolean }>> {
  // `customerNumber` is unique only through a hand-written partial index Prisma cannot see, so it is
  // not a `findUnique` key here — `findFirst` reads the single row all the same.
  const customer = await prisma.customer.findFirst({
    where: { customerNumber },
    select: { id: true },
  });
  if (customer === null) {
    return [];
  }
  return prisma.distributionRecord.findMany({
    where: { customerId: customer.id },
    select: { paid: true, dayKey: true, showedUp: true },
  });
}

/** Type a number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page, customerNumber: number): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(String(customerNumber));
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${customerNumber}`));
}

const serve = de.distribution.serve;

test.describe.configure({ mode: "serial" });

test.describe("Ausgabe erfassen", () => {
  test.beforeAll(async () => {
    pinToday();
    await seedHousehold(NUMBERS.paid);
    await seedHousehold(NUMBERS.unpaid);
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it would freeze January for the settings specs,
    // which save a version stamped *now* and would then assert against the wrong month.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("records a paid hand-out and confirms it while switching to today's record", async ({
    page,
  }) => {
    await lookUp(page, NUMBERS.paid);

    // The verdict permits serving, so the button and the pre-checked "Bezahlt" box are offered.
    await expect(page.getByTestId("serve-button")).toBeVisible();
    await expect(page.getByTestId("serve-paid")).toBeChecked();
    await page.getByTestId("serve-button").click();

    // On success the page revalidates: the confirmation names the Berlin time, and the serve action
    // is replaced by today's record — the household is now "already served", and paid.
    await expect(page.getByTestId("serve-confirmation")).toHaveText(serve.confirmed(SERVED_AT));
    await expect(page.getByTestId("already-served")).toBeVisible();
    await expect(page.getByTestId("already-served-message")).toContainText(
      serve.alreadyServed(SERVED_AT),
    );
    await expect(page.getByTestId("already-served-message")).toContainText(serve.paidState.paid);
    // No second serve is possible from here — the button is gone, not merely disabled.
    await expect(page.getByTestId("serve-button")).toHaveCount(0);

    const records = await recordsFor(NUMBERS.paid);
    expect(records).toEqual([{ paid: true, dayKey: TODAYS_DAY_KEY, showedUp: true }]);
  });

  test("prevents a second hand-out on the same day", async ({ page }) => {
    // A staff member types the number again expecting to serve; the screen shows today's record
    // instead of the button, so the queue cannot double-serve — and the database still holds one row.
    await lookUp(page, NUMBERS.paid);

    await expect(page.getByTestId("already-served-message")).toContainText(
      serve.alreadyServed(SERVED_AT),
    );
    await expect(page.getByTestId("serve-button")).toHaveCount(0);

    expect(await recordsFor(NUMBERS.paid)).toHaveLength(1);
  });

  test("stores an unpaid hand-out when the box is cleared", async ({ page }) => {
    await lookUp(page, NUMBERS.unpaid);

    await expect(page.getByTestId("serve-button")).toBeVisible();
    await page.getByTestId("serve-paid").uncheck();
    await page.getByTestId("serve-button").click();

    await expect(page.getByTestId("serve-confirmation")).toHaveText(serve.confirmed(SERVED_AT));
    await expect(page.getByTestId("already-served-message")).toContainText(serve.paidState.unpaid);

    const records = await recordsFor(NUMBERS.unpaid);
    expect(records).toEqual([{ paid: false, dayKey: TODAYS_DAY_KEY, showedUp: true }]);
  });
});
