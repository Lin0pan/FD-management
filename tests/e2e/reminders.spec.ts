import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";

/**
 * The reminder trail, end to end: an expired certificate through to the third reminder and the
 * renewal that closes it (tasks/prd-us-06-certificate-reminder.md §US-06.5).
 *
 * The pieces are proved separately — the expiry rule in the domain, the once-per-day guard against
 * fakes and against the real constraint, the controls in US-06.4's browser check. What none of them
 * can see is the *trail*: the same household coming back week after week, the count climbing by
 * exactly one per visit, and nothing else moving. So this spec walks one household through three
 * consecutive distribution days on a pinned clock, logging one reminder each time while the
 * hand-out itself is recorded as normal, and asserts the two ends of the story: a count of 3 leaves
 * the household exactly as served and as active as a count of 0 — archiving is a staff decision
 * (US-10), never this screen's — and the renewed certificate resets the count while the log keeps
 * all three entries.
 *
 * The days follow from the seeded settings alone (`src/infrastructure/prisma/seed.ts`): anchor
 * `2026-W02` = RED, distributions on ISO weekday 4. A RED household's consecutive distribution days
 * are therefore every second Thursday — 08.01., 22.01. and 05.02.2026 — because the Thursday in
 * between belongs to BLUE, where this household would be sent away untouched.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every date
// stays a literal, because what is under test is decided by dates.
faker.seed(20260724);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = "data/e2e-now.txt";

/** The household's three consecutive distribution days: RED Thursdays, one BLUE week apart. */
const DAYS = [
  "2026-01-08T09:00:00.000Z",
  "2026-01-22T09:00:00.000Z",
  "2026-02-05T09:00:00.000Z",
] as const;
/** The Europe/Berlin day keys of {@link DAYS}, as `berlinDayKey` writes them to the reminder log. */
const DAY_KEYS = ["2026-01-08", "2026-01-22", "2026-02-05"] as const;

/** The number this spec owns — clear of the counter's 201–206/239, portions' 211, serve's 221–222. */
const CUSTOMER_NUMBER = 231;

/** Born well before 13 years ago: a grown-up. Comfortably inside the last 13 years: a child. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
const CHILD_BIRTH_DATE = "2020-06-15";
/** Lapsed a week before the first visit, and shown as `31.12.2025` in the verdict. */
const EXPIRED_CERTIFICATE = "2025-12-31";
/** Comfortably after the last pinned day — a renewal the past-date rule has no quarrel with. */
const RENEWED_CERTIFICATE = "2027-06-30";

/**
 * The database the built app is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is spelled out. It is absolute because a relative SQLite url resolves against the schema
 * directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve("data/e2e.db")}` });

/** Make the app believe it is `day`, for every request until the file is rewritten or removed. */
function pinDay(day: string): void {
  writeFileSync(NOW_FILE, day, "utf8");
}

/** Insert the RED, active household with a grown-up, a child, the lapsed certificate and one card. */
async function seedHousehold(): Promise<void> {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();
  const childFirstName = faker.person.firstName();

  await prisma.customer.create({
    data: {
      customerNumber: CUSTOMER_NUMBER,
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
      certificates: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: new Date(`${EXPIRED_CERTIFICATE}T00:00:00.000Z`),
          recordedAt: new Date("2025-01-02T00:00:00.000Z"),
        },
      },
      cards: {
        create: [
          { index: 1, issuedAt: new Date("2025-01-02T00:00:00.000Z"), reason: "FIRST_ISSUE" },
        ],
      },
    },
  });
}

/** The household's row as the two assertions about *state* need it: status and stored count. */
async function householdRow(): Promise<{ status: string; reminderCount: number; id: number }> {
  const customer = await prisma.customer.findFirst({
    where: { customerNumber: CUSTOMER_NUMBER },
    select: { id: true, status: true, reminderCount: true },
  });
  if (customer === null) {
    throw new Error("the seeded household is gone");
  }
  return customer;
}

/** Every reminder-log entry the household holds, oldest first. */
async function reminderRows(): Promise<
  ReadonlyArray<{ loggedOn: string; resultingCount: number }>
> {
  const { id } = await householdRow();
  return prisma.reminderLog.findMany({
    where: { customerId: id },
    select: { loggedOn: true, resultingCount: true },
    orderBy: { loggedOn: "asc" },
  });
}

/** Type the number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(String(CUSTOMER_NUMBER));
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${CUSTOMER_NUMBER}`));
}

/** Record the day's hand-out — the household is *served* on every visit, reminders or not. */
async function serve(page: Page): Promise<void> {
  await expect(page.getByTestId("serve-button")).toBeVisible();
  await page.getByTestId("serve-button").click();
  await expect(page.getByTestId("serve-confirmation")).toBeVisible();
}

const words = de.distribution.certificate;
const verdicts = de.distribution.counter.verdicts;

test.describe.configure({ mode: "serial" });

test.describe("Erinnerungskette bis zur dritten Erinnerung", () => {
  test.beforeAll(async () => {
    await seedHousehold();
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it would freeze February for the settings specs,
    // which save a version stamped *now* and would then assert against the wrong month.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("serves the household despite the lapsed certificate and logs the first reminder", async ({
    page,
  }) => {
    pinDay(DAYS[0]);
    await lookUp(page);

    // The lapsed certificate never withholds food: the verdict clears the hand-out and names the
    // reminder, and the record of being served is written exactly as on any other day.
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED",
    );
    await expect(page.getByTestId("counter-verdict-detail")).toHaveText(
      verdicts.certificateExpired.detail("31.12.2025", 0),
    );
    await serve(page);

    await expect(page.getByTestId("reminder-button")).toBeEnabled();
    await page.getByTestId("reminder-button").click();

    await expect(page.getByTestId("reminder-confirmation")).toHaveText(words.reminder.confirmed(1));
    // For the rest of the day the action is spent, and it says so in place of its own label.
    await expect(page.getByTestId("reminder-button")).toBeDisabled();
    await expect(page.getByTestId("reminder-button")).toHaveText(words.reminder.loggedToday);

    // The disabled state comes from the store, not client memory: a fresh lookup re-reads it.
    await lookUp(page);
    await expect(page.getByTestId("counter-reminder-count")).toHaveText("1");
    await expect(page.getByTestId("reminder-button")).toBeDisabled();
  });

  test("refuses a second reminder attempt on the same day", async ({ page }) => {
    await lookUp(page);
    await expect(page.getByTestId("reminder-button")).toBeDisabled();

    // The greyed button is a courtesy, not the guard: a second counter tab opened before the first
    // reminder was logged would still offer an enabled button. Submitting the form underneath the
    // disabled button is that stale tab's click, and the *server* refuses it.
    await page
      .getByTestId("reminder-button")
      .evaluate((button) => button.closest("form")?.requestSubmit());
    await expect(page.getByTestId("reminder-error")).toHaveText(
      words.reminder.errors.alreadyLogged,
    );

    // The refusal wrote nothing: one entry for the day, and the count still stands at 1.
    expect(await reminderRows()).toEqual([{ loggedOn: DAY_KEYS[0], resultingCount: 1 }]);
    expect((await householdRow()).reminderCount).toBe(1);
  });

  test("offers the action again on the next distribution day and logs the second reminder", async ({
    page,
  }) => {
    pinDay(DAYS[1]);
    await lookUp(page);

    // A new day: yesterday's spent action is an offer again, under its own label.
    await expect(page.getByTestId("reminder-button")).toBeEnabled();
    await expect(page.getByTestId("reminder-button")).toHaveText(words.reminder.submit);

    await serve(page);
    await page.getByTestId("reminder-button").click();
    await expect(page.getByTestId("reminder-confirmation")).toHaveText(words.reminder.confirmed(2));
  });

  test("shows a count of 3 after the third reminder and leaves the household active", async ({
    page,
  }) => {
    pinDay(DAYS[2]);
    await lookUp(page);
    await serve(page);
    await page.getByTestId("reminder-button").click();
    await expect(page.getByTestId("reminder-confirmation")).toHaveText(words.reminder.confirmed(3));

    // Three reminders state a fact, never a consequence: the screen shows the count beside the same
    // serve-and-remind verdict, the status stays active, and nothing anywhere prompts an archive —
    // that judgement is US-10's, made by a person.
    await lookUp(page);
    await expect(page.getByTestId("counter-reminder-count")).toHaveText("3");
    await expect(page.getByTestId("counter-status")).toHaveText(de.customers.status.ACTIVE);
    await expect(page.getByTestId("counter-verdict-detail")).toHaveText(
      verdicts.certificateExpired.detail("31.12.2025", 3),
    );

    const household = await householdRow();
    expect(household.status).toBe("ACTIVE");
    expect(household.reminderCount).toBe(3);
    expect(await reminderRows()).toEqual([
      { loggedOn: DAY_KEYS[0], resultingCount: 1 },
      { loggedOn: DAY_KEYS[1], resultingCount: 2 },
      { loggedOn: DAY_KEYS[2], resultingCount: 3 },
    ]);
  });

  test("resets the displayed count to 0 when the renewed certificate is recorded", async ({
    page,
  }) => {
    await lookUp(page);

    await page.getByTestId("renewal-type").fill("Wohngeldbescheid");
    await page.getByTestId("renewal-valid-until").fill(RENEWED_CERTIFICATE);
    await page.getByTestId("renewal-save").click();

    // The confirmation names the reset count while the revalidated page around it already shows the
    // certificate as valid again.
    await expect(page.getByTestId("renewal-confirmation")).toHaveText(words.renewal.saved);

    // A fresh lookup: the prompt is gone with the reminder action, and the count reads 0.
    await lookUp(page);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    await expect(page.getByTestId("counter-reminder-count")).toHaveText("0");
    await expect(page.getByTestId("certificate-controls")).toHaveCount(0);

    // The renewal appended a certificate and reset the count; the reminder history is untouched —
    // it is the record of what was said, not a balance to clear.
    const { id, reminderCount } = await householdRow();
    expect(reminderCount).toBe(0);
    const certificates = await prisma.certificate.findMany({
      where: { customerId: id },
      select: { validUntil: true },
      orderBy: { recordedAt: "asc" },
    });
    expect(certificates.map((c) => c.validUntil.toISOString().slice(0, 10))).toEqual([
      EXPIRED_CERTIFICATE,
      RENEWED_CERTIFICATE,
    ]);
    expect(await reminderRows()).toHaveLength(3);
  });
});
