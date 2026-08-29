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
 * The customer balance, from the counter to the next week's amount to pay
 * (tasks/prd-us-29-customer-balance.md §US-29.9).
 *
 * The arithmetic is proved in the domain gate and the two use cases against fakes. What no unit test
 * can see is the **carry**: that a household who hands over 1,00 € of 3,00 € on one distribution day
 * is asked for 5,00 € on the next one, because the shortfall travelled through a write, a redirect,
 * a fresh page load and a derivation over the rows that survived. That chain is this spec, and it is
 * the reason the balance is derived rather than stored — a stored one would be proved by a test that
 * merely read back what the same code had written.
 *
 * Four households, each carrying one of the four cases the design turns on:
 *
 * | Number | Household         | Case                                                        |
 * | ------ | ----------------- | ----------------------------------------------------------- |
 * | 341    | 1 grown-up, 1 kid | the spine: part payment, carry, and the removal that undoes it |
 * | 342    | 1 grown-up, 1 kid | a credit smaller than the price — the next hand-out costs less |
 * | 343    | 1 grown-up, 1 kid | a credit larger than the price — the next hand-out costs nothing |
 * | 344    | 4 grown-ups, 3 kids | the cap: an amount to pay *above* the Maximalpreis           |
 *
 * They are **BLUE**, and that is not decoration: `group-walk.spec.ts` runs after this file and
 * asserts that 315 is the highest RED number in the whole shared register, so a RED household seeded
 * on 341 here would fail a spec this one is not allowed to touch. `eggs.spec.ts` sits above 315 for
 * the same reason. Being BLUE decides which Thursdays they may be served on, and nothing else.
 *
 * The days are two BLUE distribution days a fortnight apart, pinned through the clock seam exactly
 * as `age-13.spec.ts` and `reminders.spec.ts` pin theirs. Two days is what the carry needs: one to
 * leave an amount open on, and one to be asked for it again.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every date
// stays a literal, because which group collects and how many heads a household has are decided by
// dates, and both decide the money this spec is about.
faker.seed(20260828);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/**
 * The two distribution days this spec is judged on: Thursday 15.01.2026 and Thursday 29.01.2026.
 *
 * Both follow from the seeded settings alone (`src/infrastructure/prisma/seed.ts`): anchor
 * `2026-W02` = RED and distributions on ISO weekday 4, so the Thursdays of W03 and W05 are BLUE
 * distribution days — which is what makes a BLUE household clear to serve on each of them. In
 * January Berlin is UTC+1, so 09:00 UTC is the 10:00 the confirmations name.
 */
const FIRST_DAY = "2026-01-15T09:00:00.000Z";
const SECOND_DAY = "2026-01-29T09:00:00.000Z";
/** The Berlin wall-clock time both days are pinned to, as `germanTime` renders it on the screen. */
const SERVED_AT = germanTime(new Date(FIRST_DAY));

/** The numbers this spec owns: a band no other spec uses, above the quota of 240. */
const NUMBERS = {
  /** Pays part of what is asked, is asked for the rest a fortnight later, then has it all undone. */
  carry: 341,
  /** Pays 1,00 € above the price, so the next hand-out costs 1,00 € less. */
  smallCredit: 342,
  /** Pays 7,00 € above the price, which is more than the next hand-out costs at all. */
  largeCredit: 343,
  /** Above the Maximalpreis, so what is asked and what the week costs part company. */
  capped: 344,
} as const;

/**
 * What the three ordinary households owe under the seeded policy: 200c per grown-up, 100c per child.
 *
 * The capped household owes `4·200 + 3·100 = 1100` cents per head against a Maximalpreis of 500, so
 * its price is the cap — the figure `price-cap.spec.ts` is written about, borrowed here because a
 * debt on top of a cap is the one case where the amount to pay may exceed the cap (US-29, rule 4).
 */
const PRICE_CENTS = 300;
const CAPPED_PRICE_CENTS = 500;

/** Born well before 13 years ago: grown-ups. Comfortably inside the last 13 years: children. */
const GROWN_UP_BIRTH_DATES = ["1985-02-11", "1987-09-30", "1990-03-04", "1992-11-22"] as const;
const CHILD_BIRTH_DATES = ["2018-04-05", "2020-06-15", "2022-01-20"] as const;
const CERTIFICATE_VALID_UNTIL = "2027-06-30";

/**
 * The database the built app is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is taken from `registers.ts` — the one place that knows which engine this run drives, and
 * therefore which register is behind it. It is resolved to an absolute path because a relative
 * SQLite url resolves against the schema directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(SHARED.database)}` });

function utcMidnight(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** Make the app believe it is `instant`, for every request until the file is removed. */
function pinDay(instant: string): void {
  writeFileSync(NOW_FILE, instant, "utf8");
}

/**
 * Insert one BLUE, active household with a current certificate and the card it was issued.
 *
 * The card prints the household it actually has, so nothing seeded here joins the cards-due list
 * that `reissue.spec.ts` reads after this file.
 */
async function seedHousehold(
  customerNumber: number,
  grownUps: number,
  children: number,
): Promise<number> {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();

  // Idempotent, so a CI retry can re-run this block instead of dying on the unique customer number
  // (tests/e2e/seeding.ts).
  await releaseNumbers(prisma, customerNumber);

  const birthDates = [
    ...GROWN_UP_BIRTH_DATES.slice(0, grownUps),
    ...CHILD_BIRTH_DATES.slice(0, children),
  ];

  const customer = await prisma.customer.create({
    data: {
      customerNumber,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate: utcMidnight(GROWN_UP_BIRTH_DATES[0]),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      group: "BLUE",
      status: "ACTIVE",
      reminderCount: 0,
      notes: "",
      householdMembers: {
        create: birthDates.map((birthDate, index) => ({
          // The applicant is the first row and carries their own name; the rest are the household.
          firstName: index === 0 ? firstName : faker.person.firstName(),
          lastName,
          birthDate: utcMidnight(birthDate),
        })),
      },
      certificates: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: utcMidnight(CERTIFICATE_VALID_UNTIL),
          recordedAt: utcMidnight("2026-01-02"),
        },
      },
      cards: {
        create: {
          customerNumber,
          index: 1,
          issuedAt: utcMidnight("2026-01-02"),
          reason: "FIRST_ISSUE",
          grownUpsAtIssue: grownUps,
          childrenAtIssue: children,
          groupAtIssue: "BLUE",
        },
      },
    },
    select: { id: true },
  });

  return customer.id;
}

/** How many hand-outs a household holds, read straight out of SQLite. */
async function handOutsOf(customerId: number): Promise<number> {
  return prisma.distributionRecord.count({ where: { customerId } });
}

/** Type a number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page, customerNumber: number): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(String(customerNumber));
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${customerNumber}`));
}

/** Hand over `paidCents` for a household that is clear to serve, confirming no overpayment. */
async function serve(page: Page, paidCents: number): Promise<void> {
  await fillSticky(page.getByTestId("serve-amount"), formatEuroAmount(paidCents));
  await page.getByTestId("serve-button").click();
  await expect(page.getByTestId("serve-confirmation")).toBeVisible();
}

const serveWords = de.distribution.serve;
const derived = de.customers.derived;

test.describe.configure({ mode: "serial" });

test.describe("Saldo", () => {
  // Only the two households whose rows are read back out of SQLite need their surrogate ids; the
  // other two are driven entirely through the screen, by the number staff would type.
  let carry: number;
  let smallCredit: number;

  test.beforeAll(async () => {
    pinDay(FIRST_DAY);
    carry = await seedHousehold(NUMBERS.carry, 1, 1);
    smallCredit = await seedHousehold(NUMBERS.smallCredit, 1, 1);
    await seedHousehold(NUMBERS.largeCredit, 1, 1);
    await seedHousehold(NUMBERS.capped, 4, 3);
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving January frozen would be inherited by every spec
    // after this one, and the settings specs save versions stamped *now*.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("asks a household with no history for the bare price and calls the balance settled", async ({
    page,
  }) => {
    await lookUp(page, NUMBERS.carry);

    // Nothing has happened to this household yet, so the three figures agree: the week costs 3,00 €,
    // 3,00 € is what to collect, and the field opens on it. A settled balance is the one that stays
    // a word: „ausgeglichen“, never a signed „0,00 €“.
    await expect(page.getByTestId("counter-price")).toHaveText(formatEuros(PRICE_CENTS));
    await expect(page.getByTestId("counter-amount-to-pay")).toHaveText(formatEuros(PRICE_CENTS));
    await expect(page.getByTestId("counter-balance")).toHaveText(
      derived.balanceValue("SETTLED", 0),
    );
    await expect(page.getByTestId("serve-amount")).toHaveValue(formatEuroAmount(PRICE_CENTS));
  });

  test("leaves the rest open when only part of the amount is handed over", async ({ page }) => {
    await lookUp(page, NUMBERS.carry);
    await serve(page, 100);

    // The record states both halves of the transaction, and the balance beside it has moved to the
    // 2,00 € that did not change hands — in the same render the confirmation landed in.
    await expect(page.getByTestId("already-served-message")).toHaveText(
      serveWords.alreadyServed(SERVED_AT, 100, PRICE_CENTS),
    );
    await expect(page.getByTestId("counter-balance")).toHaveText(
      derived.balanceValue("DEBT", -200),
    );
  });

  test("states the shortfall on the customer record, in the fold and above it", async ({
    page,
  }) => {
    await page.goto(`/kunden/${carry}`);

    // Above the fold, without it being opened: where the household stands.
    await expect(page.getByTestId("record-balance")).toHaveText(derived.balanceValue("DEBT", -200));

    // And inside it, what produced that: what was asked, what was handed over, and the mark that
    // says which of the two is larger. „Gefordert“ is replayed rather than stored, so this row is
    // also the proof that the replay agrees with the figure the counter showed that morning.
    await page.getByTestId("history-open").click();
    await expect(page.getByTestId("history-row")).toHaveCount(1);
    await expect(page.getByTestId("history-asked")).toHaveText(formatEuros(PRICE_CENTS));
    await expect(page.getByTestId("history-paid")).toContainText(formatEuros(100));
    await expect(page.getByTestId("history-standing")).toHaveText(
      de.customers.record.historyStanding("SHORT", -200),
    );
    await expect(page.getByTestId("history-price")).toHaveText(formatEuros(PRICE_CENTS));
  });

  test("refuses an amount above the one asked for until it is confirmed", async ({ page }) => {
    await lookUp(page, NUMBERS.smallCredit);
    await fillSticky(page.getByTestId("serve-amount"), formatEuroAmount(400));
    await page.getByTestId("serve-button").click();

    // The question, not a rejection — and nothing is written while it is being asked, which is the
    // half of the guard a screenshot cannot show.
    await expect(page.getByTestId("serve-error")).toHaveText(
      serveWords.overpayment.question(400, PRICE_CENTS),
    );
    expect(await handOutsOf(smallCredit)).toBe(0);

    // Confirming submits the amount still standing in the field, so what the question named and what
    // is booked cannot drift apart.
    await page.getByTestId("serve-confirm-overpayment").click();
    await expect(page.getByTestId("serve-confirmation")).toBeVisible();
    await expect(page.getByTestId("already-served-message")).toHaveText(
      serveWords.alreadyServed(SERVED_AT, 400, PRICE_CENTS),
    );
    await expect(page.getByTestId("counter-balance")).toHaveText(
      derived.balanceValue("CREDIT", 100),
    );
  });

  test("keeps a credit larger than a week's price as a credit", async ({ page }) => {
    await lookUp(page, NUMBERS.largeCredit);
    await fillSticky(page.getByTestId("serve-amount"), formatEuroAmount(1000));
    await page.getByTestId("serve-button").click();
    await page.getByTestId("serve-confirm-overpayment").click();

    await expect(page.getByTestId("serve-confirmation")).toBeVisible();
    await expect(page.getByTestId("counter-balance")).toHaveText(
      derived.balanceValue("CREDIT", 700),
    );
  });

  test("measures a capped household's balance against the cap it was charged", async ({ page }) => {
    await lookUp(page, NUMBERS.capped);

    // 11,00 € per head, 5,00 € to pay: the cap is what the household is charged, and therefore what
    // the balance is measured against.
    await expect(page.getByTestId("counter-price")).toHaveText(formatEuros(CAPPED_PRICE_CENTS));
    await expect(page.getByTestId("counter-amount-to-pay")).toHaveText(
      formatEuros(CAPPED_PRICE_CENTS),
    );

    await serve(page, 200);
    await expect(page.getByTestId("counter-balance")).toHaveText(
      derived.balanceValue("DEBT", -300),
    );
  });

  test("asks for the week's price plus what is still open, a fortnight later", async ({ page }) => {
    // The carry, and the point of the whole spec. A new distribution day, a fresh page load, and a
    // figure nothing wrote down: 3,00 € for this week plus the 2,00 € left open a fortnight ago.
    pinDay(SECOND_DAY);
    await lookUp(page, NUMBERS.carry);

    await expect(page.getByTestId("counter-amount-to-pay")).toHaveText(formatEuros(500));
    // The week costs what it always cost. The debt is added to what is *asked*, never to the price —
    // the household is not being charged twice for last fortnight's food.
    await expect(page.getByTestId("counter-price")).toHaveText(formatEuros(PRICE_CENTS));
    await expect(page.getByTestId("counter-balance")).toHaveText(
      derived.balanceValue("DEBT", -200),
    );
    // And the field opens on the larger figure, so confirming it settles the household.
    await expect(page.getByTestId("serve-amount")).toHaveValue(formatEuroAmount(500));
  });

  test("reduces the next amount to pay by a credit, to nothing when it covers the price", async ({
    page,
  }) => {
    pinDay(SECOND_DAY);

    // 1,00 € ahead against a 3,00 € week: 2,00 € to collect, and the credit is spent by collecting it.
    await lookUp(page, NUMBERS.smallCredit);
    await expect(page.getByTestId("counter-amount-to-pay")).toHaveText(formatEuros(200));
    await expect(page.getByTestId("counter-price")).toHaveText(formatEuros(PRICE_CENTS));
    await expect(page.getByTestId("counter-balance")).toHaveText(
      derived.balanceValue("CREDIT", 100),
    );

    // 7,00 € ahead against the same week: nothing to collect at all. The amount to pay is floored at
    // zero — DF never hand money back — and the remaining 4,00 € stays a credit for the fortnight
    // after this one.
    await lookUp(page, NUMBERS.largeCredit);
    await expect(page.getByTestId("counter-amount-to-pay")).toHaveText(formatEuros(0));
    await expect(page.getByTestId("counter-balance")).toHaveText(
      derived.balanceValue("CREDIT", 700),
    );
    await expect(page.getByTestId("serve-amount")).toHaveValue(formatEuroAmount(0));
  });

  test("asks a capped household for more than the Maximalpreis when it carries a debt", async ({
    page,
  }) => {
    pinDay(SECOND_DAY);
    await lookUp(page, NUMBERS.capped);

    // The one case where the amount to pay exceeds the cap, and it is not a cap being broken: the
    // cap limits what a *week* costs, and 3,00 € of this figure is a fortnight-old debt.
    await expect(page.getByTestId("counter-amount-to-pay")).toHaveText(formatEuros(800));
    await expect(page.getByTestId("counter-price")).toHaveText(formatEuros(CAPPED_PRICE_CENTS));
  });

  test("puts the balance back when today's hand-out is removed", async ({ page }) => {
    pinDay(SECOND_DAY);
    await lookUp(page, NUMBERS.carry);

    // Settle the household first, so the removal has something to undo: 5,00 € against 5,00 € asked.
    await serve(page, 500);
    await expect(page.getByTestId("counter-balance")).toHaveText(
      derived.balanceValue("SETTLED", 0),
    );

    // The two-step guard, and the warning states in advance where the balance will land.
    await page.getByText(serveWords.correct.remove, { exact: true }).click();
    await expect(page.getByTestId("correct-remove-warning")).toHaveText(
      serveWords.correct.removeConfirm(-200),
    );
    await page.getByTestId("correct-remove").click();

    // The panel-coupling rule (CLAUDE.md §Testing): the balance is asserted on the very screen the
    // removal's confirmation landed on, with no `goto` in between. A balance that had stopped
    // following the records would pass every per-form test in this file and fail here — the whole
    // reason it is derived rather than stored is that a removal moves it for free.
    await expect(page.getByTestId("serve-removed-confirmation")).toHaveText(
      serveWords.correct.removed,
    );
    await expect(page.getByTestId("counter-balance")).toHaveText(
      derived.balanceValue("DEBT", -200),
    );
    await expect(page.getByTestId("counter-amount-to-pay")).toHaveText(formatEuros(500));
    expect(await handOutsOf(carry)).toBe(1);
  });
});
