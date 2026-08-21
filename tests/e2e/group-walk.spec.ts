import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { foldName } from "@/domain/customer/nameSearch";
import { SHARED } from "./registers";
import { releaseNumbers } from "./seeding";

/**
 * Stepping through today's group at the counter, driven through the built app
 * (tasks/prd-us-21-step-through-group.md §US-021.4).
 *
 * `neighbours` is proved rule by rule in the domain gate and `readGroupRoster` against fakes. What
 * neither can see is the thing the walk *is*: two links whose `href`s put the register's numbers in
 * an order, on a screen where the group being walked is only named by a banner. A control that
 * pointed at the household after the wrong one, or that stayed enabled past the end of the group,
 * would look exactly right in every unit test and hand the wrong number to a staff member.
 *
 * The other half is that the walk is a **read**. It navigates by GET and writes nothing at all — no
 * record, no reminder, no status, no audit entry — and an absence is only visible from outside the
 * app, so the register is snapshotted before and after a walk across the block, exactly as
 * `counter.spec.ts` does for the lookup (US-04, FR-4).
 *
 * Five households are seeded straight through Prisma, in one contiguous band nothing else uses, so
 * no other spec's registrations can land between them and change what "the next number" is. They
 * cover the three things the walk must get right about membership: a BLOCKED household still holds
 * its slot and **is** walked, an ARCHIVED one no longer does and is **stepped over**, and a
 * household of the *other* group is not in the walked group at all.
 *
 * The two ends of the group are the one thing this spec cannot seed its way to: whether a number is
 * the last RED one depends on the whole shared register, which the specs before this one have been
 * writing to. So both ends are read out of the database at the moment they are asserted rather than
 * hard-coded.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every date
// stays a literal, because which group is walked is decided by dates.
faker.seed(20260801);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/**
 * The day this spec is judged on: Thursday 08.01.2026.
 *
 * It follows from the seeded settings alone (`src/infrastructure/prisma/seed.ts`): anchor `2026-W02`
 * = RED, distributions on ISO weekday 4. So it is a distribution day and the group collecting — the
 * week's own group, which is what the controls walk — is RED.
 *
 * The last spec below moves the clock to the Saturday of that same week, where the week is still RED
 * but the next distribution is already BLUE. The walk must stay on RED: it belongs to the week it is
 * read in, and following the next distribution instead put next week's households behind the buttons
 * under a badge naming this week's colour.
 */
const TODAY = "2026-01-08T09:00:00.000Z";

/** Saturday of the same RED week — after its distribution, before the BLUE one of the week after. */
const SATURDAY_OF_THE_SAME_WEEK = "2026-01-10T09:00:00.000Z";

/**
 * The numbers this spec owns: one contiguous band, above every other spec's (the highest is the
 * customer-record spec's 291), so the households below sit next to each other in the walk.
 */
const NUMBERS = {
  first: 311,
  /** Blocked: turned away at the counter, but it still holds its slot, so the walk visits it. */
  blocked: 312,
  /** Archived: the slot is released, so the walk steps over it. */
  archived: 313,
  /** BLUE, between two RED numbers: today is RED, so it is not in the group being walked. */
  otherGroup: 314,
  last: 315,
} as const;

/** The numbers of this block a walk through RED actually visits, in the order it visits them. */
const WALKED = [NUMBERS.first, NUMBERS.blocked, NUMBERS.last] as const;

/** Born well before 13 years ago: a grown-up on any day this spec could run. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
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

interface Household {
  readonly customerNumber: number;
  readonly group: "RED" | "BLUE";
  readonly status: "ACTIVE" | "BLOCKED" | "ARCHIVED";
}

/** Insert one household with a grown-up, a current certificate and its card. */
async function seedHousehold(household: Household): Promise<void> {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const birthDate = new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`);

  // Idempotent, so a CI retry can re-run this block instead of dying on the

  // unique customer number (tests/e2e/seeding.ts).

  await releaseNumbers(prisma, household.customerNumber);

  await prisma.customer.create({
    data: {
      customerNumber: household.customerNumber,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate,
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      group: household.group,
      status: household.status,
      // Both columns are non-null exactly when the status calls for them, as the schema documents.
      blockReason: household.status === "BLOCKED" ? "Hausverbot bis auf Weiteres." : null,
      archiveReason: household.status === "ARCHIVED" ? "Weggezogen." : null,
      archivedAt: household.status === "ARCHIVED" ? new Date("2026-01-05T00:00:00.000Z") : null,
      householdMembers: { create: [{ firstName, lastName, birthDate }] },
      certificates: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: new Date(`${VALID_CERTIFICATE}T00:00:00.000Z`),
          recordedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      },
      cards: {
        create: {
          customerNumber: household.customerNumber,
          index: 1,
          issuedAt: new Date("2026-01-02T00:00:00.000Z"),
          reason: "FIRST_ISSUE",
          grownUpsAtIssue: 1,
          childrenAtIssue: 0,
          groupAtIssue: household.group,
        },
      },
    },
  });
}

/**
 * The customer numbers a walk through today's RED group must visit, lowest first — the whole
 * register's, not just this spec's block.
 *
 * Read rather than assumed: the specs that ran before this one have registered households of their
 * own, so which number is the first and which the last of the group is a fact about the shared
 * register at this moment.
 */
async function walkableRedNumbers(): Promise<ReadonlyArray<number>> {
  const rows = await prisma.customer.findMany({
    where: { group: "RED", status: { in: ["ACTIVE", "BLOCKED"] } },
    select: { customerNumber: true },
    orderBy: { customerNumber: "asc" },
  });
  return rows.map((row) => row.customerNumber);
}

/**
 * Everything about the register a *walk* must leave exactly as it found it.
 *
 * Wider than the lookup's snapshot in `counter.spec.ts`, because the schema has grown since: a
 * hand-out and a reminder are rows now, and either would appear if a navigation recorded anything.
 * Ordered by customer number so the comparison is a plain string equality.
 */
async function snapshotRegister(): Promise<string> {
  const [customers, cards, distributions, reminderLogs, auditEntries] = await Promise.all([
    prisma.customer.findMany({
      select: { customerNumber: true, status: true, reminderCount: true },
      orderBy: { customerNumber: "asc" },
    }),
    prisma.card.count(),
    prisma.distributionRecord.count(),
    prisma.reminderLog.count(),
    prisma.auditEntry.count(),
  ]);
  return JSON.stringify({ customers, cards, distributions, reminderLogs, auditEntries });
}

/**
 * Open the counter standing on one number, the way a typed lookup leaves it.
 *
 * The household is identified by its *customer* number rather than its card number: an end of the
 * group can belong to any spec's household, and one of those may have been reissued a card.
 */
async function standOn(page: Page, customerNumber: number): Promise<void> {
  await page.goto(`/ausgabe?nummer=${customerNumber}`);
  await expect(page.getByTestId("counter-customer-number")).toHaveText(String(customerNumber));
}

/**
 * Take one step of the walk: assert where the control points, follow it, and assert it landed on
 * that household's record — the `href` and the screen have to agree.
 */
async function step(page: Page, control: "walk-previous" | "walk-next", to: number): Promise<void> {
  await expect(page.getByTestId(control)).toHaveAttribute("href", `/ausgabe?nummer=${to}`);
  await page.getByTestId(control).click();
  await expect(page).toHaveURL(new RegExp(`/ausgabe\\?nummer=${to}$`));
  await expect(page.getByTestId("counter-customer-number")).toHaveText(String(to));
}

const RED_GROUP = de.distribution.group(de.distribution.colours.RED);

test.describe.configure({ mode: "serial" });

test.describe("Gruppe durchgehen", () => {
  test.beforeAll(async () => {
    pinToday();
    for (const household of [
      { customerNumber: NUMBERS.first, group: "RED", status: "ACTIVE" },
      { customerNumber: NUMBERS.blocked, group: "RED", status: "BLOCKED" },
      { customerNumber: NUMBERS.archived, group: "RED", status: "ARCHIVED" },
      { customerNumber: NUMBERS.otherGroup, group: "BLUE", status: "ACTIVE" },
      { customerNumber: NUMBERS.last, group: "RED", status: "ACTIVE" },
    ] as const satisfies ReadonlyArray<Household>) {
      await seedHousehold(household);
    }
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it would freeze January for the settings specs,
    // which save a version stamped *now* and would then assert against the wrong month.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("leads from a number of the group to the next one up", async ({ page }) => {
    await standOn(page, NUMBERS.first);

    await step(page, "walk-next", NUMBERS.blocked);
  });

  test("leads from a number of the group back to the one below", async ({ page }) => {
    await standOn(page, NUMBERS.last);

    await step(page, "walk-previous", NUMBERS.blocked);
    await step(page, "walk-previous", NUMBERS.first);
  });

  test("walks a blocked household, and steps over an archived one and the other group", async ({
    page,
  }) => {
    // A blocked household is turned away at the counter but still holds its slot, so a staff member
    // working through the group meets it. The archived one between 312 and 315 has released its
    // slot, and 314 belongs to BLUE — neither is in the group collecting today, so the walk passes
    // straight from 312 to 315 in one step.
    await standOn(page, NUMBERS.first);
    await step(page, "walk-next", NUMBERS.blocked);
    await expect(page.getByTestId("counter-status")).toHaveText(de.customers.status.BLOCKED);

    await step(page, "walk-next", NUMBERS.last);
  });

  test("starts at the first number of the group when nothing has been looked up", async ({
    page,
  }) => {
    const [lowest] = await walkableRedNumbers();

    await page.goto("/ausgabe");

    // Nothing typed, so there is nowhere to go back to, and Weiter is the entry point into the
    // group. The hint has to say so: a disabled button on its own is mute.
    await expect(page.getByTestId("walk-previous")).toBeDisabled();
    await expect(page.getByTestId("walk-next")).toHaveAttribute(
      "href",
      `/ausgabe?nummer=${lowest}`,
    );
    await expect(page.getByTestId("walk-hint")).toHaveText(
      de.distribution.walk.hints.fromStart(RED_GROUP),
    );
  });

  test("offers no step beyond either end of the group", async ({ page }) => {
    const numbers = await walkableRedNumbers();
    const lowest = numbers[0];
    const highest = numbers[numbers.length - 1];
    // The block this spec seeded sits above every other number in the register, so its last number
    // is the group's — asserted rather than assumed, because it is what makes the end an end.
    expect(highest).toBe(NUMBERS.last);

    await standOn(page, highest);
    await expect(page.getByTestId("walk-next")).toBeDisabled();
    await expect(page.getByTestId("walk-hint")).toHaveText(
      de.distribution.walk.hints.end(RED_GROUP),
    );

    await standOn(page, lowest);
    await expect(page.getByTestId("walk-previous")).toBeDisabled();
    await expect(page.getByTestId("walk-next")).toBeEnabled();
  });

  test("records nothing while walking the group", async ({ page }) => {
    const before = await snapshotRegister();

    // The whole block, in both directions, including the blocked household — a walk is navigation
    // and nothing else: no hand-out, no reminder, no status change, no audit entry (US-21, FR-4).
    await standOn(page, WALKED[0]);
    await step(page, "walk-next", WALKED[1]);
    await step(page, "walk-next", WALKED[2]);
    await step(page, "walk-previous", WALKED[1]);
    await step(page, "walk-previous", WALKED[0]);

    expect(await snapshotRegister()).toBe(before);
  });

  test("stays on the week's own group on the Saturday after its distribution", async ({ page }) => {
    // The week is still RED here while the next Ausgabe is the BLUE one of the week after, and the
    // banner says both. Following the next distribution instead would put 314 — the BLUE household
    // sitting in the middle of this block — behind Weiter, under a badge naming the week RED.
    // Pinned last in the file, and the pin is dropped in `afterAll` with the rest.
    writeFileSync(NOW_FILE, SATURDAY_OF_THE_SAME_WEEK, "utf8");

    await standOn(page, NUMBERS.first);

    await expect(page.getByTestId("week-colour-week")).toHaveText(de.distribution.colours.RED);
    await expect(page.getByTestId("walk-hint")).toContainText(RED_GROUP);
    await step(page, "walk-next", NUMBERS.blocked);
    await step(page, "walk-next", NUMBERS.last);

    // The whole point, one assertion: the household the walk hands over is one the counter clears.
    // `lookupCustomer` judges against the *week's* colour, so a walk that followed the next
    // distribution handed over BLUE households and the same screen answered WRONG_GROUP for the very
    // number it had just supplied.
    await expect(page.getByTestId("counter-group")).toHaveText(de.customers.groups.RED);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
  });
});
