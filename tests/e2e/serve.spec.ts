import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { germanTime } from "@/i18n/format";
import { foldName } from "@/domain/customer/nameSearch";
import { formatEuroAmount, formatEuros } from "@/domain/money";
import { fillSticky } from "./day";
import { SHARED } from "./registers";
import { releaseNumbers } from "./seeding";

/**
 * The distribution-day happy path, driven through the built app
 * (tasks/prd-us-05-record-attendance.md §US-05.5).
 *
 * `recordAttendance` is proved case by case against fakes, and the once-per-day constraint against a
 * throwaway SQLite file. What neither can see is the counter loop a staff member actually performs:
 * type a number, read the verdict, press the button, watch the screen switch to today's record. So
 * this spec records a hand-out on the real screen against a real database and asserts the German
 * confirmation, then proves the things the UI must never let slip — a second hand-out on the same
 * day (the button is simply gone, and only one row exists), an amount typed over the pre-filled one
 * (the row stores what was handed over, down to `0`), and, since US-32, *what the screen does with
 * the household afterwards*.
 *
 * That last one is the spine of the spec now. A recorded hand-out **clears the counter**: the write
 * navigates, the household leaves the screen and the confirmation stands at the top of the empty one
 * the next person is about to be typed into, with „Korrigieren“ one click back to them. Nothing else
 * clears it — the overpayment question and a saved correction both leave the household standing,
 * because an answer is still owed on the first and the staff member is still working on the second.
 * Each of those is a test here, because each is a way the screen could silently start throwing a
 * household away while someone is still being served.
 *
 * The Betrag field replaced the „Bezahlt" checkbox in US-29.7; the balance's own spine — a part
 * payment carried to the next hand-out — is `balance.spec.ts`'s (US-29.9).
 *
 * Five households are seeded straight through Prisma: all RED, active, current certificate, one card.
 * They take the odd numbers 213–219 and 243 so the registration and card specs, which allocate the
 * *lowest* free number in the shared `data/e2e.db`, keep the low sequence they assert against, and so
 * they stay clear of the counter spec's 201–209/239, the allowance spec's 211, the number-change
 * spec's 221–229, the reminder spec's 231, the registration spec's 232–236 and the block spec's 241.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every date
// stays a literal, because what is under test is decided by dates.
faker.seed(20260724);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

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

/**
 * The numbers this spec owns. Well clear of the low sequence the other specs consume.
 *
 * All five are **odd, and therefore RED** (US-31): a household is in the week its number puts it
 * in, so „seeded RED" is now „seeded on an odd slot" and there is nothing else to set. They have to
 * be RED because everything here happens on a RED distribution day — a household of the other week
 * would be turned away before the Betrag field this spec is about ever rendered.
 */
const NUMBERS = {
  /** Served for the amount the field opens on, which is what staff confirm on an ordinary day. */
  confirmed: 213,
  /** Served for a typed-over `0,00` — a hand-out of nothing, and the record that is then removed. */
  nothing: 215,
  inView: 217,
  /** Served, then reached again through „Korrigieren“ and amended there (US-32.8, R-9 and R-13). */
  corrected: 219,
  /** Served to prove where the cursor is afterwards — the next household is typed, not clicked. */
  focused: 243,
} as const;

/**
 * What one of these households owes, and therefore what the Betrag field opens on: one grown-up and
 * one child under the seeded policy, 200 + 100 cents. None of them carries a balance, so the amount
 * asked for is the bare price. The record stores the amount now rather than a flag (US-29), so a
 * field emptied to `0,00` is a hand-out of nothing and not a missing payment.
 */
const PRICE_CENTS = 300;

/** Born well before 13 years ago: a grown-up. Comfortably inside the last 13 years: a child. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
const CHILD_BIRTH_DATE = "2020-06-15";
const VALID_CERTIFICATE = "2027-06-30";

/**
 * The database the built app is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is taken from `registers.ts` — the one place that knows which engine this run drives, and
 * therefore which register is behind it. It is resolved to an absolute path because a relative
 * SQLite url resolves against the schema directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(SHARED.database)}` });

/** Make the app believe it is {@link TODAY}, for every request until the file is removed. */
function pinToday(): void {
  writeFileSync(NOW_FILE, TODAY, "utf8");
}

/**
 * Insert one RED, active household with a grown-up, a child, a current certificate and one card.
 *
 * @returns the name the confirmation should print for it — since US-32 the hand-out is confirmed on
 * a screen the household has already left, so the sentence has to name *who*, and that name is
 * Faker's rather than a literal.
 */
async function seedHousehold(customerNumber: number): Promise<string> {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();
  const childFirstName = faker.person.firstName();

  // Idempotent, so a CI retry can re-run this block instead of dying on the

  // unique customer number (tests/e2e/seeding.ts).

  await releaseNumbers(prisma, customerNumber);

  await prisma.customer.create({
    data: {
      customerNumber,
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
          validUntil: new Date(`${VALID_CERTIFICATE}T00:00:00.000Z`),
          recordedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      },
      cards: {
        create: [
          {
            customerNumber,
            index: 1,
            issuedAt: new Date("2026-01-02T00:00:00.000Z"),
            reason: "FIRST_ISSUE",
            grownUpsAtIssue: 1,
            childrenAtIssue: 1,
          },
        ],
      },
    },
  });

  return `${firstName} ${lastName}`;
}

/** Every distribution record a household holds, found via its surrogate id from the customer number. */
async function recordsFor(
  customerNumber: number,
): Promise<ReadonlyArray<{ paidCents: number; dayKey: string; showedUp: boolean }>> {
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
    select: { paidCents: true, dayKey: true, showedUp: true },
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
  /** The name each seeded household carries, by customer number: the confirmation prints it. */
  const names: Record<number, string> = {};

  test.beforeAll(async () => {
    pinToday();
    for (const customerNumber of Object.values(NUMBERS)) {
      names[customerNumber] = await seedHousehold(customerNumber);
    }
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it would freeze January for the settings specs,
    // which save a version stamped *now* and would then assert against the wrong month.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("records the pre-filled amount and confirms it on the screen the household has left", async ({
    page,
  }) => {
    await lookUp(page, NUMBERS.confirmed);

    // The verdict permits serving, so the button is offered — with the amount to collect stated
    // above it and already standing in the field, which is the ordinary case: staff confirm it.
    await expect(page.getByTestId("serve-button")).toBeVisible();
    await expect(page.getByTestId("counter-amount-to-pay")).toHaveText(formatEuros(PRICE_CENTS));
    await expect(page.getByTestId("serve-amount")).toHaveValue(formatEuroAmount(PRICE_CENTS));
    await page.getByTestId("serve-button").click();

    // On success the write navigates: the screen comes back to its initial state for the next
    // household, and a confirmation at the top names the one that just left (US-32.7). Every one of
    // the four facts is asserted, because the household is no longer on the screen to supply any of
    // them — a confirmation that dropped the name would leave „3,00 € um 10:00 Uhr" attached to
    // nobody, in front of a staff member who has already turned to the next person.
    await expect(page).toHaveURL(/\/ausgabe\?erfasst=\d+$/);
    const confirmation = page.getByTestId("serve-recorded-confirmation");
    await expect(confirmation).toBeInViewport();
    await expect(confirmation).toContainText(String(NUMBERS.confirmed));
    await expect(confirmation).toContainText(names[NUMBERS.confirmed]);
    await expect(confirmation).toContainText(formatEuros(PRICE_CENTS));
    await expect(confirmation).toContainText(SERVED_AT);
    // The household is gone from the screen, not merely un-servable.
    await expect(page.getByTestId("counter-verdict")).toHaveCount(0);
    await expect(page.getByTestId("already-served")).toHaveCount(0);
    await expect(page.getByTestId("serve-button")).toHaveCount(0);

    const records = await recordsFor(NUMBERS.confirmed);
    expect(records).toEqual([{ paidCents: PRICE_CENTS, dayKey: TODAYS_DAY_KEY, showedUp: true }]);
  });

  test("prevents a second hand-out on the same day", async ({ page }) => {
    // A staff member types the number again expecting to serve; the screen shows today's record
    // instead of the button, so the queue cannot double-serve — and the database still holds one row.
    await lookUp(page, NUMBERS.confirmed);

    await expect(page.getByTestId("already-served-message")).toHaveText(
      serve.alreadyServed(SERVED_AT, PRICE_CENTS, PRICE_CENTS),
    );
    await expect(page.getByTestId("serve-button")).toHaveCount(0);

    expect(await recordsFor(NUMBERS.confirmed)).toHaveLength(1);
  });

  test("stores a hand-out of nothing when the amount is typed over with zero", async ({ page }) => {
    await lookUp(page, NUMBERS.nothing);

    await expect(page.getByTestId("serve-button")).toBeVisible();
    await fillSticky(page.getByTestId("serve-amount"), formatEuroAmount(0));
    await page.getByTestId("serve-button").click();

    await expect(page.getByTestId("serve-recorded-confirmation")).toContainText(formatEuros(0));

    // The balance is deliberately not in the confirmation, so it is read where it is stated: back
    // on the household, which „Korrigieren" reaches in one click.
    await page.getByTestId("serve-recorded-correct").click();
    await expect(page.getByTestId("already-served-message")).toHaveText(
      serve.alreadyServed(SERVED_AT, 0, PRICE_CENTS),
    );
    // The whole price is now open, and the screen says so with a sign in front of the amount.
    await expect(page.getByTestId("counter-balance")).toHaveText(
      de.customers.derived.balanceValue("DEBT", -PRICE_CENTS),
    );

    const records = await recordsFor(NUMBERS.nothing);
    expect(records).toEqual([{ paidCents: 0, dayKey: TODAYS_DAY_KEY, showedUp: true }]);
  });

  test("clears the screen and states the hand-out at the top of it", async ({ page }) => {
    // The opposite of what this spec asserted until US-32. The confirmation used to be read where
    // the button was pressed, two screens down, with the served household still on the page. DF
    // worked real afternoons on that screen: the next person is already at the counter while it
    // still shows the last one. So the write navigates, and the answer is at the top of the empty
    // screen the navigation lands on — which is also where the eye already is.
    await lookUp(page, NUMBERS.inView);
    await page.getByTestId("serve-button").scrollIntoViewIfNeeded();

    await page.getByTestId("serve-button").click();

    await expect(page.getByTestId("serve-recorded-confirmation")).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    // Nothing about the served household is left on the screen.
    await expect(page.getByTestId("counter-verdict")).toHaveCount(0);
    await expect(page.getByTestId("already-served")).toHaveCount(0);
  });

  test("hands the cursor back to an empty Nummer field for the next household", async ({
    page,
  }) => {
    // The half of „the screen returns to its initial state" that no other assertion here can see.
    // The screen coming back *empty* is visible in the DOM; the screen coming back **ready to be
    // typed into** is not, and it is the half the counter is actually driven by — a staff member
    // types the next number without touching the mouse, ~120 times an afternoon.
    //
    // It is gated because it is one prop away from silently vanishing. A `redirect` out of a server
    // action is a *soft* navigation: React reconciles the input that is already in the tree instead
    // of mounting a fresh one, and `autoFocus` fires only on mount. `page.tsx` keys the field on the
    // hand-out just recorded so that it remounts. Delete that key and the field still comes back
    // empty — so every other assertion in this spec goes on passing — while the cursor is left
    // nowhere and `toBeFocused` below is the only thing that says so
    // (`docs/guideline/ui_styling_guide.md` §7).
    await lookUp(page, NUMBERS.focused);

    await page.getByTestId("serve-button").click();

    await expect(page.getByTestId("serve-recorded-confirmation")).toBeVisible();
    await expect(page.getByTestId("counter-input")).toHaveValue("");
    await expect(page.getByTestId("counter-input")).toBeFocused();
  });

  test("comes back to the household through „Korrigieren“ and amends the amount there", async ({
    page,
  }) => {
    // The route staff now take to a record they have just written: the household is off the screen,
    // and the confirmation's own link is the way back to it (R-9). Looking the number up again would
    // work too — that is what the second hand-out test does — but this is the one click.
    await lookUp(page, NUMBERS.corrected);
    await page.getByTestId("serve-button").click();
    await expect(page.getByTestId("serve-recorded-confirmation")).toBeVisible();

    await page.getByTestId("serve-recorded-correct").click();

    // Back on the household, on the ordinary lookup URL — nothing about the correction is special
    // enough to need a screen or a parameter of its own.
    await expect(page).toHaveURL(`/ausgabe?nummer=${NUMBERS.corrected}`);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "ALREADY_SERVED_TODAY",
    );
    await expect(page.getByTestId("already-served-message")).toHaveText(
      serve.alreadyServed(SERVED_AT, PRICE_CENTS, PRICE_CENTS),
    );

    // And the correction is made from there, in the same visit: what a staff member does when the
    // household says the amount was wrong as they walk away (R-13).
    await expect(page.getByTestId("correct-amount")).toHaveValue(formatEuroAmount(PRICE_CENTS));
    await fillSticky(page.getByTestId("correct-amount"), formatEuroAmount(100));
    await page.getByTestId("correct-save").click();

    await expect(page.getByTestId("serve-confirmation")).toHaveText(serve.correct.saved);
    expect(await recordsFor(NUMBERS.corrected)).toEqual([
      { paidCents: 100, dayKey: TODAYS_DAY_KEY, showedUp: true },
    ]);
  });

  test("leaves the household on the screen when a correction is saved", async ({ page }) => {
    // The other half of US-32.7's rule: only a *hand-out* clears the counter. A staff member saving
    // a correction is working on that record — they may correct it twice, or read the balance it
    // just moved — so the screen they are working on must not be taken away from them.
    await lookUp(page, NUMBERS.corrected);

    await fillSticky(page.getByTestId("correct-amount"), formatEuroAmount(200));
    await page.getByTestId("correct-save").click();

    await expect(page.getByTestId("serve-confirmation")).toHaveText(serve.correct.saved);
    // Still the same screen, still the same household, and no hand-out confirmation at the top of
    // it — nothing navigated.
    await expect(page).toHaveURL(`/ausgabe?nummer=${NUMBERS.corrected}`);
    await expect(page.getByTestId("already-served-message")).toHaveText(
      serve.alreadyServed(SERVED_AT, 200, PRICE_CENTS),
    );
    await expect(page.getByTestId("serve-recorded-confirmation")).toHaveCount(0);
  });

  test("removing today's hand-out says so, on a screen the record has left", async ({ page }) => {
    await lookUp(page, NUMBERS.nothing);
    await expect(page.getByTestId("already-served")).toBeVisible();

    // The two-step guard: the closed disclosure has to be opened before the button that deletes
    // exists to be clicked.
    await page.getByText(serve.correct.remove, { exact: true }).click();
    await page.getByTestId("correct-remove").click();

    // The removal destroys the card its answer would have stood in, which is why `correctServe`'s
    // "removed" result was a branch no component could render. It redirects instead, keeping the
    // number that was looked up so the household is still on screen, and the counter states it —
    // in the viewport, because a navigation lands at the top of the page.
    await expect(page).toHaveURL(new RegExp(`nummer=${NUMBERS.nothing}&entfernt=1$`));
    await expect(page.getByTestId("serve-removed-confirmation")).toHaveText(serve.correct.removed);
    await expect(page.getByTestId("serve-removed-confirmation")).toBeInViewport();

    // And the household can be served again today, which is what the sentence promises.
    await expect(page.getByTestId("already-served")).toHaveCount(0);
    await expect(page.getByTestId("serve-button")).toBeVisible();
    expect(await recordsFor(NUMBERS.nothing)).toHaveLength(0);
  });

  test("keeps the household on the screen while the overpayment question is unanswered", async ({
    page,
  }) => {
    // On the household the removal above freed, so this spec seeds no fifth one for it: it is
    // unserved again and owes the bare price.
    await lookUp(page, NUMBERS.nothing);
    await fillSticky(page.getByTestId("serve-amount"), formatEuroAmount(PRICE_CENTS + 200));
    await page.getByTestId("serve-button").click();

    // An answer is owed, so nothing may be cleared: the question, the household and the button that
    // answers it all stand, on the URL the lookup was made on. Clearing here would take the question
    // away from the person who has to answer it — and nothing has been written yet.
    await expect(page.getByTestId("serve-error")).toHaveText(
      serve.overpayment.question(PRICE_CENTS + 200, PRICE_CENTS),
    );
    await expect(page).toHaveURL(`/ausgabe?nummer=${NUMBERS.nothing}`);
    await expect(page.getByTestId("counter-verdict")).toBeVisible();
    await expect(page.getByTestId("serve-confirm-overpayment")).toBeVisible();
    expect(await recordsFor(NUMBERS.nothing)).toHaveLength(0);

    // Only the confirming submission is a recorded hand-out, and only it clears the screen.
    await page.getByTestId("serve-confirm-overpayment").click();
    await expect(page).toHaveURL(new RegExp(`erfasst=${NUMBERS.nothing}$`));
    await expect(page.getByTestId("serve-recorded-confirmation")).toContainText(
      formatEuros(PRICE_CENTS + 200),
    );
    await expect(page.getByTestId("counter-verdict")).toHaveCount(0);
  });
});
