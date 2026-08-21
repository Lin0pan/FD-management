import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { foldName } from "@/domain/customer/nameSearch";
import { SHARED } from "./registers";
import { typedDay } from "./day";

/**
 * The Maximalpreis from the settings screen to the counter
 * (tasks/prd-us-26-price-cap.md §US-26.7 and §US-26.8).
 *
 * This is the scenario the whole PRD exists for, and it is the one thing the unit gates cannot see.
 * `priceFor` is proved to return `min(sum, cap)` in the domain gate, and the settings round trip in
 * `settings.spec.ts`. What neither can answer is whether **every screen that quotes a price reaches
 * that function** — the counter, the customer record, the customer list and the browser-side
 * household editor each derive the figure for themselves, and a fourth caller that multiplied the
 * per-head prices by the counts itself would be invisible to ESLint, to the type system and to both
 * gates. So this spec seeds DF's own example — four grown-ups and three children, owing 11,00 € per
 * head under a Maximalpreis of 5,00 € — and reads the number off all four.
 *
 * The other half is that the cap is a *setting* and not a constant. The same household is priced
 * again with the cap cleared and states 11,00 € everywhere, which no hard-coded 5,00 € could do,
 * and the portions are asserted unmoved across both: the cap caps money, not food.
 *
 * And the third: a hand-out recorded under one cap keeps its price when the cap later changes. The
 * `priceCents` on the distribution record is asserted **in the database**, because the row is what
 * outlives the policy — the settings history is how the software can still explain it.
 *
 * The household takes customer number 321, a band no other spec uses, and it is well above the
 * quota of 240 so it never appears in the /kunden/neu number pool the registration specs assert
 * against. Its card prints the household it actually has, so it stays off the cards-due list that
 * the reissue spec reads.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. The
// birthdates stay literals, because the counts the price is derived from come from them.
faker.seed(20260807);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/**
 * The day the hand-out is recorded on: Thursday 08.01.2026.
 *
 * It follows from the seeded settings alone (`src/infrastructure/prisma/seed.ts`): anchor `2026-W02`
 * = RED, distributions on ISO weekday 4. So it is a distribution day and the group collecting is
 * RED, which is what makes this RED household clear to serve.
 */
const TODAY = "2026-01-08T09:00:00.000Z";

/** The customer number this spec owns — clear of every other band, and above the quota of 240. */
const CUSTOMER_NUMBER = 321;

/**
 * Four grown-ups and three children, the household §US-26 is written about.
 *
 * The first grown-up is the applicant, mirrored as a household member row exactly as a registration
 * writes it. Every birthdate is far from the 13th-birthday boundary in both directions, because
 * three of these specs run against the *wall* clock (see below) and the counts must not depend on
 * the day the suite happens to run.
 */
const GROWN_UP_BIRTH_DATES = ["1985-02-11", "1987-09-30", "1990-03-04", "1992-11-22"] as const;
const CHILD_BIRTH_DATES = ["2018-04-05", "2020-06-15", "2022-01-20"] as const;
/** The child added in the household editor to prove the portions still rise above the cap. */
const EXTRA_CHILD_BIRTH_DATE = "2024-03-08";
const CERTIFICATE_VALID_UNTIL = "2027-06-30";

/**
 * What the household comes to under the seeded policy — 2 portions and 200c per grown-up, 1 portion
 * and 100c per child, Maximalpreis 500c.
 *
 * `4·2 + 3·1 = 11` portions and `4·200 + 3·100 = 1100` cents per head. The cap is what stands
 * between those 11,00 € and what DF actually collects, and the two figures share the digits `11` on
 * purpose — that is DF's own arithmetic, not a coincidence to be tidied away.
 */
const PORTIONS = "11";
const CAPPED_PRICE = "5,00 €";
const UNCAPPED_PRICE = "11,00 €";
/** The cap in cents, as the distribution record must store it. */
const CAPPED_PRICE_CENTS = 500;
/** The portions after the extra child joins in the editor — one more, while the price does not move. */
const PORTIONS_WITH_EXTRA_CHILD = "12";

/** The Maximalpreis field on the settings screen, and the value the register is handed back at. */
const CAP_LABEL = de.settings.fields.priceCap;
const SEEDED_CAP = "5,00";

/**
 * The database the built app is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is taken from `registers.ts` — the one place that knows which engine this run drives, and
 * therefore which register is behind it. It is resolved to an absolute path because a relative
 * SQLite url resolves against the schema directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(SHARED.database)}` });

function utcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Make the app believe it is {@link TODAY}, for every request until the file is removed. */
function pinToday(): void {
  writeFileSync(NOW_FILE, TODAY, "utf8");
}

/** Hand the wall clock back, so the settings versions saved below are stamped like every other. */
function unpinToday(): void {
  rmSync(NOW_FILE, { force: true });
}

/** Insert the household: RED, active, a current certificate and the card it was issued. */
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
      birthDate: utcMidnight(GROWN_UP_BIRTH_DATES[0]),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      group: "RED",
      status: "ACTIVE",
      reminderCount: 0,
      notes: "",
      householdMembers: {
        create: [...GROWN_UP_BIRTH_DATES, ...CHILD_BIRTH_DATES].map((birthDate, index) => ({
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
          customerNumber: CUSTOMER_NUMBER,
          index: 1,
          issuedAt: utcMidnight("2026-01-02"),
          reason: "FIRST_ISSUE",
          // The printed card matches the household it belongs to, so this spec adds no row to the
          // cards-due list the reissue spec reads after it.
          grownUpsAtIssue: GROWN_UP_BIRTH_DATES.length,
          childrenAtIssue: CHILD_BIRTH_DATES.length,
          groupAtIssue: "RED",
        },
      },
    },
    select: { id: true },
  });

  return customer.id;
}

/** Type the household's number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(String(CUSTOMER_NUMBER));
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${CUSTOMER_NUMBER}`));
}

/**
 * The three server-rendered screens that quote a price, each asserted to state the same one.
 *
 * The absence is asserted alongside it and scoped to the block the price stands in: a screen that
 * quoted 11,00 € *beside* the capped figure — as an explanation, or because a second derivation
 * disagreed — would pass a check on the figure alone. The counter is read through the record card
 * rather than the page, because the week banner and the group list live on the same screen.
 */
async function expectQuoted(page: Page, id: number, price: string, absent: string): Promise<void> {
  await lookUp(page);
  await expect(page.getByTestId("counter-portions")).toHaveText(PORTIONS);
  await expect(page.getByTestId("counter-price")).toHaveText(price);
  await expect(page.getByTestId("counter-customer")).not.toContainText(absent);

  await page.goto(`/kunden/${id}`);
  await expect(page.getByTestId("portions")).toHaveText(PORTIONS);
  await expect(page.getByTestId("price")).toHaveText(price);

  // The list row is addressed by its number rather than found by a search: the surname comes from
  // Faker and the shared register holds other specs' households, so the number is the only thing
  // that cannot collide.
  await page.goto("/kunden");
  const row = page.locator(`[data-customer-number="${CUSTOMER_NUMBER}"]`);
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId("customer-row-portions")).toHaveText(PORTIONS);
  await expect(row.getByTestId("customer-row-price")).toHaveText(price);
  await expect(row).not.toContainText(absent);
}

/**
 * Save a Maximalpreis on the settings screen, `""` to remove it.
 *
 * Each save starts from a fresh page load, which is what keeps two of them in a row honest: a
 * successful save clears the form, and the revalidated render that does it can otherwise land after
 * the next `fill`.
 */
async function saveCap(page: Page, value: string): Promise<void> {
  await page.goto("/einstellungen");
  await page.getByLabel(CAP_LABEL, { exact: true }).fill(value);
  await page.getByRole("button", { name: de.settings.save, exact: true }).click();
  await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);
}

test.describe.configure({ mode: "serial" });

test.describe("Maximalpreis", () => {
  let id: number;

  test.beforeAll(async () => {
    pinToday();
    id = await seedHousehold();
  });

  test.afterAll(async () => {
    // Belt and braces: the specs below hand the wall clock back themselves, and a spec that failed
    // before reaching that line must not leave January frozen for the settings specs, which save a
    // version stamped *now*.
    unpinToday();
    await prisma.$disconnect();
  });

  test("quotes a large household the Maximalpreis on every screen that states a price", async ({
    page,
  }) => {
    await expectQuoted(page, id, CAPPED_PRICE, UNCAPPED_PRICE);
  });

  test("raises the portions and not the price when a member joins above the cap", async ({
    page,
  }) => {
    await page.goto(`/kunden/${id}`);
    await expect(page.getByTestId("household-member")).toHaveCount(7);

    // The browser derives these figures itself, from the policy values the server handed it — so
    // this is the one place the cap could be missing while every server-rendered screen agrees.
    await page.getByTestId("add-member").click();
    await page.getByTestId("member-first-name-7").fill(faker.person.firstName());
    await page.getByTestId("member-last-name-7").fill(faker.person.lastName());
    await page.getByTestId("member-birth-date-7").fill(typedDay(EXTRA_CHILD_BIRTH_DATE));

    await expect(page.getByTestId("children")).toHaveText("4");
    await expect(page.getByTestId("portions")).toHaveText(PORTIONS_WITH_EXTRA_CHILD);
    // Unchanged, and that is the rule: the household was already above the cap, so an extra head
    // earns food and costs nothing.
    await expect(page.getByTestId("price")).toHaveText(CAPPED_PRICE);

    // Nothing is saved — the edit was a question, and the household stays as it was for the
    // hand-out below.
    await page.goto(`/kunden/${id}`);
    await expect(page.getByTestId("household-member")).toHaveCount(7);
  });

  test("records the hand-out at the capped price, in the row and in the database", async ({
    page,
  }) => {
    await lookUp(page);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    await page.getByTestId("serve-button").click();
    await expect(page.getByTestId("serve-confirmation")).toBeVisible();

    // The stored figure, read straight out of SQLite: the record keeps the price that was owed, and
    // what was owed was the cap. A per-head sum here would be the counter quoting one number and
    // DF's books holding another.
    const records = await prisma.distributionRecord.findMany({
      where: { customerId: id },
      select: { priceCents: true, paid: true },
    });
    expect(records).toEqual([{ priceCents: CAPPED_PRICE_CENTS, paid: true }]);

    await page.goto(`/kunden/${id}`);
    await expect(page.getByTestId("history-row")).toHaveCount(1);
    await expect(page.getByTestId("history-price")).toHaveText(CAPPED_PRICE);
  });

  test("leaves what a past hand-out cost alone when the Maximalpreis is raised", async ({
    page,
  }) => {
    // From here on the wall clock, because these specs save settings: a version stamped in January
    // would be the one in force for a run whose today is any later month, and the register is
    // handed on to the settings specs at the end of this file.
    unpinToday();

    await saveCap(page, "6,00");

    await page.goto(`/kunden/${id}`);
    // The row is the record's own price, captured when the hand-out was written — the settings
    // history is what lets the software still explain it.
    await expect(page.getByTestId("history-price")).toHaveText(CAPPED_PRICE);
    // And the *next* hand-out would cost the new cap, so the raise did take effect at once.
    await expect(page.getByTestId("price")).toHaveText("6,00 €");
  });

  test("charges the per-head sum when the Maximalpreis is removed", async ({ page }) => {
    await saveCap(page, "");

    // 11,00 € on every screen that quoted 5,00 € before, from the same household and the same
    // arithmetic — no hard-coded cap could produce both answers.
    await expectQuoted(page, id, UNCAPPED_PRICE, CAPPED_PRICE);

    // The portions are the same `11` they were under the cap: a cap is a limit on money and has
    // nothing to say about food.
    await page.goto(`/kunden/${id}`);
    await expect(page.getByTestId("portions")).toHaveText(PORTIONS);
    // And the hand-out recorded two caps ago still reads what it cost.
    await expect(page.getByTestId("history-price")).toHaveText(CAPPED_PRICE);
  });

  test("puts a Maximalpreis back in force the moment it is saved", async ({ page }) => {
    // The cap the register is handed on with: the seeded 5,00 € the settings specs open against.
    // Saving it is also the assertion — a cap *introduced* where there was none is the transition
    // the screens have not been shown in yet, and it must bite on the next request.
    await saveCap(page, SEEDED_CAP);

    await page.goto("/einstellungen");
    await expect(page.getByLabel(CAP_LABEL, { exact: true })).toHaveValue(SEEDED_CAP);

    await expectQuoted(page, id, CAPPED_PRICE, UNCAPPED_PRICE);
  });
});
