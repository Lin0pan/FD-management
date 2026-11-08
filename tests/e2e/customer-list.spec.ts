import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { foldName } from "@/domain/customer/nameSearch";
import { de } from "@/i18n/de";
import {
  BELOW_BREAKPOINT,
  GATE_WIDTH,
  expectNoHorizontalOverflow,
  expectNothingCovers,
  expectTruncated,
  expectWithin,
} from "./layout";
import { fillDay, typedDay } from "./day";
import { SHARED } from "./registers";
import { releaseNumbers, seedEndedSession } from "./seeding";

/**
 * Browsing and searching the register at /kunden (`tasks/prd-us-15-customer-list.md` §US-15.4).
 *
 * Every filter is already proved twice below this screen. What neither gate can see is the screen:
 * that the one search box reads a name *and* a card number, that the archived toggle is off until
 * somebody switches it on, that the group balance keeps counting the whole register while the table
 * is filtered to one row, and that the view survives a reload as a link.
 *
 * Five households are seeded through Prisma for the *spread* — both groups, all three statuses, all
 * three certificate states. Two share a surname on purpose, one active and one archived, so the
 * archived filter is the only thing that can tell them apart.
 */

// A fixed seed so a failure is reproducible; only the other names and the addresses come from Faker.
// Every date stays a literal, because the certificate states are decided by dates.
faker.seed(20260729);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/**
 * The day this spec is judged on: Thursday 08.01.2026, 09:00 UTC.
 *
 * Nothing here depends on an afternoon being under way — the list is a read. It is pinned because the
 * three certificate states are relative to *today*: "läuft bald ab" is within 30 days of it, and a
 * spec whose today drifted would assert one bucket and be shown another.
 */
const TODAY = "2026-01-08T09:00:00.000Z";

/**
 * The numbers this spec owns — clear of the low sequence the registration, card, archive and
 * re-registration specs allocate against, and of the counter (201–209/239), allowance (211), serve
 * (213–219), number change (221–229), reminders (231), block (241), reissue (251) and age-13 (271)
 * specs in the shared
 * `data/e2e.db`. 286 belongs to this file too — see {@link LONG_NAME_SEED}, which is seeded and
 * removed inside its own block rather than listed here.
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

/**
 * The applicants this spec puts on the waiting list to read the hub's badge, and the surname it
 * takes them off again by.
 *
 * Invented for the same reason {@link SURNAME} is, and the count is stated once because the badge
 * spells it out: the assertion is the *number*, so it may not be a length nobody wrote down. The
 * waiting list is otherwise untouched on the shared register — `waiting-list.spec.ts` owns its own —
 * which is what lets this spec read the empty state as well as the counted one.
 */
const WAITING_SURNAME = "Wartenbrink";
const WAITING_APPLICANTS = 2;
/** Before {@link TODAY}, so the applicants are already waiting on the day the screen is read. */
const WAITING_ADDED_ON = "2026-01-05T09:00:00.000Z";

/** Born well before 13 years ago: a grown-up. Comfortably inside the last 13 years: a child. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
const CHILD_BIRTH_DATE = "2020-06-15";

/** The three certificate states, as dates around {@link TODAY} and its 30-day warning window. */
const CERTIFICATES = {
  valid: "2027-06-30",
  expiringSoon: "2026-01-20",
  expired: "2025-12-31",
} as const;

/** Hand-outs at afternoons before {@link TODAY}, and the dates the list states for them. */
const HANDOUTS = {
  earlier: "2025-12-04T14:00:00.000Z",
  latest: "2025-12-18T14:30:00.000Z",
  beforeArchiving: "2025-10-23T14:00:00.000Z",
} as const;

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

/** One seeded household, as this spec's table below states it. */
interface Seed {
  readonly customerNumber: number;
  /** Overrides Faker's draw, for the one household whose *length* is the thing under test. */
  readonly firstName?: string;
  readonly status: "ACTIVE" | "BLOCKED" | "ARCHIVED";
  readonly lastName: string;
  readonly certificateValidUntil: string;
  /** How many cards the household has been issued. The current one is the highest index. */
  readonly cards: number;
  readonly reminderCount: number;
  /** The instants of the household's hand-outs, each at an ended afternoon of its own. */
  readonly handouts?: ReadonlyArray<string>;
  /** The household's size, the customer counted among the grown-ups. One and one when absent. */
  readonly grownUps?: number;
  readonly children?: number;
}

/**
 * The household whose name is longer than the column that has to hold it — DF's first finding on
 * their first day of testing.
 *
 * Invented for the same reason {@link SURNAME} is, and long on purpose rather than by accident: a
 * double surname and a double first name is an ordinary German name, and at `text-sm` the pair is
 * half as wide again as the column. Kept out of {@link SEEDS} so the rest of the file's expected
 * numbers and its balance delta stay where they are.
 */
const LONG_NAME_SEED: Seed = {
  customerNumber: 286,
  firstName: "Maximiliane-Friederike",
  status: "ACTIVE",
  lastName: "Schmiedeberg-Oberhausenkirchner",
  certificateValidUntil: CERTIFICATES.valid,
  cards: 1,
  reminderCount: 0,
};

/** One household of {@link LONG_NAME_SEED}'s kind, for a block that seeds and removes its own. */
function countSeed(customerNumber: number, status: Seed["status"]): Seed {
  return {
    customerNumber,
    status,
    lastName: faker.person.lastName(),
    certificateValidUntil: CERTIFICATES.valid,
    cards: 1,
    reminderCount: 0,
  };
}

/** The name as the row writes it, which is the string the cut-off cell must still carry whole. */
const LONG_NAME = `${LONG_NAME_SEED.lastName}, ${LONG_NAME_SEED.firstName}`;

/**
 * The register this spec asserts against, in one table.
 *
 * Read down the columns rather than across the rows: both groups, all three statuses and all three
 * certificate states are present, and the archived household shares the searched one's surname.
 */
const SEEDS: ReadonlyArray<Seed> = [
  {
    customerNumber: NUMBERS.searched,
    status: "ACTIVE",
    lastName: SURNAME,
    certificateValidUntil: CERTIFICATES.valid,
    // Two cards, so `281k1` is a number the household no longer holds. The list is about households:
    // typing the old number must still find them, which is what the second card is here to prove.
    cards: 2,
    reminderCount: 0,
    // Latest first, so a column showing the first hand-out it read would show the wrong one.
    handouts: [HANDOUTS.latest, HANDOUTS.earlier],
  },
  {
    customerNumber: NUMBERS.blue,
    status: "ACTIVE",
    lastName: faker.person.lastName(),
    certificateValidUntil: CERTIFICATES.expiringSoon,
    cards: 1,
    reminderCount: 0,
  },
  {
    customerNumber: NUMBERS.blocked,
    status: "BLOCKED",
    lastName: faker.person.lastName(),
    certificateValidUntil: CERTIFICATES.valid,
    cards: 1,
    reminderCount: 0,
  },
  {
    customerNumber: NUMBERS.archived,
    status: "ARCHIVED",
    lastName: SURNAME,
    certificateValidUntil: CERTIFICATES.valid,
    cards: 1,
    reminderCount: 0,
    handouts: [HANDOUTS.beforeArchiving],
  },
  {
    customerNumber: NUMBERS.expired,
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
  const firstName = seed.firstName ?? faker.person.firstName();
  const grownUps = seed.grownUps ?? 1;
  const children = seed.children ?? 1;
  const grownUpBirthDate = new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`);
  const archived = seed.status === "ARCHIVED";

  // Idempotent, so a CI retry can re-run this block instead of dying on the

  // unique customer number (tests/e2e/seeding.ts).

  await releaseNumbers(prisma, seed.customerNumber);

  const { id } = await prisma.customer.create({
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
      status: seed.status,
      blockReason: seed.status === "BLOCKED" ? "Hausverbot nach Vorfall am Ausgabetag." : null,
      archiveReason: archived ? "Umgezogen, telefonisch abgemeldet." : null,
      archivedAt: archived ? new Date("2025-11-03T10:00:00.000Z") : null,
      reminderCount: seed.reminderCount,
      notes: "",
      householdMembers: {
        create: [
          { firstName, lastName: seed.lastName, birthDate: grownUpBirthDate },
          ...Array.from({ length: grownUps - 1 }, () => ({
            firstName: faker.person.firstName(),
            lastName: seed.lastName,
            birthDate: grownUpBirthDate,
          })),
          ...Array.from({ length: children }, () => ({
            firstName: faker.person.firstName(),
            lastName: seed.lastName,
            birthDate: new Date(`${CHILD_BIRTH_DATE}T00:00:00.000Z`),
          })),
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
          customerNumber: seed.customerNumber,
          index: index + 1,
          issuedAt: new Date("2025-01-02T00:00:00.000Z"),
          printedAt: new Date("2025-01-02T00:00:00.000Z"),
          reason: index === 0 ? "FIRST_ISSUE" : "LOST",
          grownUpsAtIssue: grownUps,
          childrenAtIssue: children,
        })),
      },
    },
    select: { id: true },
  });
  for (const at of seed.handouts ?? []) {
    await prisma.distributionRecord.create({
      data: {
        customerId: id,
        sessionId: await seedEndedSession(prisma, { at: new Date(at) }),
        date: new Date(at),
        showedUp: true,
        paidCents: 300,
        priceCents: 300,
      },
    });
  }
}

/**
 * Put {@link WAITING_APPLICANTS} people on the waiting list, straight through Prisma.
 *
 * Through the database rather than through the form because the claim under test is the *count* on
 * the hub: `waiting-list.spec.ts` already drives the form, and typing two applications here would
 * prove US-12 again at the cost of two page loads.
 */
async function seedWaitingList(): Promise<void> {
  for (let index = 0; index < WAITING_APPLICANTS; index += 1) {
    await prisma.waitingListEntry.create({
      data: {
        firstName: faker.person.firstName(),
        lastName: WAITING_SURNAME,
        birthDate: new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`),
        street: faker.location.street(),
        houseNumber: faker.location.buildingNumber(),
        zip: faker.location.zipCode("#####"),
        city: faker.location.city(),
        contactNote: null,
        certificateType: "Jobcenter-Bescheid",
        certificateValidUntil: new Date(`${CERTIFICATES.valid}T00:00:00.000Z`),
        addedOn: new Date(WAITING_ADDED_ON),
      },
    });
  }
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

/**
 * How the table header is positioned, as the browser resolved it — which is the pair that has to
 * agree with the scrollport, and the pair a Tailwind variant decides.
 */
async function stickiness(page: Page): Promise<{ position: string; top: string }> {
  return page.locator('[data-testid="customer-table"] thead').evaluate((head: HTMLElement) => {
    const style = getComputedStyle(head);
    return { position: style.position, top: style.top };
  });
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
    // The applicants go too: a waiting list left behind would be a count on the hub that nobody
    // wrote. The seeded households stay — they are the register the other specs read a delta
    // against.
    await prisma.waitingListEntry.deleteMany({ where: { lastName: WAITING_SURNAME } });
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

  test("über einer gefilterten Liste stehen die Filter, die sie gefiltert haben", async ({
    page,
  }) => {
    // The unfiltered register says nothing: the line's being there at all is what marks a list as
    // filtered, which is the whole of what it is for.
    await page.goto("/kunden");
    await expect(page.getByTestId("customer-list-filters")).toHaveCount(0);

    await page.getByTestId("customer-search").fill(SEARCH_PREFIX);
    await page.getByTestId("archived-toggle").check();
    await applyFilters(page);

    // Rows, deliberately: the filters used to be named only where the table was empty, so a list
    // with hits was the one that could not be told from the whole register.
    expect(await shownNumbers(page)).toEqual([String(NUMBERS.searched), String(NUMBERS.archived)]);
    const clauses = de.customerList.filterClauses;
    await expect(page.getByTestId("customer-list-filters")).toHaveText(
      de.customerList.filterSummary(
        [clauses.search(SEARCH_PREFIX), clauses.archivedIncluded].join(", "),
      ),
    );
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

    // The other two states are stated on their own rows, unfiltered — the same date read three ways.
    await page.goto("/kunden");
    await expect(
      row(page, NUMBERS.searched).getByTestId("customer-row-certificate-state"),
    ).toHaveText(de.customerList.certificateStates.VALID);
    await expect(row(page, NUMBERS.blue).getByTestId("customer-row-certificate-state")).toHaveText(
      de.customerList.certificateStates.EXPIRING_SOON,
    );
  });

  test("Erwachsene und Kinder teilen eine Spalte und bleiben doch zwei Angaben", async ({
    page,
  }) => {
    // The two counts share one cell to give the name column back 174px, but they are still two facts
    // — so the cell holds two spans, not one string reading "1 + 1". Nothing else in the suite
    // watches that, and collapsing them would be invisible on a green run.
    await page.goto("/kunden");
    const household = row(page, NUMBERS.searched);

    await expect(household.getByTestId("customer-row-grown-ups")).toHaveText("1");
    await expect(household.getByTestId("customer-row-children")).toHaveText("1");
  });

  test("„Letzte Ausgabe“ steht an Stelle der Erinnerungen und nennt das Datum der jüngsten Ausgabe", async ({
    page,
  }) => {
    // DF read the reminders off the counter and the record, not off the register (US-45).
    await page.goto("/kunden");

    const table = page.getByTestId("customer-table");
    await expect(
      table.getByRole("columnheader", { name: de.customerList.table.lastHandout }),
    ).toHaveCount(1);
    await expect(
      table.getByRole("columnheader", { name: de.customerList.table.reminders }),
    ).toHaveCount(0);
    await expect(row(page, NUMBERS.searched).getByTestId("customer-row-last-handout")).toHaveText(
      "18.12.2025",
    );
  });

  test("ein Haushalt ohne Ausgabe steht als Strich, ein archivierter mit seinem Datum", async ({
    page,
  }) => {
    await page.goto("/kunden");
    await expect(row(page, NUMBERS.blue).getByTestId("customer-row-last-handout")).toHaveText(
      de.customerList.table.none,
    );

    await page.getByTestId("archived-toggle").check();
    await applyFilters(page);
    await expect(row(page, NUMBERS.archived).getByTestId("customer-row-last-handout")).toHaveText(
      "23.10.2025",
    );
  });

  test("beide Karten der Seite tragen eine echte Überschrift", async ({ page }) => {
    // The regression `docs/guideline/ui_styling_guide.md` §9 exists to prevent: `CardTitle` is a
    // `div`, so converting `<section><h2>` to a `Card` silently deletes the heading and leaves the
    // screen with nothing between its `h1` and 240 rows. The pilot shipped that twice. Asserted here
    // so that this screen, at least, the suite can see it.
    await page.goto("/kunden");

    await expect(page.getByRole("heading", { level: 2 })).toHaveText([
      de.customerList.overviewTitle,
      de.customerList.listTitle,
    ]);
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

  test("jede der drei Aktionen über der Liste führt auf ihre Seite", async ({ page }) => {
    // The hub is the section's one page (US-17.2): the three things staff do *with* customers are
    // reachable from it, and each link is checked by arriving — the heading of the screen it names.
    const actions = [
      { testId: "hub-new-customer", path: "/kunden/neu", heading: de.customers.new.heading },
      { testId: "hub-waiting-list", path: "/warteliste", heading: de.waitingList.heading },
      { testId: "hub-cards-due", path: "/karten-neuausstellung", heading: de.cardsDue.heading },
    ];

    for (const action of actions) {
      await page.goto("/kunden");
      await page.getByTestId(action.testId).click();
      await page.waitForURL((url) => url.pathname === action.path);

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(action.heading);
    }
  });

  test("das Warteliste-Badge zählt die Wartenden und meldet einen freien Platz in Worten", async ({
    page,
  }) => {
    const badge = page.getByTestId("waiting-list-badge");

    // Nobody is waiting yet, and the badge says so in words rather than disappearing (US-18.1): a
    // badge that vanished at zero could not be told apart from one whose number failed to load.
    await page.goto("/kunden");
    await expect(badge).toHaveText(de.customerList.actions.waitingListBadge(0, false));
    await expect(badge).toHaveAttribute("data-free-slot", "false");

    await seedWaitingList();
    await page.goto("/kunden");

    // The shared register is nowhere near its quota, so a number is free the moment somebody waits.
    // The state is read off the element as data, never off its colour — the tint is the half of this
    // marking that not every staff member can see, which is why "Platz frei" is in the text at all
    // (US-18.2, US-03.4).
    await expect(badge).toHaveText(
      de.customerList.actions.waitingListBadge(WAITING_APPLICANTS, true),
    );
    await expect(badge).toHaveAttribute("data-free-slot", "true");

    // It names nobody and no customer number, and the hub carries no banner in this state either:
    // who gets the number is decided on /kunden/neu, not above the register (FR-1, FR-5).
    await expect(badge).not.toContainText(WAITING_SURNAME);
    await expect(page.getByTestId("waiting-list-free-slot")).toHaveCount(0);

    // The number is part of the link rather than a figure standing beside it — clicking it opens the
    // queue it counts.
    await badge.click();
    await page.waitForURL((url) => url.pathname === "/warteliste");
    await expect(page.getByTestId("waiting-list-row")).toHaveCount(WAITING_APPLICANTS);
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

  /**
   * The register as it is *seen*, at both sides of the one breakpoint this screen switches at.
   *
   * Every other test in this file reads the table out of the DOM, and the whole of the bug these two
   * exist for was that the DOM was right: the first row was rendered, counted in „N Haushalte“ and
   * counted in the group balance, with the sticky header painted opaquely over it at every width
   * below `xl`. DF reported it as customer number 1 having disappeared from the list, and as a group
   * filter showing three of four — which is the same sentence, because it is always the first row of
   * whatever is on screen. See `tests/e2e/layout.ts` for why the check is a hit-test.
   */
  test.describe("die Liste, wie sie zu sehen ist", () => {
    test.use({ viewport: BELOW_BREAKPOINT });

    test("unterhalb des Breakpoints verdeckt der Tabellenkopf die erste Zeile nicht", async ({
      page,
    }) => {
      // Below `xl` the table's container is its own scrollport, so a header offset into it is pushed
      // *down* over the first row rather than left where it is. The fix is that the header stops
      // being sticky at exactly the width where the container starts scrolling.
      await page.goto("/kunden");
      const first = page.getByTestId("customer-row").first();
      await expect(first).toBeVisible();
      await expectNothingCovers(first, "die erste Zeile der Liste");

      // And again under a filter: the row underneath the header is whichever one is now on top, which
      // is how the same fault reached DF a second time as "eine Blaue fehlt".
      await page.goto("/kunden?gruppe=BLUE");
      const firstBlue = page.getByTestId("customer-row").first();
      await expect(firstBlue).toBeVisible();
      await expectNothingCovers(firstBlue, "die erste Zeile der gefilterten Liste");

      // The rule behind the symptom, so that a future offset cannot quietly reintroduce it: where the
      // container is the scrollport, the header does not stick at all. `sticky top-12` here is what
      // pushed it down over the row — a sticky box shifts in either direction to satisfy its offset,
      // and this scrollport's top is already 0.
      await expect(stickiness(page)).resolves.toEqual({ position: "static", top: "auto" });
    });
  });

  test.describe("die Liste auf der Zielbreite", () => {
    test.use({ viewport: { width: GATE_WIDTH, height: 720 } });

    test("auf der Zielbreite klebt der Tabellenkopf unter der Navigation, ohne eine Zeile zu verdecken", async ({
      page,
    }) => {
      await page.goto("/kunden");
      await expectNothingCovers(
        page.getByTestId("customer-row").first(),
        "die erste Zeile der Liste",
      );

      // The other half of the same rule, or "nothing covers the first row" could be satisfied for
      // good by deleting the sticky header. Here the window is the scrollport, so the offset is the
      // nav's own height — read off the nav rather than written out as 48, so the two cannot drift.
      // Whether it *then* sticks is the browser's business and is measured by hand against an
      // inflated register (`docs/guideline/ui_styling_guide.md` §11): the shared register is however
      // many rows the specs before this one left behind, which is no basis for scrolling anything.
      const nav = await page.getByTestId("main-nav").boundingBox();
      expect(nav).not.toBeNull();
      await expect(stickiness(page)).resolves.toEqual({
        position: "sticky",
        top: `${nav?.height ?? 0}px`,
      });
    });
  });

  test("„Zurücksetzen“ leert die Filterfelder, nicht nur die Liste", async ({ page }) => {
    await page.goto("/kunden");
    await page.getByTestId("customer-search").fill(SEARCH_PREFIX);
    await page.getByTestId("status-filter").selectOption("BLOCKED");
    await page.getByTestId("archived-toggle").check();
    await applyFilters(page);

    await Promise.all([
      page.waitForURL((url) => url.pathname === "/kunden" && url.search === ""),
      page.getByRole("link", { name: de.customerList.filters.reset }).click(),
    ]);

    // The controls, not only the table: as a router navigation this reset re-rendered the same DOM,
    // where React writes `defaultValue` on mount alone — so the boxes went on showing filters the
    // list had already dropped, and a screenshot of the register could not be told from a screenshot
    // of a filtered one. Every field the staff member touched is asserted, because "dirty" is what
    // decides it and only a touched field is dirty.
    await expect(page.getByTestId("customer-search")).toHaveValue("");
    await expect(page.getByTestId("status-filter")).toHaveValue("");
    await expect(page.getByTestId("archived-toggle")).not.toBeChecked();
  });

  /**
   * The two day filters (US-46.3). Both are strict: a day names the households *before* it, and the
   * one the boundary falls on is the one each test steps across. Every day is read off this file's
   * own fixtures around {@link TODAY}.
   */
  test.describe("„Letzte Ausgabe vor“ und „Nachweis endet vor“", () => {
    const lastHandout = (page: Page): Locator => page.getByTestId("last-handout-filter");
    const certificateEnd = (page: Page): Locator => page.getByTestId("certificate-end-filter");
    /** The day {@link HANDOUTS.latest} fell on, and the one after it. */
    const servedOn = HANDOUTS.latest.slice(0, 10);
    const dayAfterServed = "2025-12-19";

    test("eine Ausgabe vor dem Tag zählt, eine am Tag selbst nicht, keine Ausgabe nie", async ({
      page,
    }) => {
      await page.goto("/kunden");
      await fillDay(lastHandout(page), dayAfterServed);
      await applyFilters(page);
      // 282, 283 and 285 were never served, and the archived 284 is hidden by default.
      expect(await shownSeeded(page)).toEqual([String(NUMBERS.searched)]);
      await expect(page.getByTestId("customer-list-filters")).toContainText(
        de.customerList.filterClauses.lastHandoutBefore(typedDay(dayAfterServed)),
      );

      await page.goto(`/kunden?ausgabe-vor=${typedDay(servedOn)}`);
      expect(await shownSeeded(page)).toEqual([]);
    });

    test("ein Nachweis, der am Vortag endet, zählt, einer, der am Tag endet, nicht", async ({
      page,
    }) => {
      await page.goto("/kunden");
      await fillDay(certificateEnd(page), CERTIFICATES.expiringSoon);
      await applyFilters(page);
      expect(await shownSeeded(page)).toEqual([String(NUMBERS.expired)]);
      await expect(page.getByTestId("customer-list-filters")).toContainText(
        de.customerList.filterClauses.certificateEndsBefore(typedDay(CERTIFICATES.expiringSoon)),
      );

      await page.goto("/kunden?nachweis-vor=21.01.2026");
      expect(await shownSeeded(page)).toEqual([String(NUMBERS.blue), String(NUMBERS.expired)]);
    });

    test("der Tag steht so in der URL, wie er getippt wurde, und übersteht einen Reload", async ({
      page,
    }) => {
      await page.goto("/kunden");
      await fillDay(lastHandout(page), dayAfterServed);
      await applyFilters(page);
      expect(new URL(page.url()).searchParams.get("ausgabe-vor")).toBe(typedDay(dayAfterServed));

      await page.reload();
      await expect(lastHandout(page)).toHaveValue(typedDay(dayAfterServed));
      expect(await shownSeeded(page)).toEqual([String(NUMBERS.searched)]);
    });

    test("ein unlesbarer Tag bleibt stehen, wird markiert und filtert nichts", async ({ page }) => {
      await page.goto("/kunden?ausgabe-vor=31.02.2026");

      await expect(lastHandout(page)).toHaveValue("31.02.2026");
      await expect(lastHandout(page)).toHaveAttribute("aria-invalid", "true");
      const mark = page.getByTestId("last-handout-filter-error");
      await expect(mark).toHaveText(de.customers.errors.notADate);
      await expect(lastHandout(page)).toHaveAttribute(
        "aria-describedby",
        (await mark.getAttribute("id")) ?? "",
      );
      // Nothing filtered: every non-archived household of this file is still listed.
      expect(await shownSeeded(page)).toEqual(
        [NUMBERS.searched, NUMBERS.blue, NUMBERS.blocked, NUMBERS.expired].map(String),
      );
      await expect(page.getByTestId("customer-list-filters")).toHaveCount(0);
      await expect(certificateEnd(page)).not.toHaveAttribute("aria-invalid", "true");
    });

    test("„Zurücksetzen“ leert beide Tagesfelder", async ({ page }) => {
      await page.goto(`/kunden?ausgabe-vor=${typedDay(dayAfterServed)}&nachweis-vor=21.01.2026`);
      await expect(lastHandout(page)).toHaveValue(typedDay(dayAfterServed));

      await Promise.all([
        page.waitForURL((url) => url.pathname === "/kunden" && url.search === ""),
        page.getByRole("link", { name: de.customerList.filters.reset }).click(),
      ]);
      await expect(lastHandout(page)).toHaveValue("");
      await expect(certificateEnd(page)).toHaveValue("");
    });

    /** The second row stands under the selects, as wide as they are, at both sides of `lg`. */
    for (const width of [BELOW_BREAKPOINT.width, GATE_WIDTH]) {
      test(`bei ${width}px steht die zweite Filterzeile unter den Auswahlfeldern`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto("/kunden");
        await expectNoHorizontalOverflow(page.locator("html"), "die Seite");
        await expectNoHorizontalOverflow(page.locator('form[method="get"]'), "das Filterformular");

        for (const [day, select] of [
          [lastHandout(page), page.getByTestId("group-filter")],
          [certificateEnd(page), page.getByTestId("certificate-filter")],
        ] as const) {
          const [below, above] = await Promise.all([day.boundingBox(), select.boundingBox()]);
          expect(below).not.toBeNull();
          expect(above).not.toBeNull();
          expect(Math.abs((below?.x ?? 0) - (above?.x ?? 0))).toBeLessThanOrEqual(1);
          expect(Math.abs((below?.width ?? 0) - (above?.width ?? 0))).toBeLessThanOrEqual(1);
          expect(below?.y ?? 0).toBeGreaterThan(above?.y ?? 0);
        }
      });
    }
  });

  /**
   * The two count dropdowns (US-46.4). The boxes are whatever counts the register holds, which on
   * the shared register is every spec's households — so the boxes are compared with the table's own
   * „Erw. + Kinder“ column on the same page load, never with a list written here. Three households
   * of unusual sizes are seeded for the duration and removed again, so the rest of this file's
   * numbers stay where they are.
   */
  test.describe("„Erwachsene“ und „Kinder“", () => {
    /** 13 children occurs nowhere else; only the archived household brings it to the boxes. */
    const COUNT_SEEDS: ReadonlyArray<Seed> = [
      { ...countSeed(287, "ACTIVE"), grownUps: 3, children: 7 },
      { ...countSeed(288, "ACTIVE"), grownUps: 1, children: 0 },
      { ...countSeed(289, "ARCHIVED"), grownUps: 2, children: 13 },
    ];
    const ARCHIVED_ONLY = 13;
    /** The collapsed label with every box ticked. */
    const UNSET =
      de.customerList.filters.countLead(de.customerList.filters.children) +
      de.customerList.filters.countChoice(undefined);

    const summary = (page: Page): Locator => page.getByTestId("children-filter-summary");
    const box = (page: Page, count: number): Locator =>
      page.getByTestId(`children-filter-${count}`);

    /** The counts a dropdown offers, as numbers. */
    async function boxes(page: Page, testId: string): Promise<ReadonlyArray<number>> {
      return page
        .getByTestId(testId)
        .locator('input[type="checkbox"]')
        .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value)));
    }

    /** The distinct counts in one of the table's two „Erw. + Kinder“ spans, ascending. */
    async function column(page: Page, testId: string): Promise<ReadonlyArray<number>> {
      const shown = await page
        .getByTestId(testId)
        .evaluateAll((spans) => spans.map((span) => Number(span.textContent)));
      return [...new Set(shown)].sort((a, b) => a - b);
    }

    /** Press „Filtern“ and wait for the page the redirect settles on. */
    async function filterTo(page: Page, settled: (url: URL) => boolean): Promise<void> {
      await Promise.all([
        page.waitForURL((url) => url.searchParams.has("suche") && settled(url)),
        page.getByRole("button", { name: de.customerList.filters.submit }).click(),
      ]);
    }

    test.beforeAll(async () => {
      for (const seed of COUNT_SEEDS) {
        await seedHousehold(seed);
      }
    });

    test.afterAll(async () => {
      await releaseNumbers(prisma, ...COUNT_SEEDS.map((seed) => seed.customerNumber));
    });

    test("nur die vorkommenden Zahlen stehen zur Wahl, archivierte nur mit „Archivierte“", async ({
      page,
    }) => {
      await page.goto("/kunden");
      const offered = await boxes(page, "children-filter");
      expect(offered).toEqual(await column(page, "customer-row-children"));
      expect(offered).toContain(7);
      expect(offered).not.toContain(ARCHIVED_ONLY);
      const grownUps = await boxes(page, "grown-ups-filter");
      expect(grownUps).toEqual(await column(page, "customer-row-grown-ups"));

      await page.goto("/kunden?archiv=1");
      expect(await boxes(page, "children-filter")).toEqual(
        await column(page, "customer-row-children"),
      );
      expect(await boxes(page, "children-filter")).toContain(ARCHIVED_ONLY);

      // Status and group narrow the table, never the boxes.
      await page.goto("/kunden?status=BLOCKED&gruppe=BLUE");
      expect(await boxes(page, "children-filter")).toEqual(offered);
      expect(await boxes(page, "grown-ups-filter")).toEqual(grownUps);
    });

    test("ohne die 0 bei „Kinder“ bleiben nur Haushalte mit Kindern, auch nach einem Reload", async ({
      page,
    }) => {
      await page.goto("/kunden");
      await expect(summary(page)).toHaveText(UNSET);
      const ticked = (await boxes(page, "children-filter")).filter((count) => count !== 0);

      await summary(page).click();
      await box(page, 0).uncheck();
      // Nothing moves until „Filtern“.
      await expect(page.getByTestId("customer-list-filters")).toHaveCount(0);
      await filterTo(page, (url) => url.searchParams.has("kinder"));

      const url = new URL(page.url());
      expect(url.searchParams.getAll("kinder")).toEqual(ticked.map(String));
      expect(url.searchParams.has("erwachsene")).toBe(false);
      expect(await column(page, "customer-row-children")).not.toContain(0);
      await expect(row(page, 287)).toHaveCount(1);
      await expect(row(page, 288)).toHaveCount(0);
      const clause = de.customerList.filterClauses.children(ticked);
      await expect(page.getByTestId("customer-list-filters")).toContainText(clause);
      await expect(summary(page)).toHaveText(clause);
      await expect(summary(page)).toHaveAttribute("data-set", "true");
      await expect(page.getByTestId("grown-ups-filter-summary")).toHaveAttribute(
        "data-set",
        "false",
      );

      await page.reload();
      await expect(summary(page)).toHaveText(clause);
      await expect(box(page, 0)).not.toBeChecked();
      await expect(box(page, 7)).toBeChecked();
    });

    test("kein Kästchen angehakt heißt kein Treffer, und die Meldung nennt „Kinder: keine“", async ({
      page,
    }) => {
      await page.goto("/kunden");
      await summary(page).click();
      for (const count of await boxes(page, "children-filter")) {
        await box(page, count).uncheck();
      }
      await filterTo(page, (url) => url.searchParams.has("kinder"));

      expect(new URL(page.url()).searchParams.getAll("kinder")).toEqual(["keine"]);
      await expect(page.getByTestId("customer-row")).toHaveCount(0);
      await expect(page.getByTestId("customer-list-empty")).toContainText(
        de.customerList.filterClauses.children([]),
      );
      await expect(summary(page)).toHaveText(de.customerList.filterClauses.children([]));
    });

    test("alle wieder angehakt ist kein Filter, und die URL sagt es auch", async ({ page }) => {
      await page.goto("/kunden?kinder=7");
      await expect(summary(page)).toHaveText(de.customerList.filterClauses.children([7]));

      await summary(page).click();
      for (const count of await boxes(page, "children-filter")) {
        await box(page, count).check();
      }
      await filterTo(page, (url) => !url.searchParams.has("kinder"));

      await expect(summary(page)).toHaveText(UNSET);
      await expect(summary(page)).toHaveAttribute("data-set", "false");
      await expect(page.getByTestId("customer-list-filters")).toHaveCount(0);
      await expect(row(page, 288)).toHaveCount(1);
    });

    test("„Zurücksetzen“ hakt jedes Kästchen wieder an", async ({ page }) => {
      await page.goto("/kunden?kinder=keine&erwachsene=3");
      await expect(box(page, 0)).not.toBeChecked();

      await Promise.all([
        page.waitForURL((url) => url.pathname === "/kunden" && url.search === ""),
        page.getByRole("link", { name: de.customerList.filters.reset }).click(),
      ]);
      for (const testId of ["children-filter", "grown-ups-filter"]) {
        const unticked = page.getByTestId(testId).locator('input[type="checkbox"]:not(:checked)');
        await expect(unticked).toHaveCount(0);
      }
    });

    for (const width of [BELOW_BREAKPOINT.width, GATE_WIDTH]) {
      test(`bei ${width}px passt die Liste, und offen liegt sie über der Tabelle`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto("/kunden?kinder=7");
        await expectNoHorizontalOverflow(page.locator("html"), "die Seite");
        await expectNoHorizontalOverflow(page.locator('form[method="get"]'), "das Filterformular");
        await expectNothingCovers(page.getByTestId("customer-row").first(), "die erste Zeile");

        await summary(page).click();
        const last = page.getByTestId("children-filter").locator("label").last();
        await expectNothingCovers(last, "das letzte Kästchen");
        await expectNoHorizontalOverflow(page.locator("html"), "die Seite mit offener Liste");
      });
    }
  });

  /**
   * The register with a name too long for its column (DF, erster Testtag).
   *
   * Every cell in this table is `whitespace-nowrap`, so before this was fixed a long
   * „Nachname, Vorname“ could neither wrap nor be cut — it widened the column, and with it the whole
   * table. Below `xl` the container absorbed that by scrolling sideways, which took the last
   * column off the screen; at `xl` and above the container does not scroll, so the table simply grew out of
   * its card. Both halves are asserted, because the screen has two of them.
   *
   * Seeded and removed here rather than in the file's own `beforeAll`: an extra household in the
   * register would move the group balance and the expected-number lists every other test in this
   * file reads.
   */
  test.describe("ein Name, der länger ist als seine Spalte", () => {
    test.beforeAll(async () => {
      await seedHousehold(LONG_NAME_SEED);
    });

    test.afterAll(async () => {
      await releaseNumbers(prisma, LONG_NAME_SEED.customerNumber);
    });

    test("unterhalb des Breakpoints bleibt die letzte Spalte auf dem Schirm", async ({ page }) => {
      await page.setViewportSize(BELOW_BREAKPOINT);
      await page.goto("/kunden");

      const container = page.locator('[data-slot="table-container"]');
      await expectNoHorizontalOverflow(container, "die Kundenliste");
      await expectWithin(
        row(page, LONG_NAME_SEED.customerNumber).getByTestId("customer-row-last-handout"),
        container,
        "die Spalte „Letzte Ausgabe“",
      );
    });

    test("auf der Zielbreite bleibt die Tabelle in ihrer Karte", async ({ page }) => {
      await page.setViewportSize({ width: GATE_WIDTH, height: 720 });
      await page.goto("/kunden");

      const table = page.getByTestId("customer-table");
      await expectWithin(table, page.locator('[data-slot="card"]').last(), "die Kundenliste");
      await expectNoHorizontalOverflow(page.locator("html"), "die Seite");
    });

    test("der Name wird abgeschnitten gezeigt und bleibt vollständig gespeichert", async ({
      page,
    }) => {
      await page.setViewportSize(BELOW_BREAKPOINT);
      await page.goto(`/kunden?suche=${LONG_NAME_SEED.customerNumber}`);

      const link = row(page, LONG_NAME_SEED.customerNumber).getByTestId("customer-row-link");
      await expectTruncated(link, "der lange Name");
      // Cut off on screen and whole in the DOM, which is the whole of what DF asked for: the name is
      // still what the row is called, still what a screen reader reads, and still what the `title`
      // spells out for somebody who cannot tell two households apart from the part they can see.
      await expect(link).toHaveText(LONG_NAME);
      await expect(link).toHaveAttribute("title", LONG_NAME);
    });
  });
});
