import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { de } from "@/i18n/de";
import { foldName } from "@/domain/customer/nameSearch";
import { SHARED } from "./registers";
import { releaseNumbers } from "./seeding";

/**
 * The counts and the price follow the household, driven through the built app.
 *
 * The unit gates prove `priceFor` is a pure function of the counts and the settings, and
 * `describeAllowance` that the counts and the price are resolved together. What none of them can
 * see is whether the numbers on the customer record are *derived on the request* or read from a
 * stored column — the Excel failure this project replaces. So this spec seeds a one-grown-up,
 * one-child household, reads its counts and its price off the real screen, then adds a member
 * straight in the database and reloads: if the figures move, the screen worked them out from the
 * household it found and stored nothing.
 *
 * The household is deliberately small enough to stay under the seeded Maximalpreis, so the added
 * child moves the price as well as the counts. A household priced at the cap would leave the price
 * assertion unable to fail — the cap itself is `price-cap.spec.ts`'s subject, not this file's.
 *
 * Adding the member goes through Prisma rather than the UI because the household editor derives its
 * own figures in the browser; a write behind the app's back is what makes the *server's* derivation
 * the only thing that could produce the second reading. The household takes a number in the 200s so
 * the registration and card specs, which allocate the *lowest* free number, keep the low sequence
 * they assert against in the shared `data/e2e.db`.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. The
// birthdates stay literals, because the counts under test are derived from them.
faker.seed(20260724);

/** The customer number this spec owns — clear of the low sequence and the counter spec's 201–206. */
const CUSTOMER_NUMBER = 211;

/** Born well before 13 years ago: a grown-up on any day this spec could run. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
/** Born comfortably inside the last 13 years: children until the mid-2030s, whenever this runs. */
const FIRST_CHILD_BIRTH_DATE = "2022-01-20";
const SECOND_CHILD_BIRTH_DATE = "2023-05-10";
const CERTIFICATE_VALID_UNTIL = "2027-06-30";

/**
 * What the seeded policy makes of the household before and after the second child joins — 200c per
 * grown-up and 100c per child, under a Maximalpreis of 500c.
 */
const PRICE_AS_SEEDED = "3,00 €";
const PRICE_WITH_SECOND_CHILD = "4,00 €";

/**
 * The figure that was withdrawn with US-27, as the counter must never state it again.
 *
 * US-27 makes a survivor grep for this word over `src/`, `tests/` and `prisma/` an acceptance
 * criterion, and this regex is one of the two hits it still returns; the other is the §US-07.3
 * citation in `describe-allowance.ts`, whose PRD keeps its name (US-27.7). Both are deliberate: the
 * grep exists to catch a *display* or a *derivation* that outlived the deletion, and a guard that
 * fails when one comes back is the opposite of a survivor.
 */
const WITHDRAWN_FIGURE = /Portion/i;

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

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("the counts and the price are derived from the household, not stored", async ({ page }) => {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();

  // One grown-up and one child. The applicant is the first household member row, exactly as a
  // registration mirrors it, so the derived counts read straight off the two birthdates.
  // Idempotent, so a CI retry can re-run this block instead of dying on the
  // unique customer number (tests/e2e/seeding.ts).
  await releaseNumbers(prisma, CUSTOMER_NUMBER);
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
      status: "ACTIVE",
      reminderCount: 0,
      notes: "",
      householdMembers: {
        create: [
          { firstName, lastName, birthDate: utcMidnight(GROWN_UP_BIRTH_DATE) },
          {
            firstName: faker.person.firstName(),
            lastName,
            birthDate: utcMidnight(FIRST_CHILD_BIRTH_DATE),
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
          customerNumber: CUSTOMER_NUMBER,
          index: 1,
          issuedAt: utcMidnight("2026-01-02"),
          reason: "FIRST_ISSUE",
          // The printed card matches the seeded household — one grown-up and one child — so the
          // first reading below is the derivation's doing and nothing else's.
          grownUpsAtIssue: 1,
          childrenAtIssue: 1,
        },
      },
    },
  });

  const record = `/kunden/${customer.id}`;

  // The seeded settings are 200c per grown-up and 100c per child, with a Maximalpreis of 500c
  // (src/infrastructure/prisma/seed.ts). One grown-up and one child: 2,00 € + 1,00 € = 3,00 €,
  // well under the cap.
  await page.goto(record);
  await expect(page.getByTestId("grown-ups")).toHaveText("1");
  await expect(page.getByTestId("children")).toHaveText("1");
  await expect(page.getByTestId("price")).toHaveText(PRICE_AS_SEEDED);

  // Read-only throughout: the three figures are printed, and the record offers nothing to type a
  // count or a price into. The sentence that used to say so was dropped as one DF already knew, so
  // what stands in for it is the markup — a `Stat` renders its value as a `<span>`, and this fails
  // the day one of the three becomes a field. Deliberately *not* a `getByLabel(…).toHaveCount(0)`:
  // a `Stat` labels its value with a plain `<span>` rather than a `<label>` or an `aria-label`, so
  // a query by label matches nothing on this screen however editable the screen has become — an
  // assertion that cannot fail is not one.
  for (const [testId, label] of [
    ["grown-ups", de.customers.derived.grownUps],
    ["children", de.customers.derived.children],
    ["price", de.customers.derived.price],
  ] as const) {
    const value = page.getByTestId(testId);
    await expect(value).toHaveJSProperty("tagName", "SPAN");
    // And the figure is still labelled by the tile it sits in — `Stat` keeps the label and the
    // value inside one element on purpose, so the pair is asserted the way it is announced.
    await expect(value.locator("xpath=..")).toContainText(label);
  }

  // A second child joins the household. Nothing else is touched — no count and no price column is
  // written, because there is none.
  await prisma.householdMember.create({
    data: {
      customerId: customer.id,
      firstName: faker.person.firstName(),
      lastName,
      birthDate: utcMidnight(SECOND_CHILD_BIRTH_DATE),
    },
  });

  // On the next request the same screen derives the allowance afresh from the three birthdates it
  // now finds: a second child, and 2,00 € + 2·1,00 € = 4,00 €. Nothing wrote either figure.
  await page.reload();
  await expect(page.getByTestId("grown-ups")).toHaveText("1");
  await expect(page.getByTestId("children")).toHaveText("2");
  await expect(page.getByTestId("price")).toHaveText(PRICE_WITH_SECOND_CHILD);
});

test("the counter states no withdrawn figure beside the counts and the price", async ({ page }) => {
  await page.goto(`/ausgabe?nummer=${CUSTOMER_NUMBER}`);

  // The household the test above left behind — two children by now — looked up as a staff member
  // would at the table. The counter is a read, so it states the same derivation the record does.
  await expect(page.getByTestId("counter-customer-number")).toHaveText(String(CUSTOMER_NUMBER));
  await expect(page.getByTestId("counter-grown-ups")).toHaveText("1");
  await expect(page.getByTestId("counter-price")).toHaveText(PRICE_WITH_SECOND_CHILD);

  // US-27: DF hand out food by judgement, so the software states no quantity of it. This is the
  // assertion that fails if the figure is ever put back on the screen it was read from.
  await expect(page.getByRole("main").getByText(WITHDRAWN_FIGURE)).toHaveCount(0);
});
