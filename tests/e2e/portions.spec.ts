import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { de } from "@/i18n/de";

/**
 * Portions and price follow the household, driven through the built app
 * (tasks/prd-us-07-portions-and-price.md §US-07.5).
 *
 * The unit gates prove `portionsFor`/`priceFor` are pure functions of the counts and the settings,
 * and `describeAllowance` that the two are resolved together. What none of them can see is whether
 * the number on the customer record is *derived on the request* or read from a stored column — the
 * Excel failure this project replaces. So this spec seeds a two-grown-up, one-child household,
 * reads its portions and price off the real screen, then adds a member straight in the database and
 * reloads: if either value moves, the screen computed it from the household it found and stored
 * nothing.
 *
 * Adding the member goes through Prisma rather than the UI because editing a household is US-16,
 * which has no screen yet. The household takes a number in the 200s so the registration and card
 * specs, which allocate the *lowest* free number, keep the low sequence they assert against in the
 * shared `data/e2e.db`.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. The
// birthdates stay literals, because the counts under test are derived from them.
faker.seed(20260724);

/** The customer number this spec owns — clear of the low sequence and the counter spec's 201–206. */
const CUSTOMER_NUMBER = 211;

/** Born well before 13 years ago: grown-ups on any day this spec could run. */
const FIRST_GROWN_UP_BIRTH_DATE = "1985-02-11";
const SECOND_GROWN_UP_BIRTH_DATE = "1987-09-30";
/** Born comfortably inside the last 13 years: children until the mid-2030s, whenever this runs. */
const FIRST_CHILD_BIRTH_DATE = "2022-01-20";
const SECOND_CHILD_BIRTH_DATE = "2023-05-10";
const CERTIFICATE_VALID_UNTIL = "2027-06-30";

/**
 * The database the built app is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is spelled out. It is absolute because a relative SQLite url resolves against the schema
 * directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve("data/e2e.db")}` });

function utcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("portions and price are derived from the household, not stored", async ({ page }) => {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();

  // Two grown-ups and one child. The applicant is the first household member row, exactly as a
  // registration mirrors it, so the derived counts read straight off the three birthdates.
  const customer = await prisma.customer.create({
    data: {
      customerNumber: CUSTOMER_NUMBER,
      firstName,
      lastName,
      birthDate: utcMidnight(FIRST_GROWN_UP_BIRTH_DATE),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      group: "BLUE",
      status: "ACTIVE",
      reminderCount: 0,
      notes: "",
      householdMembers: {
        create: [
          { firstName, lastName, birthDate: utcMidnight(FIRST_GROWN_UP_BIRTH_DATE) },
          {
            firstName: faker.person.firstName(),
            lastName,
            birthDate: utcMidnight(SECOND_GROWN_UP_BIRTH_DATE),
          },
          {
            firstName: faker.person.firstName(),
            lastName,
            birthDate: utcMidnight(FIRST_CHILD_BIRTH_DATE),
          },
        ],
      },
      certificate: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: utcMidnight(CERTIFICATE_VALID_UNTIL),
        },
      },
      cards: {
        create: { index: 1, issuedAt: utcMidnight("2026-01-02"), reason: "FIRST_ISSUE" },
      },
    },
  });

  const record = `/kunden/${customer.id}`;

  // The seeded settings are 2 portions and 200c per grown-up, 1 portion and 100c per child
  // (src/infrastructure/prisma/seed.ts). Two grown-ups and one child: 2·2 + 1 = 5 portions,
  // 2·2,00 € + 1,00 € = 5,00 €.
  await page.goto(record);
  await expect(page.getByTestId("grown-ups")).toHaveText("2");
  await expect(page.getByTestId("children")).toHaveText("1");
  await expect(page.getByTestId("portions")).toHaveText("5");
  await expect(page.getByTestId("price")).toHaveText("5,00 €");

  // These are the standard values, and the screen says so — there is no control to adjust them.
  await expect(page.getByRole("main")).toContainText(de.customers.derived.standardValues);

  // A second child joins the household. Nothing else is touched — no portions or price column is
  // written, because there is none.
  await prisma.householdMember.create({
    data: {
      customerId: customer.id,
      firstName: faker.person.firstName(),
      lastName,
      birthDate: utcMidnight(SECOND_CHILD_BIRTH_DATE),
    },
  });

  // On the next request the same screen derives the allowance afresh: 2·2 + 2 = 6 portions,
  // 2·2,00 € + 2·1,00 € = 6,00 €.
  await page.reload();
  await expect(page.getByTestId("grown-ups")).toHaveText("2");
  await expect(page.getByTestId("children")).toHaveText("2");
  await expect(page.getByTestId("portions")).toHaveText("6");
  await expect(page.getByTestId("price")).toHaveText("6,00 €");
});
