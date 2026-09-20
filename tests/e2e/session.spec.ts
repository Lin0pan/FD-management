import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { foldName } from "@/domain/customer/nameSearch";
import { formatEuroAmount, formatEuros, parseEuros } from "@/domain/money";
import { fillSticky } from "./day";
import { SHARED } from "./registers";
import { releaseNumbers } from "./seeding";
import { endSessionInHook, startSession, startSessionInHook } from "./session";

/**
 * The whole afternoon, start to end (`tasks/prd-us-34-distribution-session.md` §US-34.11).
 *
 * Every rule below is proved on its own elsewhere. What no other file can see is that they hold
 * **together**, over one afternoon a staff member starts, serves at, corrects at and ends — the
 * thing the calendar used to decide and no longer does. So this spec is one narrative in test
 * order: propose, deviate, serve, refuse, correct, remove, end, start again, reopen, discard.
 *
 * Two of its claims exist nowhere else and could not, because they are about **two** afternoons:
 * a household that has collected may collect again at a second session **started the same day** —
 * „einmal pro Kalendertag" could not express that — and a session ended a minute too early is
 * reopened rather than edited, its hand-outs correctable again until it is ended a second time.
 *
 * Three households on 351–353, a band no other spec owns: 351 and 353 are **odd and therefore
 * RED**, 352 is **even and therefore BLUE** (US-31), and that parity is the fixture — the
 * afternoon here serves RED, so 352 is the household it must turn away.
 *
 * Every session this file starts it also ends or discards: the register is shared and ordered, so a
 * running one is state the file sorting after this would inherit (`tests/e2e/session.ts`).
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker.
faker.seed(20260920);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/**
 * Now, read once so every fixture below is dated against one instant.
 *
 * **This spec runs on the real clock**, alone among the ones that touch a session, and it has to:
 * half of what it asserts is read off the session that ended *last*, and a session stamped in a
 * pinned January would lose that race to one an earlier file ended at the real now. So it pins
 * nothing, dates its fixtures relative to today, and states no figure the policy in force decides.
 */
const NOW = new Date();
/** A year out, so the households are clear to serve whenever this suite runs. */
const VALID_CERTIFICATE = new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000);
/** Born well before 13 years ago: a grown-up on any day this spec could run. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";

/** The numbers this spec owns, well clear of the bands the other specs consume. */
const NUMBERS = {
  /** RED: collects, is corrected, removed, recorded afresh — and collects again the same day. */
  collects: 351,
  /** BLUE: at the counter of a RED afternoon, so „Falsche Gruppe" is what it is there for. */
  otherGroup: 352,
  /** RED: blocked and unblocked twice over, once while an afternoon runs and once between them. */
  blocked: 353,
} as const;

/**
 * What a corrected hand-out is amended to, here and after the reopening: **nothing**.
 *
 * Every other amount in this file is whatever the Betrag field opens on, read back with
 * {@link parseEuros} — this spec sets no policy and may state no price. Zero is the one amount that
 * is certainly not an overpayment whatever policy an earlier file left in force, and „ein Haushalt,
 * der nichts zahlen kann" is a real afternoon at DF rather than a number chosen to be safe.
 */
const CORRECTED_CENTS = 0;

/** Typed on the record while the afternoon runs, and read back at the counter as the refusal. */
const BLOCK_REASON = "Streit an der Ausgabe, Rücksprache mit der Leitung nötig.";
/** Why the afternoon is opened up again — the reopening's only record (FR-16). */
const REOPEN_REASON = "Betrag von 351 war falsch, zu früh beendet.";

/**
 * The database the built app is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is taken from `registers.ts` — the one place that knows which engine this run drives, and
 * therefore which register is behind it. It is resolved to an absolute path because a relative
 * SQLite url resolves against the schema directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(SHARED.database)}` });

/**
 * Insert one active household with a grown-up, a current certificate and one card.
 *
 * @returns the surrogate id the record page is addressed by — the URL takes the id, not the number.
 */
async function seedHousehold(customerNumber: number): Promise<number> {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();
  const birthDate = new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`);

  // Idempotent, so a CI retry can re-run this block instead of dying on the
  // unique customer number (tests/e2e/seeding.ts).
  await releaseNumbers(prisma, customerNumber);

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
        create: { type: "Jobcenter-Bescheid", validUntil: VALID_CERTIFICATE, recordedAt: NOW },
      },
      cards: {
        create: [
          {
            customerNumber,
            index: 1,
            issuedAt: NOW,
            reason: "FIRST_ISSUE",
            // What the printed card says about the household — matching the seeded one, so no
            // spec here trips the cards-due-for-reissue list (US-13).
            grownUpsAtIssue: 1,
            childrenAtIssue: 0,
          },
        ],
      },
    },
    select: { id: true },
  });

  return customer.id;
}

/** Every hand-out the household holds: which afternoon it belongs to, and when it was stamped. */
async function handoutsFor(
  customerNumber: number,
): Promise<ReadonlyArray<{ sessionId: number; date: Date }>> {
  // `customerNumber` is unique only through a hand-written partial index Prisma cannot see, so it
  // is not a `findUnique` key here — `findFirst` reads the single row all the same.
  const customer = await prisma.customer.findFirst({
    where: { customerNumber },
    select: { id: true },
  });
  if (customer === null) {
    return [];
  }
  return prisma.distributionRecord.findMany({
    where: { customerId: customer.id },
    select: { sessionId: true, date: true },
  });
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
 * The amount is read rather than typed because this file does not set the price: the policy in
 * force is whatever the files before it left, and every figure asserted afterwards is this one.
 */
async function serveForAmountAsked(page: Page): Promise<number> {
  const asked = parseEuros(await page.getByTestId("serve-amount").inputValue());
  await page.getByTestId("serve-button").click();
  await expect(page.getByTestId("serve-recorded-confirmation")).toContainText(formatEuros(asked));
  return asked;
}

/**
 * The two figures the tally states, read **off the panel**: „Gruppe Rot: 3 von 61 Haushalten
 * abgeholt".
 *
 * Off the screen and not out of the register on purpose. That the sentence agrees with the database
 * is `group-progress.spec.ts`'s claim; what is asserted here is the coupling a suite of per-form
 * tests cannot see — the panel following a write made on the same page load, with no `goto` between
 * the hand-out and the figure.
 */
async function tallyFigures(page: Page): Promise<{ served: number; expected: number }> {
  const sentence = await page.getByTestId("group-progress").innerText();
  const figures = /(\d+) von (\d+)/.exec(sentence);
  // Loudly, rather than returning a fallback pair: a tally this cannot read is a changed sentence,
  // and a default would let the comparison below pass while proving nothing.
  expect(figures, `no tally in ${JSON.stringify(sentence)}`).not.toBeNull();
  return { served: Number(figures?.[1]), expected: Number(figures?.[2]) };
}

/** End the running afternoon, asserting on the way what its confirmation says it will close. */
async function endWithSummary(
  page: Page,
  households: number,
  totalPaidCents: number,
): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("session-end-open").click();
  await expect(page.getByTestId("session-end-confirm")).toHaveText(
    de.distribution.session.end.confirm(households, totalPaidCents),
  );
  await page.getByTestId("session-end-submit").click();

  await expect(page.getByTestId("session-start-submit")).toBeVisible();
  await expect(page.getByTestId("last-session-summary")).toHaveText(
    de.distribution.session.last.summary(households, totalPaidCents),
  );
}

const words = de.distribution.session;
const serve = de.distribution.serve;

test.describe.configure({ mode: "serial" });

test.describe("Ausgabe starten und beenden", () => {
  /** The surrogate ids of the seeded households, by customer number. */
  const ids: Record<number, number> = {};
  /** What the hand-out under correction was recorded for; every amount here is read, never set. */
  let servedCents = 0;

  test.beforeAll(async ({ browser, baseURL }) => {
    // The register's clock is the real one for this file (see {@link NOW}). Removing the pin rather
    // than assuming it is gone: every spec that sets one removes it in its own teardown, so this is
    // a no-op on an ordinary run and a repair after one that died mid-afternoon.
    rmSync(NOW_FILE, { force: true });
    for (const customerNumber of Object.values(NUMBERS)) {
      ids[customerNumber] = await seedHousehold(customerNumber);
    }
    // An afternoon that served RED and is over: what the first test's proposal is a fact about.
    // Started here rather than assumed of the file running before this one, which is free to serve
    // whatever its own fixtures need.
    await startSessionInHook({ browser, baseURL }, "RED");
    await endSessionInHook({ browser, baseURL });
  });

  test.afterAll(async ({ browser, baseURL }) => {
    // Silent when nothing runs, which is how the last test leaves the register — this is the net
    // under a block that failed halfway through an afternoon.
    await endSessionInHook({ browser, baseURL });
    await prisma.$disconnect();
  });

  test("proposes the group the last afternoon did not serve, and lets staff deviate", async ({
    page,
  }) => {
    await page.goto("/ausgabe");

    // The afternoon that ended last served RED, so BLUE is what was not up — and it is a
    // *proposal*: the staff member picks RED instead, and nothing asks them for a reason (FR-2).
    await expect(page.locator("#session-groups-BLUE")).toBeChecked();
    await expect(page.locator('input[name="groups"]:checked')).toHaveCount(1);

    await startSession(page, "RED");

    await expect(page.getByTestId("session-header")).toContainText(words.running);
    await expect(page.getByTestId("session-groups")).toHaveText(de.distribution.colours.RED);
  });

  test("offers no second afternoon while one runs", async ({ page }) => {
    await page.goto("/ausgabe");

    // Refused by the database too (`one_running_session`), but a staff member must never reach
    // that: the control is simply not on the screen, on this workstation or any other.
    await expect(page.getByTestId("session-header")).toBeVisible();
    await expect(page.getByTestId("session-start-submit")).toHaveCount(0);
  });

  test("turns a household of the other group away", async ({ page }) => {
    await lookUp(page, NUMBERS.otherGroup);

    // 352 is BLUE and the running afternoon serves RED. Nothing about the calendar week decides
    // this any more — the session's own groups do (US-34.2).
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "WRONG_GROUP",
    );
    await expect(page.getByTestId("counter-verdict-headline")).toHaveText(
      de.distribution.counter.verdicts.wrongGroup.headline,
    );
    await expect(page.getByTestId("serve-button")).toHaveCount(0);
  });

  test("serves a household of the afternoon's group and raises the tally on the same screen", async ({
    page,
  }) => {
    await lookUp(page, NUMBERS.collects);
    const before = await tallyFigures(page);

    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    servedCents = await serveForAmountAsked(page);

    // Read on the screen the write landed on, with no `goto` in between: the household itself is
    // gone from it (US-32.7), so this figure *is* the standing evidence the hand-out was recorded.
    // One more served and not one household more expected — 351 was always going to collect.
    expect(await tallyFigures(page)).toEqual({
      served: before.served + 1,
      expected: before.expected,
    });
  });

  test("refuses a second hand-out at the same afternoon", async ({ page }) => {
    await lookUp(page, NUMBERS.collects);

    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "ALREADY_SERVED",
    );
    await expect(page.getByTestId("already-served-message")).toContainText(
      formatEuros(servedCents),
    );
    await expect(page.getByTestId("serve-button")).toHaveCount(0);
  });

  test("corrects, removes and re-records the hand-out while the afternoon runs", async ({
    page,
  }) => {
    await lookUp(page, NUMBERS.collects);

    await fillSticky(page.getByTestId("correct-amount"), formatEuroAmount(CORRECTED_CENTS));
    await page.getByTestId("correct-save").click();
    await expect(page.getByTestId("serve-confirmation")).toHaveText(serve.correct.saved);
    await expect(page.getByTestId("already-served-message")).toContainText(
      formatEuros(CORRECTED_CENTS),
    );

    // The two-step guard: the closed disclosure has to be opened before the button that deletes
    // exists to be clicked.
    await page.getByText(serve.correct.remove, { exact: true }).click();
    await page.getByTestId("correct-remove").click();
    await expect(page.getByTestId("serve-removed-confirmation")).toHaveText(serve.correct.removed);

    // And the household is unserved again at this very afternoon, which is what a removal is for:
    // the hand-out was recorded on the wrong number, so the right one is recorded afresh.
    await expect(page.getByTestId("serve-button")).toBeVisible();
    servedCents = await serveForAmountAsked(page);
  });

  test("does not offer to discard an afternoon a household has collected at", async ({ page }) => {
    await page.goto("/ausgabe");

    // Discarding is the undo of a misclick and leaves no audit entry at all, so it is withheld the
    // moment there is something to account for — such an afternoon is ended instead (FR-7).
    await expect(page.getByTestId("session-discard-open")).toHaveCount(0);
    await expect(page.getByTestId("session-end-open")).toBeVisible();
  });

  test("blocks and unblocks a household while the afternoon runs", async ({ page }) => {
    await page.goto(`/kunden/${ids[NUMBERS.blocked]}`);
    await page.getByTestId("block-open").click();
    await page.getByTestId("block-reason").fill(BLOCK_REASON);
    await page.getByTestId("block-submit").click();
    await expect(page.getByTestId("block-saved")).toHaveText(de.customers.block.blocked);

    await lookUp(page, NUMBERS.blocked);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute("data-verdict", "BLOCKED");
    await expect(page.getByTestId("counter-verdict-detail")).toHaveText(BLOCK_REASON);

    // Lifted again from the counter's own copy of the control — the same component the record
    // carries, which is why a block cannot mean two things depending on where it was started.
    await page.getByTestId("unblock-open").click();
    await page.getByTestId("unblock-submit").click();
    await expect(page.getByTestId("block-saved")).toHaveText(de.customers.block.unblocked);
    await expect(page.getByTestId("counter-status")).toHaveText(de.customers.status.ACTIVE);
  });

  test("ends the afternoon with what it came to, and closes its hand-outs", async ({ page }) => {
    await endWithSummary(page, 1, servedCents);

    // The freeze (FR-14). There is no counter on the screen at all between afternoons, so the
    // hand-out cannot be reached to be corrected — not by looking the household up, and not by the
    // `?nummer=` still in somebody's history, which is inert rather than an error.
    await page.goto(`/ausgabe?nummer=${NUMBERS.collects}`);
    await expect(page.getByTestId("counter-input")).toHaveCount(0);
    await expect(page.getByTestId("already-served")).toHaveCount(0);
    await expect(page.getByTestId("correct-save")).toHaveCount(0);
  });

  test("blocks and unblocks a household after the afternoon has ended", async ({ page }) => {
    // The other half of B-12, and the reason it is a requirement at all: a household blocked during
    // the distribution would never be unblocked if this only worked while one ran.
    await page.goto(`/kunden/${ids[NUMBERS.blocked]}`);
    await page.getByTestId("block-open").click();
    await page.getByTestId("block-reason").fill(BLOCK_REASON);
    await page.getByTestId("block-submit").click();
    await expect(page.getByTestId("customer-status")).toHaveText(de.customers.status.BLOCKED);

    await page.getByTestId("unblock-open").click();
    await page.getByTestId("unblock-submit").click();
    await expect(page.getByTestId("customer-status")).toHaveText(de.customers.status.ACTIVE);
  });

  test("lets the household collect again at a second afternoon on the same day", async ({
    page,
  }) => {
    await startSession(page, "RED");

    await lookUp(page, NUMBERS.collects);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    servedCents = await serveForAmountAsked(page);

    // Two hand-outs, two afternoons, one calendar day — the extra distribution DF hold when a
    // delivery arrives, and the case „einmal pro Kalendertag" could not express. The day is
    // asserted and not assumed: this file runs on the real clock, and a run straddling midnight
    // would otherwise leave the claim standing while proving something weaker.
    const handouts = await handoutsFor(NUMBERS.collects);
    expect(handouts).toHaveLength(2);
    expect(new Set(handouts.map((handout) => handout.sessionId)).size).toBe(2);
    expect(new Set(handouts.map((handout) => handout.date.toDateString())).size).toBe(1);

    await endWithSummary(page, 1, servedCents);
  });

  test("reopens the afternoon that ended last, and ending it again closes it for good", async ({
    page,
  }) => {
    await page.goto("/ausgabe");
    await page.getByTestId("session-reopen-open").click();
    await expect(page.getByTestId("session-reopen-confirm")).toHaveText(words.reopen.confirm);

    // The reason is the record — nothing else on the row says why an ended afternoon was opened
    // again — so the save waits for one, as the block and the archive do.
    await expect(page.getByTestId("session-reopen-submit")).toBeDisabled();
    await fillSticky(page.getByTestId("session-reopen-reason"), REOPEN_REASON);
    await page.getByTestId("session-reopen-submit").click();
    await expect(page.getByTestId("session-header")).toBeVisible();

    // Correctable again, which is the whole purpose: the hand-out was closed a minute too early.
    await lookUp(page, NUMBERS.collects);
    await fillSticky(page.getByTestId("correct-amount"), formatEuroAmount(CORRECTED_CENTS));
    await page.getByTestId("correct-save").click();
    await expect(page.getByTestId("serve-confirmation")).toHaveText(serve.correct.saved);

    // Ended a second time it closes for good, and the correction is in what it closed with.
    await endWithSummary(page, 1, CORRECTED_CENTS);
  });

  test("discards an afternoon that holds nothing, leaving no trace of it", async ({ page }) => {
    await startSession(page, "BLUE");

    await expect(page.getByTestId("session-discard-open")).toBeVisible();
    await page.getByTestId("session-discard-open").click();
    await expect(page.getByTestId("session-discard-confirm")).toHaveText(words.discard.confirm);
    await page.getByTestId("session-discard-submit").click();

    // Back to the start form — and the afternoon that ended last is still the one before it, with
    // the figures it closed with. A session started by mistake is not in the register's story at
    // all: nothing is written down about it, which is what the confirmation promised.
    await expect(page.getByTestId("session-start-submit")).toBeVisible();
    await expect(page.getByTestId("last-session-summary")).toHaveText(
      words.last.summary(1, CORRECTED_CENTS),
    );
  });
});
