import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { foldName } from "@/domain/customer/nameSearch";
import { clearRegister } from "@/infrastructure/prisma/test-support";
import { ISOLATED } from "./registers";
import { seedEndedSession } from "./seeding";
import { endSessionInHook, startSession } from "./session";

/**
 * „Ausgaben in Folge verpasst" counts the afternoons that took place
 * (`tasks/prd-us-36-sessions-not-the-calendar.md` §US-36.6).
 *
 * The rule is proved against fakes in the domain and the application. What neither can see is the
 * figure DF actually reads — the one on the record and the one at the counter, over a register whose
 * afternoons were held rather than described. So this spec holds three of them and reads the
 * consequence off both screens.
 *
 * **It pins no clock, and that is the claim.** Until US-36 the count was a walk backwards through
 * the calendar, a fortnight at a time, and every cancelled week in it was a miss nobody made.
 * Nothing it answers is a function of today any more, so a spec that had to pin a day to assert it
 * would be evidence the calendar is still in there somewhere.
 *
 * **It owns a register.** The figure is a function of the *whole* session list, and in the shared
 * one a dozen specs start, end and seed afternoons — so „missed two" there could only ever be a
 * delta, and one that moves whenever a file sorting earlier holds one session more. Emptying the
 * register is what lets both figures below be absolute numbers. `number-group.spec.ts` and
 * `waiting-list.spec.ts` share that register and run after this file, each emptying it in its own
 * `beforeAll` — so what this one leaves behind is nobody's business but its own.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. The days stay
// literals, because which afternoons were held is the whole of what is under test.
faker.seed(20260920);

/**
 * The two households, both **odd and therefore RED** (US-31): the same afternoons are theirs, and
 * the only difference between them is that one of them came.
 */
const NUMBERS = {
  /** Served at neither afternoon — the household the figure is about. */
  absent: 1,
  /** Registered alongside them and collected at the last one, which is where the walk stops. */
  present: 3,
} as const;

/** The day both households joined the register — before every afternoon below, or none was theirs. */
const REGISTERED = "2026-01-02";
/** Born well before 13 years ago: a grown-up on any day this spec could run. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
/** A year out, so the counter has no quarrel with either household whenever this suite runs. */
const VALID_CERTIFICATE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

/**
 * The two afternoons that served RED, oldest last — the order `listEnded` answers in.
 *
 * A fortnight apart, which is what DF's rhythm looks like, and nothing reads that spacing: an
 * afternoon counts because it was held, not because a calendar says one was due.
 */
const RED_AFTERNOONS = ["2026-01-22T14:00:00.000Z", "2026-01-08T14:00:00.000Z"] as const;
/** The one in between them that served the other group, and therefore nobody here. */
const BLUE_AFTERNOON = "2026-01-15T14:00:00.000Z";

/**
 * The database the isolated server is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is taken from `registers.ts` — the one place that knows which engine this run drives, and
 * therefore which register is behind it. It is resolved to an absolute path because a relative
 * SQLite url resolves against the schema directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(ISOLATED.database)}` });

/** An active household with one grown-up, a valid certificate and the card that registered them. */
async function seedHousehold(customerNumber: number): Promise<number> {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const birthDate = new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`);
  const registered = new Date(`${REGISTERED}T00:00:00.000Z`);

  const customer = await prisma.customer.create({
    data: {
      customerNumber,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate,
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      status: "ACTIVE",
      reminderCount: 0,
      notes: "",
      householdMembers: { create: [{ firstName, lastName, birthDate }] },
      certificates: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: VALID_CERTIFICATE,
          recordedAt: registered,
        },
      },
      // The first card's day **is** the household's `registeredOn` (`customer-repository.ts`), and
      // therefore the line before which no afternoon was theirs to attend.
      cards: {
        create: {
          customerNumber,
          index: 1,
          issuedAt: registered,
          reason: "FIRST_ISSUE",
          grownUpsAtIssue: 1,
          childrenAtIssue: 0,
        },
      },
    },
    select: { id: true },
  });

  return customer.id;
}

/** What both screens say about a household that has missed `count` of its own afternoons. */
function missed(count: number): string {
  return de.customers.derived.noShowsValue(count);
}

/** Type a number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page, customerNumber: number): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(String(customerNumber));
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${customerNumber}`));
}

test.describe.configure({ mode: "serial" });

test.describe("Verpasste Ausgaben", () => {
  let absentId: number;
  let presentId: number;

  test.beforeAll(async () => {
    // Emptied, not merely freed of these two numbers: every ended session in the register is an
    // afternoon somebody could have missed, so a retry replaying this block against what the failed
    // attempt left would count its afternoons a second time.
    await clearRegister(prisma);

    absentId = await seedHousehold(NUMBERS.absent);
    presentId = await seedHousehold(NUMBERS.present);

    const held = await Promise.all(
      RED_AFTERNOONS.map((at) => seedEndedSession(prisma, { at: new Date(at), groups: "RED" })),
    );
    // The household that came collected at the most recent one, which is where the walk stops.
    await prisma.distributionRecord.create({
      data: {
        customerId: presentId,
        sessionId: held[0],
        date: new Date(RED_AFTERNOONS[0]),
        showedUp: true,
        paidCents: 200,
        priceCents: 200,
      },
    });
  });

  test.afterAll(async ({ browser, baseURL }) => {
    // The afternoon the last test starts goes with the spec: a running session is state the file
    // sorting after this one would inherit (`tests/e2e/session.ts`).
    await endSessionInHook({ browser, baseURL });
    await prisma.$disconnect();
  });

  test("counts both afternoons of its own group the household was not at", async ({ page }) => {
    await page.goto(`/kunden/${absentId}`);

    await expect(page.getByTestId("no-shows")).toHaveText(missed(RED_AFTERNOONS.length));
  });

  test("counts nothing for the household that collected at the last afternoon", async ({
    page,
  }) => {
    await page.goto(`/kunden/${presentId}`);

    // The record of the household in question, said before the absence below: an assertion that
    // something is *not* on a page passes just as well on a page that never rendered.
    await expect(page.getByTestId("customer-number")).toHaveText(String(NUMBERS.present));
    // Absent rather than zero: the record shows the line only when there is a run to see, and the
    // afternoon before the one they collected at is behind the stop.
    await expect(page.getByTestId("no-shows")).toHaveCount(0);
  });

  test("an afternoon that served only the other group is not one they missed", async ({ page }) => {
    await seedEndedSession(prisma, { at: new Date(BLUE_AFTERNOON), groups: "BLUE" });

    await page.goto(`/kunden/${absentId}`);

    await expect(page.getByTestId("no-shows")).toHaveText(missed(RED_AFTERNOONS.length));
  });

  test("the afternoon that is running is not one they missed either", async ({ page }) => {
    await startSession(page, "RED");

    await page.goto(`/kunden/${absentId}`);
    await expect(page.getByTestId("no-shows")).toHaveText(missed(RED_AFTERNOONS.length));

    // The same figure at the counter, which is where DF reads it while the household stands there:
    // an afternoon they are at cannot be one they have missed.
    await lookUp(page, NUMBERS.absent);
    await expect(page.getByTestId("counter-no-shows")).toHaveText(missed(RED_AFTERNOONS.length));
  });
});
