import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { foldName } from "@/domain/customer/nameSearch";
import { SHARED } from "./registers";
import { releaseNumbers } from "./seeding";

/**
 * How far through today's group the counter is, driven through the built app
 * (tasks/prd-us-23-group-progress.md §US-023.5).
 *
 * `groupProgress` is proved rule by rule in the domain gate and `readGroupRoster` against fakes.
 * Neither can see the thing the tally *is for*: that the number on the counter's own screen agrees
 * with what just happened at it. So this spec serves a household through the UI and asserts the
 * figure moved by exactly one — the one claim that spans the button, the write and the next render,
 * and the one no unit test can make.
 *
 * The other half is that reading is free. Opening and closing the list writes nothing at all — no
 * record, no reminder, no status, no audit entry (§FR-9) — and an absence is only visible from
 * outside the app, so the register is snapshotted either side of a fold, exactly as
 * `group-walk.spec.ts` does for the walk.
 *
 * **Both figures are read out of the database at the moment they are asserted**, never written down
 * here. The specs that run before this one share `data/e2e.db` and register households of their own,
 * some of them RED and some of them served on this very day, so `34 von 61` is a fact about the
 * register at this moment rather than a property of this spec's block. What the block *does* own is
 * the three households whose rows are asserted one by one, and the move: exactly one of them is
 * served, so the delta is this spec's whatever the base is.
 *
 * The numbers sit at 301–303 rather than above `group-walk.spec.ts`'s 311–315. That spec runs
 * *after* this one (the suite is serial in alphabetical file order) and asserts that 315 is the last
 * RED number in the whole register, so a RED household seeded above it here would fail a spec this
 * one is not allowed to touch.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every date
// stays a literal, because which group collects — and therefore what the tally counts — is decided
// by dates.
faker.seed(20260802);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/**
 * The day this spec is judged on: Thursday 08.01.2026, 09:00 UTC.
 *
 * It follows from the seeded settings alone (`src/infrastructure/prisma/seed.ts`): anchor `2026-W02`
 * = RED, distributions on ISO weekday 4. So it is a distribution day, the group collecting is RED,
 * and a RED household with a current certificate is clear to serve.
 */
const TODAY = "2026-01-08T09:00:00.000Z";

/** The Europe/Berlin calendar day of {@link TODAY}, as `berlinDayKey` writes it to a record. */
const TODAYS_DAY_KEY = "2026-01-08";

/** The numbers this spec owns — see the note above on why they sit below the walk spec's block. */
const NUMBERS = {
  /** Served through the UI here: the household the tally must move for. */
  served: 301,
  /** Left alone all the way through, so the marks can be shown to mark the exception only. */
  unserved: 302,
  /** Blocked: listed, because the counter has to state the block — but never expected to collect. */
  blocked: 303,
} as const;

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

/** Insert one RED household with a grown-up, a current certificate and its card. */
async function seedHousehold(customerNumber: number, blocked: boolean): Promise<void> {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const birthDate = new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`);

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
      birthDate,
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      group: "RED",
      status: blocked ? "BLOCKED" : "ACTIVE",
      // Non-null exactly when the status calls for it, as the schema documents.
      blockReason: blocked ? "Hausverbot bis auf Weiteres." : null,
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
          customerNumber,
          index: 1,
          issuedAt: new Date("2026-01-02T00:00:00.000Z"),
          reason: "FIRST_ISSUE",
          grownUpsAtIssue: 1,
          childrenAtIssue: 0,
          groupAtIssue: "RED",
        },
      },
    },
  });
}

/** One household of today's group, as the two figures on screen count it. */
interface Member {
  readonly customerNumber: number;
  readonly blocked: boolean;
  readonly servedToday: boolean;
}

/**
 * Today's RED group straight out of the database, lowest customer number first.
 *
 * The whole register's, not just this spec's block: the specs before this one have registered RED
 * households and recorded hand-outs of their own on this same pinned day, so anything asserted about
 * the tally has to be counted from the register as it stands at that moment.
 */
async function todaysGroup(): Promise<ReadonlyArray<Member>> {
  const [customers, records] = await Promise.all([
    prisma.customer.findMany({
      where: { group: "RED", status: { in: ["ACTIVE", "BLOCKED"] } },
      select: { id: true, customerNumber: true, status: true },
      orderBy: { customerNumber: "asc" },
    }),
    // Joined by the surrogate id, never the customer number — a released number can belong to a
    // different household than the one whose record carries it (US-10).
    prisma.distributionRecord.findMany({
      where: { dayKey: TODAYS_DAY_KEY },
      select: { customerId: true },
    }),
  ]);
  const servedIds = new Set(records.map((record) => record.customerId));
  return customers.map((customer) => ({
    customerNumber: customer.customerNumber,
    blocked: customer.status === "BLOCKED",
    servedToday: servedIds.has(customer.id),
  }));
}

/**
 * The sentence the screen must be showing, spelled out from the register.
 *
 * `expected` is written here as FR-5 words it — the households that *may* collect — rather than by
 * calling the domain rule, so the assertion is an independent statement of it and not the same
 * function compared against itself.
 */
function summaryOf(members: ReadonlyArray<Member>): string {
  const served = members.filter((member) => member.servedToday).length;
  const expected = members.filter((member) => !member.blocked || member.servedToday).length;
  return de.distribution.progress.summary(RED_GROUP, served, expected);
}

/**
 * Everything about the register a *read* must leave exactly as it found it.
 *
 * The same shape `group-walk.spec.ts` snapshots, for the same reason: a hand-out, a reminder and an
 * audit entry are all rows, and any of them would appear if opening a fold recorded anything.
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

/** The fold itself, located by the tally it carries — the page holds other disclosures. */
function disclosure(page: Page): Locator {
  return page.locator("details").filter({ has: page.getByTestId("group-progress") });
}

/** Open the list the way a staff member does: by clicking the line stating the tally. */
async function openList(page: Page): Promise<void> {
  await page.getByTestId("group-progress").click();
  await expect(disclosure(page)).toHaveJSProperty("open", true);
}

const RED_GROUP = de.distribution.group(de.distribution.colours.RED);

test.describe.configure({ mode: "serial" });

test.describe("Gruppenfortschritt", () => {
  test.beforeAll(async () => {
    pinToday();
    await seedHousehold(NUMBERS.served, false);
    await seedHousehold(NUMBERS.unserved, false);
    await seedHousehold(NUMBERS.blocked, true);
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it would freeze January for the settings specs,
    // which save a version stamped *now* and would then assert against the wrong month.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("states the group and both figures without anything being opened", async ({ page }) => {
    await page.goto("/ausgabe");

    // The summary *is* the tally (§FR-1): the group in words and the two numbers, in one node, on a
    // screen nobody has touched.
    await expect(page.getByTestId("group-progress")).toHaveText(summaryOf(await todaysGroup()));
    await expect(disclosure(page)).toHaveJSProperty("open", false);
  });

  test("lists the group in customer-number order, marking the blocked household", async ({
    page,
  }) => {
    await page.goto("/ausgabe");
    await openList(page);

    // Each row's link is named the way a staff member would say it out loud, so the number and the
    // name are one accessible name rather than a bare name beside a loose figure.
    for (const customerNumber of [NUMBERS.served, NUMBERS.unserved, NUMBERS.blocked]) {
      await expect(page.getByTestId(`group-member-${customerNumber}`)).toHaveAttribute(
        "href",
        `/ausgabe?nummer=${customerNumber}`,
      );
    }

    // The register's order, read off the page and compared with the database's — the list must not
    // re-sort, and 301 → 302 → 303 alone would pass on a page that sorted by anything at all.
    const rendered = await page
      .getByTestId(/^group-member-/)
      .evaluateAll((rows) =>
        rows.map((row) => Number(row.getAttribute("data-testid")?.replace("group-member-", ""))),
      );
    expect(rendered).toEqual((await todaysGroup()).map((member) => member.customerNumber));

    // The block is said in the words `/kunden` says it in — one meaning, one treatment.
    await expect(page.getByTestId(`blocked-${NUMBERS.blocked}`)).toHaveText(
      de.customers.status.BLOCKED,
    );
    // Nobody in this block has collected yet, and the unserved carry no mark at all: chrome marks
    // the exception (§FR-6).
    for (const customerNumber of Object.values(NUMBERS)) {
      await expect(page.getByTestId(`served-${customerNumber}`)).toHaveCount(0);
    }
  });

  test("leaves a blocked household out of the households expected to collect", async ({ page }) => {
    const members = await todaysGroup();
    const walkable = members.length;
    // The households listed but unable to collect (US-08). 303 is one of them, which is what makes
    // the subtraction below a statement about *this* spec's household rather than an identity.
    const cannotCollect = members.filter((member) => member.blocked && !member.servedToday);
    expect(cannotCollect.map((member) => member.customerNumber)).toContain(NUMBERS.blocked);

    await page.goto("/ausgabe");

    // Listed — a blocked household still holds its slot and the counter has to state the block —
    // and yet not counted, because a denominator including it could never be reached (§FR-5).
    await openList(page);
    await expect(page.getByTestId(`group-member-${NUMBERS.blocked}`)).toBeVisible();
    await expect(page.getByTestId("group-progress")).toContainText(
      `von ${walkable - cannotCollect.length} Haushalten`,
    );
  });

  test("raises the tally by exactly one when a household is served at the counter", async ({
    page,
  }) => {
    const before = await todaysGroup();

    // Served the way the queue is served: type the number, read the verdict, press the button.
    await page.goto("/ausgabe");
    await page.getByTestId("counter-input").fill(String(NUMBERS.served));
    await page.getByTestId("counter-input").press("Enter");
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    await page.getByTestId("serve-button").click();
    await expect(page.getByTestId("already-served")).toBeVisible();

    // One more served, and not one household more expected — 301 was always going to collect.
    await page.goto("/ausgabe");
    const after = await todaysGroup();
    expect(after.filter((member) => member.servedToday).length).toBe(
      before.filter((member) => member.servedToday).length + 1,
    );
    await expect(page.getByTestId("group-progress")).toHaveText(summaryOf(after));

    // And the list tells the same story as the number above it: the household that collected is
    // marked, the one that did not carries nothing.
    await openList(page);
    await expect(page.getByTestId(`served-${NUMBERS.served}`)).toHaveText(
      de.distribution.progress.served,
    );
    await expect(page.getByTestId(`served-${NUMBERS.unserved}`)).toHaveCount(0);
  });

  test("looks a household up when their name in the list is clicked", async ({ page }) => {
    await page.goto("/ausgabe");
    await openList(page);

    // Clicking a name is the same act as typing the number (§FR-7): it produces that household's
    // verdict on this screen, and nothing else.
    await page.getByTestId(`group-member-${NUMBERS.unserved}`).click();

    await expect(page).toHaveURL(new RegExp(`/ausgabe\\?nummer=${NUMBERS.unserved}$`));
    await expect(page.getByTestId("counter-customer-number")).toHaveText(String(NUMBERS.unserved));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    // Closed again on the new screen: the verdict a staff member just asked for must not arrive
    // underneath a hundred rows they have to scroll past.
    await expect(disclosure(page)).toHaveJSProperty("open", false);
  });

  test("records nothing when the list is opened and closed", async ({ page }) => {
    const before = await snapshotRegister();

    await page.goto("/ausgabe");
    await openList(page);
    await page.getByTestId("group-progress").click();
    await expect(disclosure(page)).toHaveJSProperty("open", false);

    expect(await snapshotRegister()).toBe(before);
  });
});
