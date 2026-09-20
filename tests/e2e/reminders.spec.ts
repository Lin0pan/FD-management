import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { foldName } from "@/domain/customer/nameSearch";
import { SHARED } from "./registers";
import { fillDay } from "./day";
import { expectCertificateTypeControlValue, fillCertificateTypeControl } from "./registration-form";
import { releaseNumbers } from "./seeding";
import { endSession, endSessionInHook, startSession } from "./session";

/** `CertificateTypeField`'s id on the counter's own renewal form (`certificate-controls.tsx`). */
const RENEWAL_TYPE = "renewal-type";

/**
 * The reminder trail, end to end (`tasks/prd-us-06-certificate-reminder.md` §US-06.5).
 *
 * The pieces are proved separately. What none of them can see is the *trail*: the same household
 * coming back week after week, the count climbing by exactly one per visit, and nothing else moving.
 * So this walks one household through three consecutive afternoons on a pinned clock and asserts the
 * two ends — a count of 3 leaves them as served and as active as a count of 0, and the renewal
 * resets the count while the log keeps all three entries.
 *
 * **Three afternoons are three sessions**, each started and ended through the real controls: „einmal
 * pro Ausgabe" is what the reminder rule reads now (US-34), so a second Thursday on the calendar
 * would no longer offer the action again. The days are pinned for the dates the certificate and the
 * card are judged on, and because a fortnight apart is what the trail looks like.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every date
// stays a literal, because what is under test is decided by dates.
faker.seed(20260724);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/** The household's three consecutive visits, a fortnight apart as DF's rhythm has them. */
const DAYS = [
  "2026-01-08T09:00:00.000Z",
  "2026-01-22T09:00:00.000Z",
  "2026-02-05T09:00:00.000Z",
] as const;

/**
 * The session each visit was held at, in order — filled by {@link openAfternoon} and read by the
 * assertions on the log, which records the afternoon a reminder was given at and no longer the day.
 */
const afternoons: number[] = [];

/** The number this spec owns — clear of the counter's 201–209/239, allowance's 211, serve's 213–219. */
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
 * path is taken from `registers.ts` — the one place that knows which engine this run drives, and
 * therefore which register is behind it. It is resolved to an absolute path because a relative
 * SQLite url resolves against the schema directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(SHARED.database)}` });

/** Make the app believe it is `day`, for every request until the file is rewritten or removed. */
function pinDay(day: string): void {
  writeFileSync(NOW_FILE, day, "utf8");
}

/** Insert the RED, active household with a grown-up, a child, the lapsed certificate and one card. */
async function seedHousehold(): Promise<void> {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();
  const childFirstName = faker.person.firstName();

  // Idempotent, so a CI retry can re-run this block instead of dying on the

  // unique customer number (tests/e2e/seeding.ts).

  await releaseNumbers(prisma, CUSTOMER_NUMBER);

  await prisma.customer.create({
    data: {
      customerNumber: CUSTOMER_NUMBER,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate: new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
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
          {
            customerNumber: CUSTOMER_NUMBER,
            index: 1,
            issuedAt: new Date("2025-01-02T00:00:00.000Z"),
            reason: "FIRST_ISSUE",
            grownUpsAtIssue: 1,
            childrenAtIssue: 1,
          },
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
  ReadonlyArray<{ sessionId: number; resultingCount: number }>
> {
  const { id } = await householdRow();
  return prisma.reminderLog.findMany({
    where: { customerId: id },
    select: { sessionId: true, resultingCount: true },
    orderBy: { id: "asc" },
  });
}

/**
 * Open the household's next afternoon: end the one running, pin the day, start a RED one.
 *
 * One session per visit is the fixture. The reminder action is spent for the afternoon it was given
 * at (US-34), so this is what offers it again — a new Thursday on its own no longer would.
 */
async function openAfternoon(page: Page, index: number): Promise<void> {
  if (index > 0) {
    await endSession(page);
  }
  pinDay(DAYS[index]);
  await startSession(page, "RED");
  const running = await prisma.distributionSession.findFirst({
    where: { endedAt: null, discardedAt: null },
    select: { id: true },
  });
  if (running === null) {
    throw new Error("the afternoon that was just started is not running");
  }
  afternoons.push(running.id);
}

/** Type the number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(String(CUSTOMER_NUMBER));
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${CUSTOMER_NUMBER}`));
}

/**
 * Record the afternoon's hand-out — the household is *served* on every visit, reminders or not — and
 * come back to them.
 *
 * The write clears the counter (US-32.7), so the certificate controls this spec is about are no
 * longer on the screen the click lands on. „Korrigieren“ in the confirmation is the one-click route
 * back to the household, and it is the route staff take: looking a served household up again is now
 * the ordinary way to reach them.
 */
async function serve(page: Page): Promise<void> {
  await expect(page.getByTestId("serve-button")).toBeVisible();
  await page.getByTestId("serve-button").click();
  await expect(page.getByTestId("serve-recorded-confirmation")).toBeVisible();
  await page.getByTestId("serve-recorded-correct").click();
}

const words = de.distribution.certificate;
const verdicts = de.distribution.counter.verdicts;

test.describe.configure({ mode: "serial" });

test.describe("Erinnerungskette bis zur dritten Erinnerung", () => {
  test.beforeAll(async () => {
    await seedHousehold();
    // A CI retry replays this block, and the ids it collected belong to the attempt that failed.
    afternoons.length = 0;
  });

  test.afterAll(async ({ browser, baseURL }) => {
    // The afternoon goes with the spec: a session left running is state the file sorting after this
    // one would inherit (tests/e2e/session.ts).
    await endSessionInHook({ browser, baseURL });
    // The pinned today goes with the spec: leaving it would freeze February for the settings specs,
    // which save a version stamped *now* and would then assert against the wrong month.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("serves the household despite the lapsed certificate and logs the first reminder", async ({
    page,
  }) => {
    await openAfternoon(page, 0);
    await lookUp(page);

    // The lapsed certificate never withholds food: the verdict clears the hand-out and names the
    // reminder, and the record of being served is written exactly as on any other day.
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE_CERTIFICATE_EXPIRED",
    );
    await expect(page.getByTestId("counter-verdict-headline")).toHaveText(
      verdicts.certificateExpired.headline,
    );
    // The banner is the headline alone; the date it used to recite and the count that starts at
    // zero are rows in the record below, which is where staff act on them.
    await expect(page.getByTestId("counter-verdict-detail")).toHaveCount(0);
    await expect(page.getByTestId("counter-certificate-valid-until")).toHaveText("31.12.2025");
    await expect(page.getByTestId("counter-reminder-count")).toHaveText("0");
    await serve(page);

    await expect(page.getByTestId("reminder-button")).toBeEnabled();
    await page.getByTestId("reminder-button").click();

    await expect(page.getByTestId("reminder-confirmation")).toHaveText(words.reminder.confirmed(1));
    // For the rest of the afternoon the action is spent, and it says so in place of its own label.
    await expect(page.getByTestId("reminder-button")).toBeDisabled();
    await expect(page.getByTestId("reminder-button")).toHaveText(words.reminder.loggedInSession);

    // The disabled state comes from the store, not client memory: a fresh lookup re-reads it.
    await lookUp(page);
    await expect(page.getByTestId("counter-reminder-count")).toHaveText("1");
    await expect(page.getByTestId("reminder-button")).toBeDisabled();
  });

  test("refuses a second reminder attempt at the same afternoon", async ({ page }) => {
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

    // The refusal wrote nothing: one entry for the afternoon, and the count still stands at 1.
    expect(await reminderRows()).toEqual([{ sessionId: afternoons[0], resultingCount: 1 }]);
    expect((await householdRow()).reminderCount).toBe(1);
  });

  test("offers the action again at the next afternoon and logs the second reminder", async ({
    page,
  }) => {
    await openAfternoon(page, 1);
    await lookUp(page);

    // A new afternoon: the spent action is an offer again, under its own label.
    await expect(page.getByTestId("reminder-button")).toBeEnabled();
    await expect(page.getByTestId("reminder-button")).toHaveText(words.reminder.submit);

    await serve(page);
    await page.getByTestId("reminder-button").click();
    await expect(page.getByTestId("reminder-confirmation")).toHaveText(words.reminder.confirmed(2));
  });

  test("shows a count of 3 after the third reminder and leaves the household active", async ({
    page,
  }) => {
    await openAfternoon(page, 2);
    await lookUp(page);
    await serve(page);
    await page.getByTestId("reminder-button").click();
    await expect(page.getByTestId("reminder-confirmation")).toHaveText(words.reminder.confirmed(3));

    // Three reminders state a fact, never a consequence: the screen shows the count, the status
    // stays active, and nothing anywhere prompts an archive — that judgement is US-10's, made by a
    // person.
    //
    // The verdict on this second look-up is ALREADY_SERVED and not the serve-and-remind one
    // asserted before the hand-out (line ~198): since US-32 the afternoon's record outranks the
    // lapsed certificate. What the re-lookup has to prove is that the reminder controls survive
    // that — `CertificateControls` reads `certificateExpired` off the household, not off the
    // verdict kind, so a served household keeps everything it needs to be reminded and renewed.
    await lookUp(page);
    await expect(page.getByTestId("counter-reminder-count")).toHaveText("3");
    await expect(page.getByTestId("counter-status")).toHaveText(de.customers.status.ACTIVE);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "ALREADY_SERVED",
    );
    await expect(page.getByTestId("counter-verdict-headline")).toHaveText(
      verdicts.alreadyServed.headline,
    );
    await expect(page.getByTestId("counter-verdict-detail")).toHaveCount(0);
    await expect(page.getByTestId("reminder-button")).toBeVisible();

    const household = await householdRow();
    expect(household.status).toBe("ACTIVE");
    expect(household.reminderCount).toBe(3);
    expect(await reminderRows()).toEqual([
      { sessionId: afternoons[0], resultingCount: 1 },
      { sessionId: afternoons[1], resultingCount: 2 },
      { sessionId: afternoons[2], resultingCount: 3 },
    ]);
  });

  /**
   * The counter's renewal names the field it refuses, like every other form in the app.
   *
   * It is the same two boxes as the record's renewal, refused by the same rules, and it answered
   * with one unnamed sentence beside the button. `CertificateValidUntilInPast` is the refusal DF
   * actually meet — a wrong year in a date typed at a counter with somebody standing there — and the
   * mark is what says it is the date rather than the type that needs the four characters changed.
   *
   * It runs before the successful renewal below, because that one makes the certificate valid and
   * takes this whole card off the screen. A refusal writes nothing, so it leaves the count at 3.
   */
  test("a renewal refused for a past date marks the date, not the type", async ({ page }) => {
    await lookUp(page);

    await fillCertificateTypeControl(page, RENEWAL_TYPE, "Rentenbescheid");
    await fillDay(page.getByTestId("renewal-valid-until"), "2025-06-30");
    await page.getByTestId("renewal-save").click();

    const refusal = page.getByTestId("renewal-error");
    await expect(refusal).toHaveText(words.renewal.errors.validUntilInPast);
    await expect(refusal).toHaveAttribute("data-tier", "refusal");

    await expect(page.getByTestId("counter-field-error")).toHaveText(
      de.customers.errors.dateInPast,
    );
    await expect(page.getByTestId("renewal-valid-until")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId(RENEWAL_TYPE)).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("renewal-valid-until")).toBeFocused();

    // Both fields still hold what was typed, so only the year is retyped.
    await expectCertificateTypeControlValue(page, RENEWAL_TYPE, "Rentenbescheid");

    // And nothing was written: the count is untouched and no certificate was appended.
    const { reminderCount } = await householdRow();
    expect(reminderCount).toBe(3);
  });

  test("resets the displayed count to 0 when the renewed certificate is recorded", async ({
    page,
  }) => {
    await lookUp(page);

    await fillCertificateTypeControl(page, RENEWAL_TYPE, "Wohngeldbescheid");
    await fillDay(page.getByTestId("renewal-valid-until"), RENEWED_CERTIFICATE);
    await page.getByTestId("renewal-save").click();

    // The confirmation names the reset count while the revalidated page around it already shows the
    // certificate as valid again.
    await expect(page.getByTestId("renewal-confirmation")).toHaveText(words.renewal.saved);

    // A fresh lookup: the prompt is gone with the reminder action, and the count reads 0. The
    // verdict is still the afternoon's — this household was served earlier in the spec and US-32
    // lets that outrank everything below an outdated card — so the evidence that the certificate
    // no longer registers is the absence of its controls, which is the reading that matters anyway.
    await lookUp(page);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "ALREADY_SERVED",
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
