import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { foldName } from "@/domain/customer/nameSearch";
import { SHARED } from "./registers";
import { fillDay, fillSticky, hydrated } from "./day";
import { releaseNumbers } from "./seeding";

/**
 * The egg allowance from the settings screen to the counter, driven through the built app
 * (tasks/prd-us-28-egg-allowance.md §US-28.9).
 *
 * Every piece is proved in isolation already: `eggsFor` walks the staircase in the domain gate,
 * `createEggRule` refuses an ambiguous or descending one, `describeAllowance` hands the count out
 * with the counts and the price, and the Prisma adapter round-trips the rows. What none of them can
 * see is the claim the story actually makes — *the number a staff member reads off the counter is
 * the one DF typed into the settings screen*. That claim spans a form, a settings version, a use
 * case and three screens, so it is only provable here.
 *
 * The two halves of the story are held apart deliberately:
 *
 * - **The rule counts heads, not ages.** Four households of 2, 3, 5 and 8 people are seeded — the
 *   three thresholds DF stated and the case below all of them — and the household of three is two
 *   grown-ups and one infant, which is the case the rule's wording exists for. A household entitled
 *   to none reads `0`; the assertion is on the *text of the tile*, because a tile that failed to
 *   render would also pass a check for the absence of a figure.
 * - **The rule is read, never built in.** A row is changed on `/einstellungen` and the same counter
 *   for the same household states the new figure; the rule is then emptied — a legitimate setting —
 *   and every household receives none. Both refusals are driven through the real form, where the
 *   thing worth proving is not the sentence but what surrounds it: nothing written, and the typed
 *   rows still on screen to be corrected.
 *
 * The price rides along with every reading, because the eggs are free and the one way that could
 * quietly stop being true is a count leaking into the sum. The household of two — and of three,
 * once the baby is added to it — is priced **under** the seeded Maximalpreis, so its price is free
 * to move and does not; the households of five and eight stand at the cap, which is where a price
 * assertion cannot fail on its own and is asserted for completeness rather than as the proof.
 *
 * ## What this spec leaves behind
 *
 * It saves settings versions, so it **hands the seeded rule back** in its last test — the same
 * courtesy `price-cap.spec.ts` pays with the Maximalpreis, and for the same reason: `settings.spec.ts`
 * runs after it against the shared register and states the rule in force in full.
 *
 * The four households take the **even numbers 332–338**, a band no other spec uses: the counter
 * (201–207, 239), allowance (211), serve (213–217), number change (221–229), reminders (231),
 * registration (232–236), card numbers (237), block (241), reissue (251), age-13 (271),
 * customer-list (281–285), customer-record (291–293), group-progress (301–305), group-walk
 * (311–317) and price-cap (321) specs share the same `data/e2e.db`, and everything here sits above
 * the quota of 240 and clear of the low sequence the allocating specs consume.
 *
 * They are **even, and therefore BLUE** (US-31), which is the same courtesy `balance.spec.ts` pays
 * for the same reason: `group-walk.spec.ts` runs after this file and asserts that 317 is the highest
 * RED number in the whole shared register, so an odd number seeded here would fail a spec this one
 * is not allowed to touch. Nothing here turns on the week — the tiles are read, not served.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every
// birthdate stays a literal, because the counts and the head count are derived from them.
faker.seed(20260825);

/** Born well before 13 years ago: grown-ups on any day this spec could run. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
const SECOND_GROWN_UP_BIRTH_DATE = "1987-09-30";

/**
 * Born comfortably inside the last 13 years: children into the mid-2030s, whenever this runs.
 *
 * Six of them, all different, because the household of eight needs six and two members sharing a
 * birthdate would make a miscount by one invisible in the fixture.
 */
const CHILD_BIRTH_DATES = [
  "2020-06-15",
  "2021-03-02",
  "2022-01-20",
  "2023-05-10",
  "2024-11-08",
  "2025-02-17",
];

/** The baby the live preview adds — an infant, and therefore a person and not a grown-up. */
const INFANT_BIRTH_DATE = "2024-03-05";

const CERTIFICATE_VALID_UNTIL = "2027-06-30";
const CERTIFICATE_RECORDED_AT = "2026-01-02";
const CARD_ISSUED_AT = "2026-01-02";

/** The rule a fresh database starts with — DF's own (`src/infrastructure/prisma/seed.ts`). */
const SEEDED_RULE = [
  { minPersons: 3, eggs: 6 },
  { minPersons: 5, eggs: 12 },
  { minPersons: 8, eggs: 18 },
] as const;

/** What a household comes to on any screen that states all four figures. */
interface Figures {
  readonly grownUps: number;
  readonly children: number;
  readonly eggs: number;
  /** Already in German, because it is compared against what the screen printed. */
  readonly price: string;
}

interface Household extends Figures {
  readonly customerNumber: number;
  /** Every member's birthdate, the applicant's first — the household exactly as it is on file. */
  readonly members: ReadonlyArray<string>;
}

/**
 * The four households, and what the seeded policy makes of each.
 *
 * 200c per grown-up, 100c per child, under a Maximalpreis of 500c. The household of two is 3,00 €
 * and the only one with room under the cap; the other three stand at it, which is what a household
 * of five or more costs under DF's per-head prices and is not this spec's subject (`price-cap.spec.ts`
 * owns the cap itself).
 */
const HOUSEHOLDS = {
  /** Below every threshold: the case that must read `0` rather than nothing at all. */
  two: {
    customerNumber: 332,
    members: [GROWN_UP_BIRTH_DATE, CHILD_BIRTH_DATES[0]],
    grownUps: 1,
    children: 1,
    eggs: 0,
    price: "3,00 €",
  },
  /** Two grown-ups and one infant: three *people*, and the lowest threshold reached. */
  three: {
    customerNumber: 334,
    members: [GROWN_UP_BIRTH_DATE, SECOND_GROWN_UP_BIRTH_DATE, INFANT_BIRTH_DATE],
    grownUps: 2,
    children: 1,
    eggs: 6,
    price: "5,00 €",
  },
  /** The middle step. */
  five: {
    customerNumber: 336,
    members: [GROWN_UP_BIRTH_DATE, SECOND_GROWN_UP_BIRTH_DATE, ...CHILD_BIRTH_DATES.slice(0, 3)],
    grownUps: 2,
    children: 3,
    eggs: 12,
    price: "5,00 €",
  },
  /** The top step, which no larger household ever passes. */
  eight: {
    customerNumber: 338,
    members: [GROWN_UP_BIRTH_DATE, SECOND_GROWN_UP_BIRTH_DATE, ...CHILD_BIRTH_DATES],
    grownUps: 2,
    children: 6,
    eggs: 18,
    price: "5,00 €",
  },
} as const satisfies Record<string, Household>;

const EVERY_HOUSEHOLD = Object.values(HOUSEHOLDS);

/**
 * The household of two once the live preview has added a baby to it.
 *
 * Three people, so the lowest threshold is reached, and 2,00 € + 2 × 1,00 € — still under the cap,
 * which is what makes it the household every later test reads the price off.
 */
const TWO_PLUS_BABY: Figures = { grownUps: 1, children: 2, eggs: 6, price: "4,00 €" };

/**
 * The database the built app is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is taken from `registers.ts` — the one place that knows which engine this run drives, and
 * therefore which register is behind it. It is resolved to an absolute path because a relative
 * SQLite url resolves against the schema directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(SHARED.database)}` });

/** The record page's address per household, filled in once the register knows their ids. */
const recordIds = new Map<number, number>();

function utcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function record(household: Household): string {
  const id = recordIds.get(household.customerNumber);
  // The record is addressed by the surrogate id, not by the customer number, so a household this
  // spec failed to seed would otherwise be looked up at `/kunden/undefined` and fail on a missing
  // tile — nowhere near what went wrong.
  expect(id, `household ${household.customerNumber} was seeded`).toBeDefined();
  return `/kunden/${String(id)}`;
}

/**
 * Insert one BLUE, active household: its members, a current certificate, and a card printed with
 * the counts it really has.
 *
 * The card matters twice over. The counter states a card number, so a household without one cannot
 * be looked up at all; and printing today's counts keeps every household here off the cards-due
 * list, which the reissue spec reads after this one.
 */
async function seedHousehold(household: Household): Promise<number> {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();

  // Idempotent, so a CI retry can re-run this block instead of dying on the unique customer number
  // (tests/e2e/seeding.ts).
  await releaseNumbers(prisma, household.customerNumber);

  const customer = await prisma.customer.create({
    data: {
      customerNumber: household.customerNumber,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate: utcMidnight(household.members[0]),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      status: "ACTIVE",
      reminderCount: 0,
      notes: "",
      householdMembers: {
        // The applicant is the first row, exactly as a registration mirrors them, so every figure
        // this spec reads comes off the birthdates and nothing else.
        create: household.members.map((birthDate, index) => ({
          firstName: index === 0 ? firstName : faker.person.firstName(),
          lastName,
          birthDate: utcMidnight(birthDate),
        })),
      },
      certificates: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: utcMidnight(CERTIFICATE_VALID_UNTIL),
          recordedAt: utcMidnight(CERTIFICATE_RECORDED_AT),
        },
      },
      cards: {
        create: {
          customerNumber: household.customerNumber,
          index: 1,
          issuedAt: utcMidnight(CARD_ISSUED_AT),
          reason: "FIRST_ISSUE",
          grownUpsAtIssue: household.grownUps,
          childrenAtIssue: household.children,
        },
      },
    },
    select: { id: true },
  });

  return customer.id;
}

/**
 * The four figures a screen states, under whichever prefix that screen's testids carry.
 *
 * The eggs are asserted **visible and equal**, never merely equal: `0` and a tile that failed to
 * render are the same absence to a check for the figure's absence, and the whole point of stating a
 * zero is that the counter can see the question was answered.
 */
async function expectTiles(page: Page, prefix: "" | "counter-", expected: Figures): Promise<void> {
  await expect(page.getByTestId(`${prefix}grown-ups`)).toHaveText(String(expected.grownUps));
  await expect(page.getByTestId(`${prefix}children`)).toHaveText(String(expected.children));
  const eggs = page.getByTestId(`${prefix}eggs`);
  await expect(eggs).toBeVisible();
  await expect(eggs).toHaveText(String(expected.eggs));
  await expect(page.getByTestId(`${prefix}price`)).toHaveText(expected.price);
}

/** Look a household up at the counter, as staff do when the number is called across the table. */
async function atCounter(page: Page, household: Household): Promise<void> {
  await page.goto(`/ausgabe?nummer=${household.customerNumber}`);
  await expect(page.getByTestId("counter-customer-number")).toHaveText(
    String(household.customerNumber),
  );
}

/** How many eggs the counter states for a household, with the price it must not have moved. */
async function expectAtCounter(page: Page, household: Household, eggs: number): Promise<void> {
  await atCounter(page, household);
  await expectTiles(page, "counter-", { ...household, eggs });
}

/**
 * Open the settings screen and wait until React owns it.
 *
 * The egg table is `useState` and the save button's confirmation is `useActionState`, so a click
 * that lands before hydration submits the form natively and comes back on a page holding no state
 * to have put „Gespeichert." anywhere — the window `settings.spec.ts` documents at length.
 */
async function openSettings(page: Page): Promise<void> {
  await page.goto("/einstellungen");
  // `#pricePerGrownUp` stands in for the form: hydration is per component, and the egg table and
  // the save button belong to the one that owns that input.
  await hydrated(page.locator("#pricePerGrownUp"));
}

async function save(page: Page): Promise<void> {
  await page.getByRole("button", { name: de.settings.save, exact: true }).click();
}

/** Save and expect it to have been taken. */
async function saveAccepted(page: Page): Promise<void> {
  await save(page);
  await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);
}

/** The threshold and the egg count of one row of the table, by the ids the cells carry. */
function threshold(page: Page, index: number): Locator {
  return page.locator(`#eggThreshold-${index}`);
}

function eggCount(page: Page, index: number): Locator {
  return page.locator(`#eggCount-${index}`);
}

/** The rule as the table currently shows it, row by row and top to bottom. */
async function expectRule(
  page: Page,
  rows: ReadonlyArray<{ minPersons: number; eggs: number }>,
): Promise<void> {
  await expect(page.getByTestId("egg-rule-row")).toHaveCount(rows.length);
  for (const [index, row] of rows.entries()) {
    await expect(threshold(page, index)).toHaveValue(String(row.minPersons));
    await expect(eggCount(page, index)).toHaveValue(String(row.eggs));
  }
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.configure({ mode: "serial" });

test.describe("Eier", () => {
  test.beforeAll(async () => {
    for (const household of EVERY_HOUSEHOLD) {
      recordIds.set(household.customerNumber, await seedHousehold(household));
    }
  });

  test("the seeded rule states the eggs at the counter and on the record", async ({ page }) => {
    // The three thresholds DF stated and the case below all of them, read off both screens a staff
    // member ever reads them from. Nothing here was typed in: the head count comes off the member
    // rows, and which step it reaches comes off the stored rule.
    for (const household of EVERY_HOUSEHOLD) {
      await page.goto(record(household));
      await expectTiles(page, "", household);

      await atCounter(page, household);
      await expectTiles(page, "counter-", household);
    }
  });

  test("a household below every threshold is told so with a nought", async ({ page }) => {
    // Asserted apart from the loop above because it is the one reading that could be produced by a
    // screen that had not answered the question at all — and it is asserted on the *text of the
    // tile*, on both screens.
    const household = HOUSEHOLDS.two;

    await page.goto(record(household));
    await expect(page.getByTestId("eggs")).toHaveText("0");

    await atCounter(page, household);
    await expect(page.getByTestId("counter-eggs")).toHaveText("0");
  });

  test("two grown-ups and one infant receive the eggs of a household of three", async ({
    page,
  }) => {
    // The case the rule's wording exists for: the baby is not a grown-up and never will be counted
    // as one, and yet they are a *person*, so the household reaches the first step. A rule that had
    // been implemented against the grown-up count would say 0 here and pass every other test above.
    const household = HOUSEHOLDS.three;

    await page.goto(record(household));
    await expect(page.getByTestId("grown-ups")).toHaveText("2");
    await expect(page.getByTestId("children")).toHaveText("1");
    await expect(page.getByTestId("eggs")).toHaveText("6");

    await expectAtCounter(page, household, 6);
  });

  test("the eggs are on neither the customer list nor the card view", async ({ page }) => {
    // Not an oversight but a decision (§US-28.8): the card is designed and printed in a separate
    // system, and the eggs are handed over at the counter. The list is a register, not a hand-out
    // sheet — it states the price, which is what staff answer questions about on the phone.
    const household = HOUSEHOLDS.five;
    const label = de.customers.derived.eggs;

    await page.goto("/kunden");
    const row = page.locator(`[data-customer-number="${household.customerNumber}"]`);
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("customer-row-price")).toHaveText(household.price);
    await expect(page.getByTestId("eggs")).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: label, exact: true })).toHaveCount(0);

    await page.goto(`${record(household)}/karte`);
    // The card states the two counts it was printed with, and stops there.
    await expect(page.getByTestId("grown-ups")).toHaveText(String(household.grownUps));
    await expect(page.getByTestId("eggs")).toHaveCount(0);
    await expect(page.getByRole("main").getByText(label, { exact: true })).toHaveCount(0);
  });

  test("a baby added in the editor moves the eggs before the save", async ({ page }) => {
    // FR-1 for the fourth tile: the consequence of an edit is visible before it is committed. The
    // household of two receives nothing; the baby takes them to three people and therefore to six
    // eggs, with the price moving under the cap at the same time — one edit, both figures.
    const household = HOUSEHOLDS.two;

    await page.goto(record(household));
    await expectTiles(page, "", household);

    await page.getByTestId("add-member").click();
    await page.getByTestId("member-first-name-2").fill(faker.person.firstName());
    await page.getByTestId("member-last-name-2").fill(faker.person.lastName());
    await fillDay(page.getByTestId("member-birth-date-2"), INFANT_BIRTH_DATE);

    // Nothing saved yet, and the panel already says what the household will come to.
    await expectTiles(page, "", TWO_PLUS_BABY);

    await page.getByTestId("household-submit").click();
    await expect(page.getByTestId("household-saved")).toBeVisible();

    // And the server agrees with the browser on a fresh request, on both screens: the preview and
    // the save put the same rule to the same head count.
    await page.goto(record(household));
    await expectTiles(page, "", TWO_PLUS_BABY);

    await atCounter(page, household);
    await expectTiles(page, "counter-", TWO_PLUS_BABY);
  });

  test("two rows at the same threshold are refused and nothing is saved", async ({ page }) => {
    // Neither row is wrong on its own, so neither is marked: the sentence by the button names the
    // threshold instead, which is the only thing that makes the pair findable in the table.
    await openSettings(page);
    await expectRule(page, SEEDED_RULE);

    await page.getByTestId("add-egg-row").click();
    await fillSticky(threshold(page, 3), "5");
    await fillSticky(eggCount(page, 3), "20");
    await save(page);

    const refusal = page.getByTestId("settings-error");
    await expect(refusal).toHaveText(de.settings.eggs.duplicateThreshold(5));
    // Amber, not red: nothing is broken, two rows need reconciling.
    await expect(refusal).toHaveAttribute("data-tier", "refusal");
    await expect(page.getByTestId("settings-field-error")).toHaveCount(0);

    // Every typed row is still on screen, the new one included — a refusal that rewound the table
    // to the stored rule would throw away the work and hide what was wrong with it.
    await expectRule(page, [...SEEDED_RULE, { minPersons: 5, eggs: 20 }]);

    // Kept on screen, written nowhere.
    await page.reload();
    await expectRule(page, SEEDED_RULE);
  });

  test("a bigger household awarded fewer eggs is refused and nothing is saved", async ({
    page,
  }) => {
    // The other half of the staircase. Same shape as the refusal above and stated the same way,
    // because it is the same kind of fault: two rows that contradict each other.
    await openSettings(page);

    await fillSticky(eggCount(page, 2), "6");
    await save(page);

    const refusal = page.getByTestId("settings-error");
    await expect(refusal).toHaveText(de.settings.eggs.eggsNotIncreasing(8, 6, 5, 12));
    await expect(refusal).toHaveAttribute("data-tier", "refusal");
    await expect(page.getByTestId("settings-field-error")).toHaveCount(0);

    await expectRule(page, [
      { minPersons: 3, eggs: 6 },
      { minPersons: 5, eggs: 12 },
      { minPersons: 8, eggs: 6 },
    ]);

    await page.reload();
    await expectRule(page, SEEDED_RULE);

    // And the counter is untouched by a refused save, which is the half of "nothing was written"
    // that matters at the table.
    await expectAtCounter(page, HOUSEHOLDS.eight, 18);
  });

  test("the counter reads the rule rather than a staircase of its own", async ({ page }) => {
    // The assertion the whole file exists for. Six eggs at three people is DF's number today and
    // nothing more than that: change the row, and the very same counter for the very same household
    // states the new one on the next request.
    await openSettings(page);
    await fillSticky(eggCount(page, 0), "8");
    await saveAccepted(page);

    // The two households that reach the first step and no further, and the two above it, which the
    // edit must leave exactly where they were.
    await atCounter(page, HOUSEHOLDS.two);
    await expectTiles(page, "counter-", { ...TWO_PLUS_BABY, eggs: 8 });
    await expectAtCounter(page, HOUSEHOLDS.three, 8);
    await expectAtCounter(page, HOUSEHOLDS.five, 12);
    await expectAtCounter(page, HOUSEHOLDS.eight, 18);
  });

  test("an emptied rule saves, and every household then receives none", async ({ page }) => {
    // No rows at all is a configuration DF may want — the eggs stop for a while — and not an
    // unfinished form. So it saves, it reads back as words rather than as a blank stretch of
    // screen, and every household is told `0` rather than nothing.
    await openSettings(page);
    for (let removals = 0; removals < SEEDED_RULE.length; removals += 1) {
      // The remove controls renumber on every removal, so the first row is clicked away repeatedly.
      await page.getByTestId("remove-egg-row-0").click();
    }
    await expect(page.getByTestId("egg-rule-empty")).toHaveText(de.settings.eggs.empty);
    await saveAccepted(page);

    await page.reload();
    await expect(page.getByTestId("egg-rule-row")).toHaveCount(0);
    await expect(page.getByTestId("egg-rule-empty")).toHaveText(de.settings.eggs.empty);

    // Every household, including the two that stood on the top step a moment ago — and every price
    // exactly where the per-head rule and the Maximalpreis had it. The eggs are free, and the one
    // way that could quietly stop being true is a count reaching the sum.
    await atCounter(page, HOUSEHOLDS.two);
    await expectTiles(page, "counter-", { ...TWO_PLUS_BABY, eggs: 0 });
    await expectAtCounter(page, HOUSEHOLDS.three, 0);
    await expectAtCounter(page, HOUSEHOLDS.five, 0);
    await expectAtCounter(page, HOUSEHOLDS.eight, 0);
  });

  test("the rule DF stated is typed back in, in any order, and sorts itself", async ({ page }) => {
    // The register is handed on with DF's own rule, which `settings.spec.ts` states in full after
    // this file — the courtesy `price-cap.spec.ts` pays with the Maximalpreis.
    //
    // Typed top step first, because staff type rows in whatever order they think of them and the
    // software is what puts them in order: the table keeps the typed order while somebody is in it
    // (re-sorting would move the row under the cursor) and the reloaded screen shows the sorted
    // result.
    await openSettings(page);
    const typed = [...SEEDED_RULE].reverse();
    for (const [index, row] of typed.entries()) {
      await page.getByTestId("add-egg-row").click();
      await fillSticky(threshold(page, index), String(row.minPersons));
      await fillSticky(eggCount(page, index), String(row.eggs));
    }
    await expectRule(page, typed);
    await saveAccepted(page);

    await page.reload();
    await expectRule(page, SEEDED_RULE);

    // And the counter is back where the first test in this file found it.
    await atCounter(page, HOUSEHOLDS.two);
    await expectTiles(page, "counter-", TWO_PLUS_BABY);
    await expectAtCounter(page, HOUSEHOLDS.eight, 18);
  });
});
