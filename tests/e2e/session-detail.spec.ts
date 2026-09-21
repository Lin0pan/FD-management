import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { groupOf } from "@/domain/customer/group";
import { foldName } from "@/domain/customer/nameSearch";
import { formatEuros, parseEuros } from "@/domain/money";
import { clearRegister } from "@/infrastructure/prisma/test-support";
import { fillDay, fillSticky, hydrated, typedDay } from "./day";
import { ISOLATED } from "./registers";
import { fillCertificateTypeControl, fillPersonalData, type Person } from "./registration-form";
import {
  endSession,
  endSessionInHook,
  startSession,
  startSessionInHook,
  type HookFixtures,
} from "./session";

/**
 * A past afternoon shows the households **as they stood**
 * (`tasks/prd-us-37-session-overview-and-detail.md` §US-37.5).
 *
 * This is the only end-to-end proof that US-35 did anything at all. The capture has been written
 * at every ending since that batch and read by nothing until `/ausgabetermine/[id]` arrived, so
 * the one claim no unit gate can reach is the one below: a household corrected next week does not
 * change what last week's table says. Everything here is driven through the screens — the counter,
 * the record, the intake and the two new ones — because the freeze is worth nothing if it is only
 * true of the fakes.
 *
 * The narrative is one afternoon in test order: serve two households and read them live, end it and
 * watch the figures hold, **change the register underneath it** and watch the old ones stand,
 * reopen and watch the rows follow the record again, end it a second time, and finally hand one
 * household's number to somebody else — after which the row still names the household that was
 * actually served.
 *
 * **It owns a register** (`ISOLATED_SPECS`). Two of its claims are about the whole of one: the
 * overview is asserted as *the* list of afternoons rather than as a delta, and the number it
 * archives has to come back as a free slot the intake offers, which no quota over the shared
 * register's hundreds could leave room for. `no-shows.spec.ts` and `number-group.spec.ts` run ahead
 * of it and `waiting-list.spec.ts` behind, each emptying the register in its own `beforeAll`, so
 * what this file leaves is nobody's business but its own.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker.
faker.seed(20260921);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at for the isolated server. */
const NOW_FILE = ISOLATED.now;

/**
 * Now, read once so every fixture below is dated against one instant.
 *
 * **This spec runs on the real clock.** It saves a settings version, which is recorded at the real
 * now and is in force only there, and it ends and reopens afternoons that must be the latest ones
 * in the register — both of which a pinned January would put behind the real-time ones. Nothing it
 * asserts is a function of today anyway: which afternoon a household collected at is the session's
 * to say, not the calendar's (US-36).
 */
const NOW = new Date();
/** A year out, so both households are clear to serve whenever this suite runs. */
const VALID_CERTIFICATE = new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000);
/** Two years out: the renewal that must **not** reach the afternoon already closed. */
const RENEWED_CERTIFICATE = new Date(NOW.getTime() + 730 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
/** Born well before 13 years ago: a grown-up on any day this spec could run. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
const CERTIFICATE_TYPE = "Jobcenter-Bescheid";
/** The record's own Art-des-Nachweises control — one component behind four ids (US-33.5). */
const RENEWAL_TYPE_FIELD = "renewal-type-field";

/**
 * The register this spec works in: eight slots, decided here rather than inherited.
 *
 * The file before this one on the isolated server leaves a quota of its own, and the intake below
 * has to be offered a freed slot — so the number in force is set on the settings screen, where DF
 * would set it, instead of being read off whatever ran first.
 */
const QUOTA = 8;

/** The two slots this spec uses. Both **odd and therefore RED** (US-31), which is the afternoon. */
const NUMBERS = {
  /** Collects, is then renamed and its certificate renewed — the household the freeze is about. */
  corrected: 1,
  /** Collects, is archived, and has its number handed to somebody else (E-4). */
  handedOn: 3,
} as const;

/** Why the household gave its number back, and why the afternoon was opened again — the records. */
const ARCHIVE_REASON = "Umgezogen, kommt nicht mehr.";
const REOPEN_REASON = "Ein Betrag war falsch, die Ausgabe wurde zu früh beendet.";

/**
 * The database the isolated server is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is taken from `registers.ts` — the one place that knows which engine this run drives, and
 * therefore which register is behind it. It is resolved to an absolute path because a relative
 * SQLite url resolves against the schema directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(ISOLATED.database)}` });

/** A household as this spec knows it: the id the detail view links by, and the name on the row. */
interface Household extends Person {
  readonly id: number;
  readonly customerNumber: number;
}

/** Insert one active, one-person household with a current certificate and the card that took it. */
async function seedHousehold(customerNumber: number): Promise<Household> {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const birthDate = new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`);

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
        create: { type: CERTIFICATE_TYPE, validUntil: VALID_CERTIFICATE, recordedAt: NOW },
      },
      cards: {
        create: [
          {
            customerNumber,
            index: 1,
            issuedAt: NOW,
            reason: "FIRST_ISSUE",
            // Matching the seeded household, so nobody here is due a reissue (US-13).
            grownUpsAtIssue: 1,
            childrenAtIssue: 0,
          },
        ],
      },
    },
    select: { id: true },
  });

  return { id: customer.id, customerNumber, firstName, lastName };
}

/** Put the quota in force on the screen DF would use, on a page of the hook's own. */
async function setQuotaInHook({ browser, baseURL }: HookFixtures): Promise<void> {
  const page = await browser.newPage({ baseURL });
  try {
    await page.goto("/einstellungen");
    await fillSticky(page.locator("#quotaN"), String(QUOTA));
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();
    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);
  } finally {
    await page.close();
  }
}

/** Type a number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page, customerNumber: number): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(String(customerNumber));
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${customerNumber}`));
}

/**
 * Record the hand-out for the amount the field opens on, and answer with what that was.
 *
 * Read rather than typed: this spec sets no prices, so the figure every assertion below rests on is
 * whatever the policy in force asks for. Neither household carries an earlier hand-out, so the
 * amount asked **is** the bare price — which is why one figure stands under both money columns.
 */
async function serveForAmountAsked(page: Page): Promise<number> {
  // The verdict permits serving, said before the field is read: a household turned away would
  // otherwise fail five seconds later on an input that was never going to be there.
  await expect(page.getByTestId("serve-button")).toBeVisible();
  const asked = parseEuros(await page.getByTestId("serve-amount").inputValue());
  await page.getByTestId("serve-button").click();
  await expect(page.getByTestId("serve-recorded-confirmation")).toContainText(formatEuros(asked));
  return asked;
}

/** What the detail view says about a household, whichever of the two sources its row came from. */
interface RowState {
  readonly customerNumber: number;
  readonly firstName: string;
  readonly lastName: string;
  /** The card the row carries, `<slot>k<index>` — the slot it was **printed under** (ADR-016). */
  readonly cardNumber: string;
  /** „Nachweis bis", as the screen prints it. */
  readonly certificate: string;
  readonly paidCents: number;
}

/**
 * The row as the afternoon served it: the name, the card and the certificate the household had that
 * day. Every later state in this file is this one with the column that moved written over it.
 */
function asServed(household: Household, paidCents: number): RowState {
  return {
    customerNumber: household.customerNumber,
    firstName: household.firstName,
    lastName: household.lastName,
    cardNumber: `${household.customerNumber}k1`,
    certificate: germanDate(VALID_CERTIFICATE),
    paidCents,
  };
}

/** The row the afternoon names this household under — by its id, never by the slot it shows. */
function rowOf(page: Page, household: Household): Locator {
  return page.locator(`[data-testid="session-household-row"][data-customer-id="${household.id}"]`);
}

/** Every column of one household's row, read off the detail view. */
async function expectRow(page: Page, household: Household, expected: RowState): Promise<void> {
  const row = rowOf(page, household);
  await expect(row).toHaveCount(1);

  await expect(row.getByTestId("session-household-number")).toHaveText(
    String(expected.customerNumber),
  );
  await expect(row.getByTestId("session-household-name")).toHaveText(
    `${expected.lastName}, ${expected.firstName}`,
  );
  await expect(row.getByTestId("session-household-card")).toHaveText(expected.cardNumber);
  await expect(row.getByTestId("session-household-group")).toHaveText(
    de.customers.groups[groupOf(expected.customerNumber)],
  );
  await expect(row.getByTestId("session-household-grown-ups")).toHaveText("1");
  await expect(row.getByTestId("session-household-children")).toHaveText("0");
  await expect(row.getByTestId("session-household-price")).toHaveText(
    formatEuros(expected.paidCents),
  );
  await expect(row.getByTestId("session-household-certificate")).toHaveText(expected.certificate);
  await expect(row.getByTestId("session-household-reminders")).toHaveText(
    de.customerList.table.noReminders,
  );
  await expect(row.getByTestId("session-household-paid")).toHaveText(
    formatEuros(expected.paidCents),
  );
}

const pastSessions = de.distribution.pastSessions;

test.describe.configure({ mode: "serial" });

test.describe("Ein vergangener Ausgabetermin", () => {
  /** The two households, and what they were called and held when the afternoon served them. */
  let corrected: Household;
  let handedOn: Household;
  /** What each of them paid: read at the counter, asserted on every screen afterwards. */
  const paidCents: Record<number, number> = {};
  /** The afternoon this whole file is about, read off the overview in the first test. */
  let sessionId = 0;

  /** {@link asServed} for one of the two households, with what it paid when it collected. */
  function served(household: Household): RowState {
    return asServed(household, paidCents[household.customerNumber]);
  }

  test.beforeAll(async ({ browser, baseURL }) => {
    // The real clock, taken back rather than assumed: the file before this one on the isolated
    // server pins January and removes the pin in its own teardown, so this repairs a run that died
    // mid-afternoon and is a no-op otherwise.
    rmSync(NOW_FILE, { force: true });
    // Emptied, not merely freed of two numbers: this spec asserts the overview as *the* list of
    // afternoons, and a CI retry replays this block against the register the failed attempt left.
    // `clearRegister` takes the afternoons with the hand-outs, so the session is started after it.
    await clearRegister(prisma);
    await setQuotaInHook({ browser, baseURL });

    corrected = await seedHousehold(NUMBERS.corrected);
    handedOn = await seedHousehold(NUMBERS.handedOn);

    await startSessionInHook({ browser, baseURL }, "RED");
  });

  test.afterAll(async ({ browser, baseURL }) => {
    // Silent when nothing runs, which is how the last test leaves the register — this is the net
    // under a block that failed halfway through an afternoon (`tests/e2e/session.ts`).
    await endSessionInHook({ browser, baseURL });
    await prisma.$disconnect();
  });

  test("shows the households with today's values while the afternoon is still running", async ({
    page,
  }) => {
    await lookUp(page, NUMBERS.corrected);
    paidCents[NUMBERS.corrected] = await serveForAmountAsked(page);
    await lookUp(page, NUMBERS.handedOn);
    paidCents[NUMBERS.handedOn] = await serveForAmountAsked(page);

    // The way in is the overview, because that is how DF reach an afternoon — and the afternoon
    // under way is its top row, marked and with its figures still moving.
    await page.goto("/ausgabetermine");
    const running = page.getByTestId("past-session-row").first();
    await expect(running).toHaveAttribute("data-running", "true");
    await expect(running.getByTestId("past-session-running")).toHaveText(pastSessions.running);
    await expect(running.getByTestId("past-session-households")).toHaveText("2");
    await expect(running.getByTestId("past-session-total")).toHaveText(
      formatEuros(paidCents[NUMBERS.corrected] + paidCents[NUMBERS.handedOn]),
    );
    await expect(running.getByTestId("past-session-provisional")).toHaveText(
      pastSessions.provisional,
    );

    sessionId = Number(await running.getAttribute("data-session-id"));
    expect(Number.isInteger(sessionId)).toBe(true);
    await running.getByTestId("past-session-link").click();
    await expect(page).toHaveURL(new RegExp(`/ausgabetermine/${sessionId}$`));

    // Nothing is frozen until the afternoon is closed, so these rows are the register as it stands
    // — and the screen carries the same mark the overview does.
    await expect(page.getByTestId("session-detail-running")).toHaveText(pastSessions.running);
    await expect(page.getByTestId("session-detail-provisional")).toHaveText(
      pastSessions.provisional,
    );
    await expectRow(page, corrected, served(corrected));
    await expectRow(page, handedOn, served(handedOn));
  });

  test("ending the afternoon changes none of its figures", async ({ page }) => {
    await endSession(page);

    await page.goto(`/ausgabetermine/${sessionId}`);

    // Ended and frozen: no mark that it is still moving, and no hint that the rows are today's —
    // that sentence belongs to an afternoon closed before the capture existed (US-35).
    await expect(page.getByTestId("session-detail-ended")).toBeVisible();
    await expect(page.getByTestId("session-detail-running")).toHaveCount(0);
    await expect(page.getByTestId("session-detail-provisional")).toHaveCount(0);
    await expect(page.getByTestId("session-detail-live")).toHaveCount(0);

    // The header's two figures are the overview's, on the afternoon that has now closed with them.
    await expect(page.getByTestId("session-detail-summary")).toHaveText(
      pastSessions.detail.summary(2, paidCents[NUMBERS.corrected] + paidCents[NUMBERS.handedOn]),
    );
    await expectRow(page, corrected, served(corrected));
    await expectRow(page, handedOn, served(handedOn));
  });

  test("a household corrected afterwards does not change what the closed afternoon says", async ({
    page,
  }) => {
    const surname = `${corrected.lastName}-Meier`;

    await page.goto(`/kunden/${corrected.id}`);
    await fillSticky(page.getByTestId("details-last-name"), surname);
    await page.getByTestId("details-submit").click();
    await expect(page.getByTestId("details-saved")).toBeVisible();

    await fillCertificateTypeControl(page, RENEWAL_TYPE_FIELD, CERTIFICATE_TYPE);
    await fillDay(page.getByTestId("renewal-valid-until"), RENEWED_CERTIFICATE);
    await page.getByTestId("renewal-save").click();
    await expect(page.getByTestId("renewal-saved")).toHaveText(
      de.distribution.certificate.renewal.saved,
    );

    // The record itself moved — said before the afternoon is asserted not to have, because „the old
    // name still stands" proves nothing if the correction never landed.
    await page.goto(`/kunden/${corrected.id}`);
    await expect(page.getByTestId("details-last-name")).toHaveValue(surname);
    // The certificate section states what is on file; the renewal form beside it is a blank box for
    // the next one, so this sentence is where a renewal is read back.
    await expect(
      page.getByText(`${de.customers.card.validUntil} ${typedDay(RENEWED_CERTIFICATE)}`),
    ).toBeVisible();

    await page.goto(`/ausgabetermine/${sessionId}`);

    // The whole of US-35 in two lines: the surname and the certificate date of that afternoon, on a
    // household that no longer has either (E-2, E-3).
    await expectRow(page, corrected, served(corrected));
  });

  test("reopening the afternoon lets the rows follow the record again", async ({ page }) => {
    await page.goto("/ausgabe");
    await page.getByTestId("session-reopen-open").click();
    await fillSticky(page.getByTestId("session-reopen-reason"), REOPEN_REASON);
    await page.getByTestId("session-reopen-submit").click();
    await expect(page.getByTestId("session-header")).toBeVisible();

    await page.goto(`/ausgabetermine/${sessionId}`);

    // Nothing is frozen while an afternoon is open, and a reopened one is open (E-5, H-2): the
    // receipts are gone and the row is the household as it stands today.
    await expect(page.getByTestId("session-detail-running")).toHaveText(pastSessions.running);
    await expectRow(page, corrected, {
      ...served(corrected),
      lastName: `${corrected.lastName}-Meier`,
      certificate: typedDay(RENEWED_CERTIFICATE),
    });
  });

  test("ending it a second time freezes it on the values it closed with", async ({ page }) => {
    await endSession(page);

    await page.goto(`/ausgabetermine/${sessionId}`);

    await expect(page.getByTestId("session-detail-running")).toHaveCount(0);
    await expect(page.getByTestId("session-detail-live")).toHaveCount(0);
    await expectRow(page, corrected, {
      ...served(corrected),
      lastName: `${corrected.lastName}-Meier`,
      certificate: typedDay(RENEWED_CERTIFICATE),
    });
  });

  test("the row names the household that was served, not whoever holds the number now", async ({
    page,
  }) => {
    await page.goto(`/kunden/${handedOn.id}`);
    await page.getByTestId("archive-open").click();
    await page.getByTestId("archive-reason").fill(ARCHIVE_REASON);
    await page.getByTestId("archive-submit").click();
    await expect(page.getByTestId("archive-saved")).toHaveText(
      de.customers.archive.saved(NUMBERS.handedOn),
    );

    // The slot is back in circulation, so somebody else takes it — the week first, because that is
    // the first half of picking a number since US-31.
    const successor: Person = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
    };
    await page.goto("/kunden/neu");
    await hydrated(page.locator("#group-RED"));
    await page.locator("#group-RED").check();
    await page.getByTestId("customer-number-select").selectOption(String(NUMBERS.handedOn));
    await fillPersonalData(page, successor, {
      birthDate: GROWN_UP_BIRTH_DATE,
      certificateType: CERTIFICATE_TYPE,
      certificateValidUntil: RENEWED_CERTIFICATE,
    });
    await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();
    await page.waitForURL(/\/kunden\/\d+(\?|$)/);
    const successorId = Number(new URL(page.url()).pathname.split("/").at(-1));
    await expect(page.getByTestId("customer-number")).toHaveText(String(NUMBERS.handedOn));
    // The number came back, the card number did not: the household that gave it up still carries
    // `k1`, so the successor is handed `k2` (US-25).
    await expect(page.getByTestId("card-number")).toHaveText(`${NUMBERS.handedOn}k2`);

    await page.goto(`/ausgabetermine/${sessionId}`);

    // The afternoon names the household it served, under the card it printed for them — the slot on
    // the row belongs to somebody else now, and nothing about that reaches the closed afternoon.
    await expectRow(page, handedOn, served(handedOn));
    await expect(page.getByTestId("session-household-row")).toHaveCount(2);
    await expect(
      page.locator(`[data-testid="session-household-row"][data-customer-id="${successorId}"]`),
    ).toHaveCount(0);
  });

  test("the overview lists the afternoons newest first and marks the one still running", async ({
    page,
  }) => {
    await startSession(page, "BLUE");

    await page.goto("/ausgabetermine");
    const rows = page.getByTestId("past-session-row");
    await expect(rows).toHaveCount(2);

    // The afternoon under way is the first row, and the closed one below it keeps its figures.
    await expect(rows.first()).toHaveAttribute("data-running", "true");
    await expect(rows.first().getByTestId("past-session-groups")).toHaveText(
      de.distribution.colours.BLUE,
    );
    await expect(rows.first().getByTestId("past-session-households")).toHaveText("0");
    await expect(rows.nth(1)).toHaveAttribute("data-session-id", String(sessionId));
    await expect(rows.nth(1).getByTestId("past-session-running")).toHaveCount(0);
    await expect(rows.nth(1).getByTestId("past-session-households")).toHaveText("2");

    // Ended, the newer afternoon is still the one on top: the order is the register's, not a
    // by-product of one of them being open.
    await endSession(page);
    await page.goto("/ausgabetermine");
    await expect(rows.first().getByTestId("past-session-groups")).toHaveText(
      de.distribution.colours.BLUE,
    );
    await expect(rows.first().getByTestId("past-session-running")).toHaveCount(0);
    await expect(rows.nth(1)).toHaveAttribute("data-session-id", String(sessionId));
  });
});
