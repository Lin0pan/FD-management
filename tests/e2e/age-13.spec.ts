import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { foldName } from "@/domain/customer/nameSearch";

/**
 * A child turns 13 and every number that depends on it follows, driven through the built app
 * (tasks/prd-us-13-age-13-reclassification.md §US-13.5).
 *
 * Each piece is already proved in isolation: `composition` flips at Berlin midnight in the domain
 * gate, `describeAllowance` resolves portions and price from the counts, `listCardsDueForReissue`
 * compares a card's printed counts against the household today, and `staleCountsReason` names the
 * difference. What none of them can see is the claim the story actually makes — *nobody did
 * anything, and the numbers changed anyway*. That claim spans three screens and a clock, so this
 * spec follows one household across a birthday: read the counts, the portions and the price off the
 * record, move the app's today past the 13th birthday, reload the very same screen, and watch all
 * four move with no request in between having written a thing.
 *
 * The absence is the substance, so it is asserted the way the reissue spec asserts a refusal: one
 * Prisma snapshot of everything the household owns, taken either side of the clock change. If the
 * new numbers came from a write rather than a derivation, the two snapshots differ.
 *
 * The second half is FR-5: the card in the customer's hand is now printed with counts nobody holds
 * any more, and that is *not* a problem to be solved before they are served. So the stale card is
 * presented at the counter and must still be clear to serve, with the note beside the verdict rather
 * than instead of it — and only then does the reissue take the household off the list.
 *
 * One household is seeded straight through Prisma: RED, active, current certificate, one card printed
 * with the counts it really had. It takes number 271, clear of the low sequence the registration and
 * card specs allocate against and of the counter (201–206/239), portions (211), serve (221–222),
 * reminders (231), block (241) and reissue (251) specs in the shared `data/e2e.db`.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every date
// stays a literal, because a birthday, a distribution day and a valid certificate are all dates.
faker.seed(20260728);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = "data/e2e-now.txt";

/**
 * The two days this spec is judged on: Thursday 08.01.2026 and Thursday 22.01.2026, both 09:00 UTC.
 *
 * Both follow from the seeded settings alone (`src/infrastructure/prisma/seed.ts`): anchor `2026-W02`
 * = RED, distributions on ISO weekday 4. 08.01. is the Thursday of W02 and 22.01. the Thursday of
 * W04, so both are RED distribution days — which is what lets the household be looked up and served
 * on either side of the birthday, with the group and the calendar held still and only the age moving.
 */
const BEFORE_BIRTHDAY = "2026-01-08T09:00:00.000Z";
const AFTER_BIRTHDAY = "2026-01-22T09:00:00.000Z";

/** The number this spec owns. */
const CUSTOMER_NUMBER = 271;

/** The household's card number at a given running index, e.g. `271k2`. */
function card(index: number): string {
  return `${CUSTOMER_NUMBER}k${index}`;
}

/** Born well before 13 years ago: a grown-up on either day. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
/** The birthdate the whole spec turns on: 12 on 08.01.2026, 13 from 15.01.2026 onwards. */
const CHILD_BIRTH_DATE = "2013-01-15";
const CERTIFICATE_VALID_UNTIL = "2027-06-30";

/**
 * What the seeded settings make of each household composition.
 *
 * 2 portions and 200c per grown-up, 1 portion and 100c per child. One grown-up and one child is
 * therefore 3 portions at 3,00 €; two grown-ups and no child is 4 at 4,00 €. Both figures move on
 * the birthday, which is the point — a spec where only the counts changed would pass against an app
 * that derived the counts and stored the money.
 */
const BEFORE = { grownUps: "1", children: "1", portions: "3", price: "3,00 €" };
const AFTER = { grownUps: "2", children: "0", portions: "4", price: "4,00 €" };

/**
 * The database the built app is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is spelled out. It is absolute because a relative SQLite url resolves against the schema
 * directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve("data/e2e.db")}` });

/** Make the app believe it is the given instant, for every request until the file is removed. */
function pinNow(instant: string): void {
  writeFileSync(NOW_FILE, instant, "utf8");
}

function utcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * Insert one RED, active household: a grown-up, a child two months short of 13, a current
 * certificate, and a card printed with the counts the household really had at the issue.
 *
 * @returns the surrogate id the record page is addressed by (the URL takes the id, not the number).
 */
async function seedHousehold(): Promise<number> {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();

  const customer = await prisma.customer.create({
    data: {
      customerNumber: CUSTOMER_NUMBER,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate: utcMidnight(GROWN_UP_BIRTH_DATE),
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
          { firstName, lastName, birthDate: utcMidnight(GROWN_UP_BIRTH_DATE) },
          {
            firstName: faker.person.firstName(),
            lastName,
            birthDate: utcMidnight(CHILD_BIRTH_DATE),
          },
        ],
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
          index: 1,
          issuedAt: utcMidnight("2026-01-02"),
          reason: "FIRST_ISSUE",
          // Printed before the birthday, and true when it was printed. Everything this spec asserts
          // about the cards-due list follows from this pair going out of date on its own.
          grownUpsAtIssue: 1,
          childrenAtIssue: 1,
        },
      },
    },
    select: { id: true },
  });

  return customer.id;
}

/**
 * Everything the household owns, as one string.
 *
 * Taken either side of the clock change and compared: the counts, the portions and the price are
 * supposed to move because they are worked out on the request, so *nothing at all* may differ here.
 * Comparing one snapshot rather than field by field means a write nobody thought to check for — a
 * cached count quietly persisted, an audit entry for a reclassification that is not an event — still
 * fails the spec.
 */
async function snapshotHousehold(id: number): Promise<string> {
  const [customer, members, cards, records, auditEntries] = await Promise.all([
    prisma.customer.findUniqueOrThrow({
      where: { id },
      select: { customerNumber: true, status: true, group: true, reminderCount: true },
    }),
    prisma.householdMember.findMany({
      where: { customerId: id },
      orderBy: { id: "asc" },
      select: { birthDate: true },
    }),
    prisma.card.findMany({
      where: { customerId: id },
      orderBy: { index: "asc" },
      select: { index: true, reason: true, grownUpsAtIssue: true, childrenAtIssue: true },
    }),
    prisma.distributionRecord.count({ where: { customerId: id } }),
    prisma.auditEntry.count(),
  ]);
  return JSON.stringify({ customer, members, cards, records, auditEntries });
}

/** Read the record's four derived figures and check them against one of the two expectations. */
async function expectDerived(page: Page, expected: typeof BEFORE): Promise<void> {
  await expect(page.getByTestId("grown-ups")).toHaveText(expected.grownUps);
  await expect(page.getByTestId("children")).toHaveText(expected.children);
  await expect(page.getByTestId("portions")).toHaveText(expected.portions);
  await expect(page.getByTestId("price")).toHaveText(expected.price);
}

/** This household's row on the cards-due list, addressed by the number it owns. */
function dueRow(page: Page): Locator {
  return page.locator(`[data-testid="cards-due-row"][data-customer-number="${CUSTOMER_NUMBER}"]`);
}

/**
 * How many cards the home badge says are due.
 *
 * Read rather than asserted outright: the badge counts the whole register, and the other specs
 * sharing `data/e2e.db` may well have left households on the list. What this spec can claim is that
 * a birthday adds exactly one and a reissue takes it away again, so the figure is only ever compared
 * with itself.
 */
async function badgeCount(page: Page): Promise<number> {
  await page.goto("/");
  const badge = await page.getByTestId("cards-due-badge").innerText();
  const count = Number(badge.split(" ")[0]);
  expect(Number.isInteger(count)).toBe(true);
  return count;
}

/** Type a number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page, query: string): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(query);
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${query}`));
}

test.describe.configure({ mode: "serial" });

test.describe("Umstufung zum 13. Geburtstag", () => {
  let id: number;
  /** The register's cards-due figure before this household joins it. */
  let dueBefore: number;
  /** The household as it stood before the clock moved — nothing here may change afterwards. */
  let beforeSnapshot: string;

  test.beforeAll(async () => {
    pinNow(BEFORE_BIRTHDAY);
    id = await seedHousehold();
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it would freeze January for the settings specs,
    // which save a version stamped *now* and would then assert against the wrong month.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("a household with a 12-year-old counts one grown-up and one child", async ({ page }) => {
    await page.goto(`/kunden/${id}`);
    await expectDerived(page, BEFORE);
    await expect(page.getByTestId("card-number")).toHaveText(card(1));

    // The card prints what the household is, so there is nothing to reissue and nothing to note.
    await expect(dueRow(page)).toHaveCount(0);
    await lookUp(page, card(1));
    await expect(page.getByTestId("counter-stale-card")).toHaveCount(0);

    dueBefore = await badgeCount(page);
    beforeSnapshot = await snapshotHousehold(id);
  });

  test("the numbers follow the 13th birthday with nobody having touched the record", async ({
    page,
  }) => {
    // The only thing that happens between the two readings of the same screen. No form is submitted,
    // no button is pressed, and no row is edited — the app is simply asked again on a later day.
    pinNow(AFTER_BIRTHDAY);

    await page.goto(`/kunden/${id}`);
    await expectDerived(page, AFTER);

    // And the register is byte-for-byte as it was: the four figures above were worked out from the
    // two birthdates on the request, not read from anything a reclassification wrote.
    expect(await snapshotHousehold(id)).toBe(beforeSnapshot);
  });

  test("the card is now printed with counts the household has outgrown", async ({ page }) => {
    await page.goto("/karten-neuausstellung");

    await expect(dueRow(page)).toHaveCount(1);
    const row = dueRow(page);
    await expect(row.getByTestId("cards-due-card-number")).toHaveText(card(1));
    // Both count sets side by side, and the difference named in words rather than as a colour.
    await expect(row.getByTestId("cards-due-counts-on-card")).toHaveText(
      de.customers.derived.countsValue(1, 1),
    );
    await expect(row.getByTestId("cards-due-counts-today")).toHaveText(
      de.customers.derived.countsValue(2, 0),
    );
    await expect(row.getByTestId("cards-due-reason")).toHaveText(de.cardsDue.reasons.AGE_13);

    // The screen says so before it says anything else: a card that has fallen behind can wait.
    await expect(page.getByTestId("cards-due-not-urgent")).toHaveText(de.cardsDue.notUrgent);

    expect(await badgeCount(page)).toBe(dueBefore + 1);
  });

  test("the outdated card is still clear to serve at the counter", async ({ page }) => {
    // Presented exactly as the customer holds it — the piece of card with the old numbers on it.
    await lookUp(page, card(1));

    // FR-5: the verdict is the household's, not the card print's. Nothing about the counts stands
    // between this household and their food.
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    await expect(page.getByTestId("serve-button")).toBeVisible();

    // The figures the hand-out goes by are today's, and the note beside them says which numbers the
    // card still carries — a remark, not a verdict.
    await expect(page.getByTestId("counter-grown-ups")).toHaveText(AFTER.grownUps);
    await expect(page.getByTestId("counter-children")).toHaveText(AFTER.children);
    await expect(page.getByTestId("counter-portions")).toHaveText(AFTER.portions);
    await expect(page.getByTestId("counter-price")).toHaveText(AFTER.price);
    await expect(page.getByTestId("counter-stale-card")).toHaveText(
      de.distribution.counter.staleCard(
        card(1),
        de.customers.derived.countsValue(1, 1),
        de.customers.derived.countsValue(2, 0),
      ),
    );
  });

  test("a reissue prints today's counts and takes the household off the list", async ({ page }) => {
    await page.goto("/karten-neuausstellung");
    const row = dueRow(page);

    // The number staff copy onto the new card is named before the write, because the write removes
    // the row that would otherwise have reported it.
    await row.getByTestId("stale-reissue-open").click();
    await expect(row.getByTestId("stale-reissue-confirm")).toHaveText(
      de.customers.reissue.confirm(card(1), card(2)),
    );
    await row.getByTestId("stale-reissue-submit").click();

    // The row is gone because the new card prints what the household is, not because anything was
    // ticked off: the list is derived on every read.
    await expect(dueRow(page)).toHaveCount(0);
    await expect(page.getByTestId("stale-reissue-error")).toHaveCount(0);
    expect(await badgeCount(page)).toBe(dueBefore);

    await page.goto(`/kunden/${id}`);
    await expect(page.getByTestId("card-number")).toHaveText(card(2));
    await expectDerived(page, AFTER);

    // The new card is the valid one and it says the right thing, so the counter has no note left to
    // make — and the household is served on exactly the same figures as before the reissue.
    await lookUp(page, card(2));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    await expect(page.getByTestId("counter-stale-card")).toHaveCount(0);
    await expect(page.getByTestId("counter-portions")).toHaveText(AFTER.portions);
    await expect(page.getByTestId("counter-price")).toHaveText(AFTER.price);
  });
});
