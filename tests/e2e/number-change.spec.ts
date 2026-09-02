import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { de, plain } from "@/i18n/de";
import { foldName } from "@/domain/customer/nameSearch";
import { groupOf } from "@/domain/customer/group";
import { SHARED } from "./registers";
import { releaseNumbers } from "./seeding";
import { hydrated } from "./day";
import { fillPersonalData } from "./registration-form";

/**
 * Moving a household to another customer number, driven through the built app
 * (tasks/prd-us-30-change-customer-number.md §US-30.8).
 *
 * Every piece is proved on its own: `choosableNumbers` decides which slots are on offer in the
 * domain gate, `nextCardIndexOnMove` decides the index, `changeCustomerNumber` writes the move and
 * the card against fakes, and the adapter writes both in one transaction against a throwaway SQLite
 * file. What none of them can see is the **coupling**, which is the whole reason this act was hard
 * to get right: one save changes the number on the record, the card in the household's pocket, the
 * answer the counter gives to two different numbers, the pool the intake offers, and a to-do list.
 * Those are four screens, and a suite of per-screen tests cannot notice that one of them stopped
 * following the register.
 *
 * So this spec walks the worked example of the PRD end to end. A household holding four cards on one
 * slot moves onto a slot **an earlier household has been archived off** — which is what makes the
 * jump in the card index real rather than a fixture: the vacated slot has printed five cards, so the
 * move prints the sixth, and the household has still only ever been issued five cards of their own.
 * The slot they left keeps its four, under the numbers they were printed with, and that is precisely
 * what lets the next household on it be printed `224k5` instead of a `224k1` that is already out in
 * the world.
 *
 * The numbers this spec owns are **224–228**, a band no other spec uses, and — unlike the seeding
 * bands above 240 — every one of them has to be **inside the quota of 240**: the control offers
 * `1..quotaN`, so a slot outside it could be neither moved onto nor handed to the household who
 * takes the vacated one afterwards. They are also well clear of the low sequence the allocating
 * specs consume, and below 315, so `group-walk.spec.ts`'s highest walkable RED number is untouched.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every date
// stays a literal, because a distribution day and a valid certificate are decided by dates.
faker.seed(20260901);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/**
 * The day this spec is judged on: Thursday 08.01.2026, 09:00 UTC.
 *
 * It follows from the seeded settings alone (`src/infrastructure/prisma/seed.ts`): anchor `2026-W02`
 * = RED, distributions on ISO weekday 4. So it is a RED distribution day, which is what lets the
 * moved household reach „Ausgabe frei" under their new number — the point being that the card
 * printed by the move works, and a wrong-colour week would refuse every card here for one reason.
 */
const TODAY = "2026-01-08T09:00:00.000Z";

/** The slot the household starts on and leaves. Four cards have been printed on it. */
const START = 224;
/** The slot they move onto: held by a household since archived, and five cards deep. */
const TARGET = 225;
/** A household whose card has fallen behind their counts, and is therefore on the reissue list. */
const STALE = 226;
/** Where that household moves to — a slot nobody has ever held. */
const STALE_TARGET = 227;
/** The slot a second registration takes while the record's control stands open on it. */
const RACE = 228;

/** Every number this spec writes to, so a retry can start from an empty band. */
const OWNED = [START, TARGET, STALE, STALE_TARGET, RACE] as const;

/** A card number as both the screens and the register spell it, e.g. `224k4`. */
function card(customerNumber: number, index: number): string {
  return `${customerNumber}k${index}`;
}

/** Born well before 13 years ago: a grown-up on any day this spec could run. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
/** Comfortably inside the last 13 years on {@link TODAY}: a child, and still one next week. */
const CHILD_BIRTH_DATE = "2020-06-15";
/**
 * Thirteen on 03.12.2025, a month before {@link TODAY} — a grown-up now, and a child on the day the
 * card was printed. That difference is the whole of the stale-card story (US-13): nothing was
 * edited, the counts simply came to disagree with what is on the piece of card.
 */
const OUTGROWN_BIRTH_DATE = "2012-12-03";
const CERTIFICATE_TYPE = "Jobcenter-Bescheid";
const CERTIFICATE_VALID_UNTIL = "2027-06-30";

/** Why the household who held {@link TARGET} left the register — an archive's only record (US-10). */
const ARCHIVE_REASON = "Weggezogen, Karte nicht zurückgegeben.";

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

/** One card as it was printed: the slot it names, when it was handed over and why. */
interface SeededCard {
  readonly index: number;
  /** ISO day. The card view prints it, so each one is distinct and asserted by hand. */
  readonly issuedAt: string;
  readonly reason: "FIRST_ISSUE" | "LOST";
}

/**
 * Insert one RED household with a grown-up, a child, a current certificate and a run of cards.
 *
 * Every card is printed with **one grown-up and one child**, which is what the household is today
 * unless `childBirthDate` says the child has since turned 13 — the one difference between the
 * household this spec moves and the household it finds on the reissue list.
 *
 * @returns the surrogate id the record page is addressed by (the URL takes the id, not the number).
 */
async function seedHousehold({
  customerNumber,
  status,
  childBirthDate,
  cards,
}: {
  readonly customerNumber: number;
  readonly status: "ACTIVE" | "ARCHIVED";
  readonly childBirthDate: string;
  readonly cards: ReadonlyArray<SeededCard>;
}): Promise<number> {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();
  const childFirstName = faker.person.firstName();
  const archived = status === "ARCHIVED";

  const customer = await prisma.customer.create({
    data: {
      customerNumber,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate: new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      status,
      archiveReason: archived ? ARCHIVE_REASON : null,
      archivedAt: archived ? new Date("2025-11-04T00:00:00.000Z") : null,
      reminderCount: 0,
      notes: "",
      householdMembers: {
        create: [
          { firstName, lastName, birthDate: new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`) },
          {
            firstName: childFirstName,
            lastName,
            birthDate: new Date(`${childBirthDate}T00:00:00.000Z`),
          },
        ],
      },
      certificates: {
        create: {
          type: CERTIFICATE_TYPE,
          validUntil: new Date(`${CERTIFICATE_VALID_UNTIL}T00:00:00.000Z`),
          recordedAt: new Date("2025-01-02T00:00:00.000Z"),
        },
      },
      cards: {
        create: cards.map((seeded) => ({
          customerNumber,
          index: seeded.index,
          issuedAt: new Date(`${seeded.issuedAt}T00:00:00.000Z`),
          reason: seeded.reason,
          grownUpsAtIssue: 1,
          childrenAtIssue: 1,
        })),
      },
    },
    select: { id: true },
  });

  return customer.id;
}

/** A household as the intake left it: where its record lives and what was written on its card. */
interface Household {
  readonly id: number;
  readonly cardNumber: string;
}

/**
 * Register one RED household on the given slot through the real form.
 *
 * The number is chosen in the dropdown rather than accepted from the proposal (US-24), because both
 * registrations here are about a *particular* slot: the one a move has just freed, and the one a
 * record's open control is standing on. The group is checked by hand rather than accepted from the
 * balancing suggestion, because a counter assertion rests on it — only a RED household is clear to
 * serve in a RED week.
 */
async function register(page: Page, slot: number): Promise<Household> {
  await page.goto("/kunden/neu");

  const select = page.getByTestId("customer-number-select");
  await hydrated(select);
  await expect(page.locator(`#customerNumber option[value="${slot}"]`)).toHaveCount(1);
  await select.selectOption(String(slot));

  await fillPersonalData(
    page,
    { firstName: faker.person.firstName(), lastName: faker.person.lastName() },
    {
      birthDate: GROWN_UP_BIRTH_DATE,
      certificateType: CERTIFICATE_TYPE,
      certificateValidUntil: CERTIFICATE_VALID_UNTIL,
    },
  );

  // The group choice is a `<details>` that starts closed (US-20.2), so the summary is really
  // clicked: a radio inside a closed disclosure has no bounding box and `check()` would time out.
  await page.getByTestId("group-choice-open").click();
  await page.locator("#group-RED").check();

  await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();
  await page.waitForURL(/\/kunden\/\d+(\?|$)/);

  await expect(page.getByTestId("customer-number")).toHaveText(String(slot));
  const id = Number(new URL(page.url()).pathname.split("/").at(-1));
  expect(Number.isInteger(id)).toBe(true);

  return { id, cardNumber: await page.getByTestId("card-number").innerText() };
}

/**
 * Pick a number in the record's control and make sure it stuck.
 *
 * The `<select>` is controlled, so a `selectOption` in the window between the server's HTML arriving
 * and the component hydrating is written straight to the DOM and the first render from state undoes
 * it — the same window `fillSticky` closes for a text field, and one WebKit has been watched lose.
 */
async function pickNumber(page: Page, number: number): Promise<void> {
  const select = page.getByTestId("number-change-select");
  await hydrated(select);
  await expect(async () => {
    await select.selectOption(String(number));
    await expect(select).toHaveValue(String(number), { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

/** Move the household on the open record to the given number, confirming what it will print first. */
async function move(page: Page, to: number, nextCard: string): Promise<void> {
  await pickNumber(page, to);
  await page.getByTestId("number-change-open").click();
  // Asserted rather than clicked past: the card number in this sentence is what staff copy onto the
  // physical card, and it is the one number on the screen that no other screen has said yet.
  await expect(page.getByTestId("number-change-confirm")).toHaveText(
    plain(de.customers.numberChange.confirm(to, de.customers.groups[groupOf(to)], nextCard)),
  );

  await page.getByTestId("number-change-submit").click();
  await expect(page.getByTestId("number-change-error")).toHaveCount(0);
}

/** The row on „Karten neu ausstellen" for one customer number, if the list has one. */
function dueRow(page: Page, customerNumber: number): Locator {
  return page.locator(`[data-testid="cards-due-row"][data-customer-number="${customerNumber}"]`);
}

/**
 * How many cards the hub's badge says are due.
 *
 * Read rather than asserted outright: the badge counts the whole register, and the other specs
 * sharing `data/e2e.db` may well have left households on the list. What this spec can claim is that
 * a move takes exactly one household off it and puts none on, so the figure is only compared with
 * itself.
 */
async function badgeCount(page: Page): Promise<number> {
  await page.goto("/kunden");
  const badge = await page.getByTestId("cards-due-badge").innerText();
  const count = Number(badge.split(" ")[0]);
  expect(Number.isInteger(count)).toBe(true);
  return count;
}

/** How many customer numbers the intake says are still free. */
async function freeNumberCount(page: Page): Promise<number> {
  await page.goto("/kunden/neu");
  const hint = await page.getByTestId("free-number-count").innerText();
  const count = Number(hint.replace(/\D/g, ""));
  expect(Number.isInteger(count)).toBe(true);
  return count;
}

/** Type a number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page, query: string): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(query);
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${query}`));
}

/**
 * Everything a refused move must leave exactly as it found it.
 *
 * The number is what the move would have changed and the cards are what it would have added — and
 * they are counted together, because the fault this refusal exists to prevent is precisely one of
 * them happening without the other.
 */
async function snapshotHousehold(id: number): Promise<string> {
  const [customer, cards] = await Promise.all([
    prisma.customer.findUniqueOrThrow({
      where: { id },
      select: { customerNumber: true, status: true },
    }),
    prisma.card.findMany({
      where: { customerId: id },
      select: { customerNumber: true, index: true },
      orderBy: { index: "asc" },
    }),
  ]);
  return JSON.stringify({ customer, cards });
}

const verdicts = de.distribution.counter.verdicts;
const words = de.customers.numberChange;

test.describe.configure({ mode: "serial" });

test.describe("Kundennummer eines Haushalts ändern", () => {
  /** The household that moves, and the one whose card has fallen behind its counts. */
  let moverId: number;
  let staleId: number;
  /** Read before the move, and only ever compared with themselves. */
  let freeBefore: number;
  let dueBefore: number;

  test.beforeAll(async () => {
    pinToday();

    // Idempotent, so a CI retry can re-run this block instead of dying on the unique customer
    // number (tests/e2e/seeding.ts). It also takes back the two numbers this spec *registers* on.
    await releaseNumbers(prisma, ...OWNED);

    moverId = await seedHousehold({
      customerNumber: START,
      status: "ACTIVE",
      childBirthDate: CHILD_BIRTH_DATE,
      cards: [
        { index: 1, issuedAt: "2025-03-03", reason: "FIRST_ISSUE" },
        { index: 2, issuedAt: "2025-05-05", reason: "LOST" },
        { index: 3, issuedAt: "2025-07-07", reason: "LOST" },
        { index: 4, issuedAt: "2025-09-09", reason: "LOST" },
      ],
    });

    // The household who used to hold the target slot. They are archived, so the slot is free — and
    // their five cards stay on it, which is what the move has to count on from.
    await seedHousehold({
      customerNumber: TARGET,
      status: "ARCHIVED",
      childBirthDate: CHILD_BIRTH_DATE,
      cards: [
        { index: 1, issuedAt: "2024-02-01", reason: "FIRST_ISSUE" },
        { index: 2, issuedAt: "2024-04-01", reason: "LOST" },
        { index: 3, issuedAt: "2024-06-01", reason: "LOST" },
        { index: 4, issuedAt: "2024-08-01", reason: "LOST" },
        { index: 5, issuedAt: "2024-10-01", reason: "LOST" },
      ],
    });

    staleId = await seedHousehold({
      customerNumber: STALE,
      status: "ACTIVE",
      childBirthDate: OUTGROWN_BIRTH_DATE,
      cards: [{ index: 1, issuedAt: "2025-04-04", reason: "FIRST_ISSUE" }],
    });
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it would freeze January for the settings specs,
    // which save a version stamped *now* and would then assert against the wrong month.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("the control opens on the number the household holds and offers the slot an archive freed", async ({
    page,
  }) => {
    await page.goto(`/kunden/${moverId}`);

    await expect(page.getByTestId("customer-number")).toHaveText(String(START));
    await expect(page.getByTestId("card-number")).toHaveText(card(START, 4));

    // Where the dropdown opens is the household's own number — the one entry on the list that is not
    // free, and the reason the control needs no „unverändert" option of its own.
    const select = page.getByTestId("number-change-select");
    await hydrated(select);
    await expect(select).toHaveValue(String(START));
    // The slot an archived household left is on offer; the slot another household is sitting on is
    // not. Those two are the whole of what „free" means here.
    await expect(page.locator(`#customerNumber option[value="${TARGET}"]`)).toHaveCount(1);
    await expect(page.locator(`#customerNumber option[value="${STALE}"]`)).toHaveCount(0);
    // Nothing to confirm while the number on screen is the number they hold.
    await expect(page.getByTestId("number-change-open")).toHaveCount(0);

    freeBefore = await freeNumberCount(page);
    dueBefore = await badgeCount(page);
  });

  test("the move prints the next card on the slot moved onto, not the next card of the household", async ({
    page,
  }) => {
    await page.goto(`/kunden/${moverId}`);
    // Six, because the slot has printed five — and the household is holding their fourth card. The
    // index counts the slot's whole run including households since archived (US-25).
    await move(page, TARGET, card(TARGET, 6));

    // The record above the control re-renders both numbers from the store, which is what says the
    // move and the card were one act rather than two.
    await expect(page.getByTestId("customer-number")).toHaveText(String(TARGET));
    await expect(page.getByTestId("card-number")).toHaveText(card(TARGET, 6));
    // The receipt names the slot that was freed as well, which is the one fact the revalidated
    // record above it cannot state: the row it was read from now says 225 everywhere.
    await expect(page.getByTestId("number-change-saved")).toHaveText(
      plain(words.saved(START, TARGET, de.customers.groups[groupOf(TARGET)], card(TARGET, 6))),
    );

    // And the control comes back on the number just saved, with the vacated slot now among the
    // choices — the two halves of „this screen is describing the register as it is now".
    await expect(page.getByTestId("number-change-select")).toHaveValue(String(TARGET));
    await expect(page.locator(`#customerNumber option[value="${START}"]`)).toHaveCount(1);
  });

  test("every superseded card keeps the number it was printed with", async ({ page }) => {
    await page.goto(`/kunden/${moverId}`);
    await page.getByTestId("card-view-link").click();
    await page.waitForURL(/\/kunden\/\d+\/karte$/);

    await expect(page.getByTestId("card-number")).toHaveText(card(TARGET, 6));

    // The line this whole story turns on. The four cards the household carried on the slot they left
    // are listed as `224k4 … 224k1`, never as `225k4 … 225k1`: those four numbers are what keeps
    // slot 224 safe to hand out again, and re-labelling them would put `224k1` back into the world
    // while the piece of card bearing it is still in somebody's pocket.
    await expect(page.getByTestId("superseded-card")).toHaveText([
      de.customers.cardView.supersededEntry(
        card(START, 4),
        "09.09.2025",
        de.customers.cardReasons.LOST,
      ),
      de.customers.cardView.supersededEntry(
        card(START, 3),
        "07.07.2025",
        de.customers.cardReasons.LOST,
      ),
      de.customers.cardView.supersededEntry(
        card(START, 2),
        "05.05.2025",
        de.customers.cardReasons.LOST,
      ),
      de.customers.cardView.supersededEntry(
        card(START, 1),
        "03.03.2025",
        de.customers.cardReasons.FIRST_ISSUE,
      ),
    ]);

    // Five cards, not six: the jump in the index is the *slot's* history and not the household's.
    await expect(page.getByTestId("cards-issued")).toHaveText("5");
    // And the move is not a loss. Three of their five cards replaced one they lost; the sixth index
    // on the new slot was never theirs to lose.
    await expect(page.getByTestId("reissues-for-loss")).toHaveText("3");
  });

  test("the intake offers the vacated number the moment the move is saved", async ({ page }) => {
    await page.goto("/kunden/neu");

    // What a move actually does to the pool: it swaps one slot for another. The number the household
    // left is offered, the number they took is not, and the *count* is unchanged — a move can never
    // change it, because the set of taken numbers is exactly as large after it as before. That is
    // worth stating as an assertion rather than left out: „the count went up" is the first thing a
    // reader expects here, and it would be wrong.
    await expect(page.locator(`#customerNumber option[value="${START}"]`)).toHaveCount(1);
    await expect(page.locator(`#customerNumber option[value="${TARGET}"]`)).toHaveCount(0);
    expect(await freeNumberCount(page)).toBe(freeBefore);
  });

  test("the counter knows nobody on the vacated number and serves the household on the new one", async ({
    page,
  }) => {
    // The slot is unassigned until somebody is registered on it, and so is every card printed on it:
    // a card number resolves through the slot, and the slot answers for whoever holds it *today*.
    await lookUp(page, String(START));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute("data-verdict", "NOT_FOUND");
    await expect(page.getByTestId("counter-verdict-headline")).toHaveText(
      verdicts.notFound.headline,
    );

    await lookUp(page, card(START, 4));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute("data-verdict", "NOT_FOUND");

    // And the household is servable under the new number, on the card the move printed for them —
    // both the way staff type it and the way they read it off the card.
    await lookUp(page, String(TARGET));
    await expect(page.getByTestId("counter-card-number")).toHaveText(card(TARGET, 6));

    await lookUp(page, card(TARGET, 6));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    await expect(page.getByTestId("counter-verdict-headline")).toHaveText(
      verdicts.clearToServe.headline,
    );
    await expect(page.getByTestId("serve-button")).toBeVisible();
  });

  test("a move takes a household off the cards-due list and puts none on it", async ({ page }) => {
    await page.goto("/karten-neuausstellung");

    // The household seeded with an outgrown child is on the list, and the household that has just
    // moved is not: the card the move printed carries today's counts, so a move can only ever take a
    // row off this list.
    await expect(dueRow(page, STALE)).toHaveCount(1);
    await expect(dueRow(page, START)).toHaveCount(0);
    await expect(dueRow(page, TARGET)).toHaveCount(0);
    expect(await badgeCount(page)).toBe(dueBefore);

    await page.goto(`/kunden/${staleId}`);
    // A slot nobody has ever held still does not print `227k1`: the household holds their first
    // card, so the index is the higher of the slot's next and their own next (US-30.3).
    await move(page, STALE_TARGET, card(STALE_TARGET, 2));
    await expect(page.getByTestId("card-number")).toHaveText(card(STALE_TARGET, 2));

    await page.goto("/karten-neuausstellung");
    // The row is gone because the new card prints what the household is, not because anything was
    // ticked off: the list is derived on every read.
    await expect(dueRow(page, STALE)).toHaveCount(0);
    await expect(dueRow(page, STALE_TARGET)).toHaveCount(0);
    expect(await badgeCount(page)).toBe(dueBefore - 1);
  });

  test("the household given the vacated number is printed the next card on it", async ({
    page,
  }) => {
    const successor = await register(page, START);

    // `224k5`, not `224k1`. The four cards the mover left on this slot are still on it, and this is
    // the sentence they were left there for.
    expect(successor.cardNumber).toBe(card(START, 5));

    // Which is also what the mover's old card number now means: it resolves to the household holding
    // that slot today, and is refused as the superseded card it is. Before this registration the
    // same number was nobody's; neither answer is ever the mover's.
    await lookUp(page, card(START, 4));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "OUTDATED_CARD",
    );
    await expect(page.getByTestId("counter-card-number")).toHaveText(card(START, 5));
    await expect(page.getByTestId("serve-button")).toHaveCount(0);
  });

  test("a number taken while the screen stood open is refused, and nothing is written", async ({
    page,
  }) => {
    const before = await snapshotHousehold(moverId);

    await page.goto(`/kunden/${moverId}`);
    await pickNumber(page, RACE);
    await page.getByTestId("number-change-open").click();
    await expect(page.getByTestId("number-change-confirm")).toHaveText(
      plain(words.confirm(RACE, de.customers.groups[groupOf(RACE)], card(RACE, 7))),
    );

    // Somebody else registers a household on it while this screen stands open, in a second tab —
    // the race the control cannot see, because the list it is offering was read before it happened.
    const other = await page.context().newPage();
    await register(other, RACE);
    await other.close();

    await page.getByTestId("number-change-submit").click();

    // One sentence, the same one the intake uses for a number that has gone: it names the number and
    // asks for another, because re-submitting the same one would fail identically.
    await expect(page.getByTestId("number-change-error")).toHaveText(
      de.customers.errors.customerNumberUnavailable(RACE),
    );
    // The staff member is still on the record, which still says what it said before.
    expect(page.url()).toContain(`/kunden/${moverId}`);
    await expect(page.getByTestId("customer-number")).toHaveText(String(TARGET));
    await expect(page.getByTestId("card-number")).toHaveText(card(TARGET, 6));
    await expect(page.getByTestId("number-change-saved")).toHaveCount(0);

    // The list on offer has been re-read, so the number that lost the race is no longer on it and
    // the control has fallen back to the number the household holds.
    await expect(page.locator(`#customerNumber option[value="${RACE}"]`)).toHaveCount(0);
    await expect(page.getByTestId("number-change-select")).toHaveValue(String(TARGET));

    // And the register is byte-for-byte as it was: a refused move writes neither half of itself.
    expect(await snapshotHousehold(moverId)).toBe(before);
  });
});
