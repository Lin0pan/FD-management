import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { foldName } from "@/domain/customer/nameSearch";
import { de } from "@/i18n/de";

/**
 * Browsing and searching the register at /kunden, driven through the built app
 * (tasks/prd-us-15-customer-list.md §US-15.4).
 *
 * Every filter is already proved twice below this screen: against fakes in `listCustomers` and
 * against a real SQLite file in the repository's fifty-household fixture. What neither can see is the
 * screen — that the one search box reads a name *and* a card number, that the archived toggle is off
 * until somebody switches it on, that the group balance keeps counting the whole register while the
 * table is filtered to one row, and that the whole view survives a reload as a link. Those are the
 * four claims FD would notice if they broke, so this spec makes them against the rendered page.
 *
 * It seeds five households through Prisma rather than through the form: the point is to have a
 * *spread* — both groups, all three statuses, all three certificate states — and registering five
 * households through the UI would prove US-01 again at five times the cost. Two of them share a
 * surname on purpose, one active and one archived, so the archived filter is the only thing that can
 * tell them apart (a name search that excluded the archived row for any other reason would pass a
 * weaker spec).
 */

// A fixed seed so a failure is reproducible; only the other names and the addresses come from Faker.
// Every date stays a literal, because the certificate states are decided by dates.
faker.seed(20260729);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = "data/e2e-now.txt";

/**
 * The day this spec is judged on: Thursday 08.01.2026, 09:00 UTC.
 *
 * Nothing here depends on it being a distribution day — the list is a read. It is pinned because the
 * three certificate states are relative to *today*: "läuft bald ab" is within 30 days of it, and a
 * spec whose today drifted would assert one bucket and be shown another.
 */
const TODAY = "2026-01-08T09:00:00.000Z";

/**
 * The numbers this spec owns — clear of the low sequence the registration, card, archive and
 * re-registration specs allocate against, and of the counter (201–206/239), portions (211), serve
 * (221–222), reminders (231), block (241), reissue (251) and age-13 (271) specs in the shared
 * `data/e2e.db`.
 */
const NUMBERS = {
  /** RED, active, certificate valid — and the household both searches must find. */
  searched: 281,
  /** BLUE, active, certificate expiring inside the window. */
  blue: 282,
  /** RED, blocked — still on the register, so it still counts towards the balance. */
  blocked: 283,
  /** BLUE, archived — hidden by default, and the row the surname alone cannot exclude. */
  archived: 284,
  /** RED, active, certificate lapsed, two reminders sent. */
  expired: 285,
} as const;

/**
 * The invented surname the search test types a prefix of.
 *
 * It has to be invented: Faker's name lists are English but contain German-looking surnames, and the
 * other specs seed dozens of households from them, so a real surname would eventually be matched by
 * somebody else's draw and the exact-result assertion would flake. Searched by a prefix long enough
 * to reach the made-up part, in lower case and without the umlaut — which is the fold under test.
 */
const SURNAME = "Müllerhoff";
const SEARCH_PREFIX = "müllerh";

/** Born well before 13 years ago: a grown-up. Comfortably inside the last 13 years: a child. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
const CHILD_BIRTH_DATE = "2020-06-15";

/** The three certificate states, as dates around {@link TODAY} and its 30-day warning window. */
const CERTIFICATES = {
  valid: "2027-06-30",
  expiringSoon: "2026-01-20",
  expired: "2025-12-31",
} as const;

/**
 * The database the built app is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is spelled out. It is absolute because a relative SQLite url resolves against the schema
 * directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve("data/e2e.db")}` });

/** Make the app believe it is {@link TODAY}, for every request until the file is removed. */
function pinToday(): void {
  writeFileSync(NOW_FILE, TODAY, "utf8");
}

/** One seeded household, as this spec's table below states it. */
interface Seed {
  readonly customerNumber: number;
  readonly group: "RED" | "BLUE";
  readonly status: "ACTIVE" | "BLOCKED" | "ARCHIVED";
  readonly lastName: string;
  readonly certificateValidUntil: string;
  /** How many cards the household has been issued. The current one is the highest index. */
  readonly cards: number;
  readonly reminderCount: number;
}

/**
 * The register this spec asserts against, in one table.
 *
 * Read down the columns rather than across the rows: both groups, all three statuses and all three
 * certificate states are present, and the archived household shares the searched one's surname.
 */
const SEEDS: ReadonlyArray<Seed> = [
  {
    customerNumber: NUMBERS.searched,
    group: "RED",
    status: "ACTIVE",
    lastName: SURNAME,
    certificateValidUntil: CERTIFICATES.valid,
    // Two cards, so `281k1` is a number the household no longer holds. The list is about households:
    // typing the old number must still find them, which is what the second card is here to prove.
    cards: 2,
    reminderCount: 0,
  },
  {
    customerNumber: NUMBERS.blue,
    group: "BLUE",
    status: "ACTIVE",
    lastName: faker.person.lastName(),
    certificateValidUntil: CERTIFICATES.expiringSoon,
    cards: 1,
    reminderCount: 0,
  },
  {
    customerNumber: NUMBERS.blocked,
    group: "RED",
    status: "BLOCKED",
    lastName: faker.person.lastName(),
    certificateValidUntil: CERTIFICATES.valid,
    cards: 1,
    reminderCount: 0,
  },
  {
    customerNumber: NUMBERS.archived,
    group: "BLUE",
    status: "ARCHIVED",
    lastName: SURNAME,
    certificateValidUntil: CERTIFICATES.valid,
    cards: 1,
    reminderCount: 0,
  },
  {
    customerNumber: NUMBERS.expired,
    group: "RED",
    status: "ACTIVE",
    lastName: faker.person.lastName(),
    certificateValidUntil: CERTIFICATES.expired,
    cards: 1,
    reminderCount: 2,
  },
];

/**
 * What the seeded households add to the group balance.
 *
 * Blocked households still hold their slot and still count; archived ones have given theirs up, so
 * the BLUE household above is the only one of the two that shows. Asserted as a *delta* on what the
 * screen said before the seed, because the shared register carries whatever the specs before this one
 * left behind — an absolute figure here would be an assertion about them.
 */
const SEEDED_BALANCE = { red: 3, blue: 1 } as const;

/** Insert one household with a grown-up, a child, its certificate and its cards. */
async function seedHousehold(seed: Seed): Promise<void> {
  const firstName = faker.person.firstName();
  const childFirstName = faker.person.firstName();
  const grownUpBirthDate = new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`);
  const archived = seed.status === "ARCHIVED";

  await prisma.customer.create({
    data: {
      customerNumber: seed.customerNumber,
      firstName,
      lastName: seed.lastName,
      // Written beside the names they come from — the search compares the folded columns, and a row
      // seeded without them is a household the list could never find.
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(seed.lastName),
      birthDate: grownUpBirthDate,
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      group: seed.group,
      status: seed.status,
      blockReason: seed.status === "BLOCKED" ? "Hausverbot nach Vorfall am Ausgabetag." : null,
      archiveReason: archived ? "Umgezogen, telefonisch abgemeldet." : null,
      archivedAt: archived ? new Date("2025-11-03T10:00:00.000Z") : null,
      reminderCount: seed.reminderCount,
      notes: "",
      householdMembers: {
        create: [
          { firstName, lastName: seed.lastName, birthDate: grownUpBirthDate },
          {
            firstName: childFirstName,
            lastName: seed.lastName,
            birthDate: new Date(`${CHILD_BIRTH_DATE}T00:00:00.000Z`),
          },
        ],
      },
      certificates: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: new Date(`${seed.certificateValidUntil}T00:00:00.000Z`),
          recordedAt: new Date("2025-01-02T00:00:00.000Z"),
        },
      },
      cards: {
        // The printed counts match the household exactly, so none of these cards is due for reissue
        // (US-13) and this spec leaves the home screen's badge where it found it.
        create: Array.from({ length: seed.cards }, (_, index) => ({
          index: index + 1,
          issuedAt: new Date("2025-01-02T00:00:00.000Z"),
          reason: index === 0 ? "FIRST_ISSUE" : "LOST",
          grownUpsAtIssue: 1,
          childrenAtIssue: 1,
          groupAtIssue: seed.group,
        })),
      },
    },
  });
}

/** The customer numbers on screen, in the order the table lists them. */
async function shownNumbers(page: Page): Promise<ReadonlyArray<string>> {
  return page
    .getByTestId("customer-row")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-customer-number") ?? ""));
}

/** Only this spec's own households, so an assertion cannot be moved by another spec's rows. */
async function shownSeeded(page: Page): Promise<ReadonlyArray<string>> {
  const ours = Object.values(NUMBERS).map(String);
  return (await shownNumbers(page)).filter((number) => ours.includes(number));
}

/** The group balance as the screen states it. */
async function groupCounts(page: Page): Promise<{ red: number; blue: number }> {
  const counts = page.getByTestId("group-counts");
  const [red, blue] = await Promise.all([
    counts.getAttribute("data-red"),
    counts.getAttribute("data-blue"),
  ]);
  return { red: Number(red), blue: Number(blue) };
}

/** One household's row, addressed by the number it holds. */
function row(page: Page, customerNumber: number): Locator {
  return page.locator(`[data-customer-number="${customerNumber}"]`);
}

/** Press "Filtern" and wait for the navigation that writes the controls into the URL. */
async function applyFilters(page: Page): Promise<void> {
  await Promise.all([
    page.waitForURL(/\/kunden\?/),
    page.getByRole("button", { name: de.customerList.filters.submit }).click(),
  ]);
}

test.describe.configure({ mode: "serial" });

test.describe("Kundenliste durchsuchen und filtern", () => {
  /** What the balance said before this spec seeded anything — the baseline the deltas are read on. */
  let balanceBefore: { red: number; blue: number };

  test.beforeAll(async ({ browser }) => {
    pinToday();

    // Read the balance before the seed, through the screen itself: the shared register already holds
    // whatever ran before this file, so "matches the seeded data" can only be checked as a change.
    const page = await browser.newPage();
    await page.goto("/kunden");
    balanceBefore = await groupCounts(page);
    await page.close();

    for (const seed of SEEDS) {
      await seedHousehold(seed);
    }
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it behind would freeze January for every spec
    // that follows, not just this one.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("findet einen Haushalt über einen Teil des Nachnamens, ohne Umlaut und in Kleinschrift", async ({
    page,
  }) => {
    await page.goto("/kunden");
    await page.getByTestId("customer-search").fill(SEARCH_PREFIX);
    await applyFilters(page);

    // The archived namesake is on the same prefix and stays out: hidden by default (FR-4).
    expect(await shownNumbers(page)).toEqual([String(NUMBERS.searched)]);
    await expect(row(page, NUMBERS.searched)).toContainText(SURNAME);
  });

  test("eine Kartennummer führt zu dem Haushalt, der die Karte hält", async ({ page }) => {
    // The number of the household's *first* card, which they have since replaced. The list is about
    // households, so the index is dropped and the current card is what the row shows.
    await page.goto(`/kunden?suche=${NUMBERS.searched}k1`);

    expect(await shownNumbers(page)).toEqual([String(NUMBERS.searched)]);
    await expect(row(page, NUMBERS.searched).getByTestId("customer-row-card")).toHaveText(
      `${NUMBERS.searched}k2`,
    );
  });

  test("der Status-Filter „gesperrt“ zeigt ausschließlich gesperrte Haushalte", async ({
    page,
  }) => {
    await page.goto("/kunden");
    await page.getByTestId("status-filter").selectOption("BLOCKED");
    await applyFilters(page);

    // Every row on screen, not only this spec's: "only blocked customers" is a claim about the whole
    // table, and the other specs' blocked household would expose a filter that merely sorts.
    const statuses = await page
      .getByTestId("customer-row")
      .evaluateAll((rows) => rows.map((element) => element.getAttribute("data-status")));
    expect(new Set(statuses)).toEqual(new Set(["BLOCKED"]));
    expect(await shownSeeded(page)).toEqual([String(NUMBERS.blocked)]);
  });

  test("archivierte Haushalte erscheinen erst, wenn der Schalter gesetzt ist", async ({ page }) => {
    await page.goto(`/kunden?suche=${SEARCH_PREFIX}`);
    expect(await shownNumbers(page)).toEqual([String(NUMBERS.searched)]);

    await page.getByTestId("archived-toggle").check();
    await applyFilters(page);

    // The two share a surname, so nothing but the toggle can be what let the second one through.
    expect(await shownNumbers(page)).toEqual([String(NUMBERS.searched), String(NUMBERS.archived)]);
    await expect(row(page, NUMBERS.archived).getByTestId("customer-row-status")).toHaveText(
      de.customers.status.ARCHIVED,
    );
  });

  test("der Nachweis-Filter trennt abgelaufene von gültigen Nachweisen", async ({ page }) => {
    await page.goto("/kunden");
    await page.getByTestId("certificate-filter").selectOption("EXPIRED");
    await applyFilters(page);

    expect(await shownSeeded(page)).toEqual([String(NUMBERS.expired)]);
    const expired = row(page, NUMBERS.expired);
    await expect(expired.getByTestId("customer-row-certificate-state")).toHaveText(
      de.customerList.certificateStates.EXPIRED,
    );
    await expect(expired.getByTestId("customer-row-reminders")).toHaveText("2");

    // The other two states are stated on their own rows, unfiltered — the same date read three ways.
    await page.goto("/kunden");
    await expect(
      row(page, NUMBERS.searched).getByTestId("customer-row-certificate-state"),
    ).toHaveText(de.customerList.certificateStates.VALID);
    await expect(row(page, NUMBERS.blue).getByTestId("customer-row-certificate-state")).toHaveText(
      de.customerList.certificateStates.EXPIRING_SOON,
    );
  });

  test("die Gruppenzahlen zählen den ganzen Bestand und ändern sich durch einen Filter nicht", async ({
    page,
  }) => {
    await page.goto("/kunden");
    const unfiltered = await groupCounts(page);

    // The blocked household counts, the archived one does not: the balance is about who holds a slot.
    expect(unfiltered).toEqual({
      red: balanceBefore.red + SEEDED_BALANCE.red,
      blue: balanceBefore.blue + SEEDED_BALANCE.blue,
    });
    await expect(page.getByTestId("group-counts")).toHaveText(
      de.customerList.groupBalance(unfiltered.red, unfiltered.blue),
    );

    await page.getByTestId("group-filter").selectOption("BLUE");
    await applyFilters(page);

    // The table now shows one of this spec's households and the balance still shows both groups —
    // it answers "which group is smaller", which the current filter has no bearing on (FR-3).
    expect(await shownSeeded(page)).toEqual([String(NUMBERS.blue)]);
    expect(await groupCounts(page)).toEqual(unfiltered);
  });

  test("die Filter stehen in der URL und ein Reload stellt dieselbe Ansicht wieder her", async ({
    page,
  }) => {
    await page.goto("/kunden");
    await page.getByTestId("customer-search").fill(SEARCH_PREFIX);
    await page.getByTestId("group-filter").selectOption("BLUE");
    await page.getByTestId("archived-toggle").check();
    await applyFilters(page);

    const bookmarked = new URL(page.url());
    expect(bookmarked.searchParams.get("suche")).toBe(SEARCH_PREFIX);
    expect(bookmarked.searchParams.get("gruppe")).toBe("BLUE");
    expect(bookmarked.searchParams.get("archiv")).toBe("1");

    const shown = await shownNumbers(page);
    expect(shown).toEqual([String(NUMBERS.archived)]);

    // A reload is the cheap version of the real case: the same link opened tomorrow, or pasted to a
    // colleague. The controls have to come back set, or the URL would be state the screen forgot.
    await page.reload();
    expect(page.url()).toBe(bookmarked.href);
    expect(await shownNumbers(page)).toEqual(shown);
    await expect(page.getByTestId("customer-search")).toHaveValue(SEARCH_PREFIX);
    await expect(page.getByTestId("group-filter")).toHaveValue("BLUE");
    await expect(page.getByTestId("archived-toggle")).toBeChecked();
  });
});
