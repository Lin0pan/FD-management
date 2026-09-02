import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { de, plain } from "@/i18n/de";
import { groupOf } from "@/domain/customer/group";
import { clearRegister } from "@/infrastructure/prisma/test-support";
import { ISOLATED } from "./registers";
import { fillDay, fillSticky, hydrated } from "./day";
import { fillPersonalData, type Person } from "./registration-form";

/**
 * The customer number decides the group, driven through the built app
 * (tasks/prd-us-31-number-decides-the-group.md §US-31.8).
 *
 * DF have always worked to a rule the software did not know: **even numbers are BLUE, odd numbers
 * are RED**. Until US-31 a group was a second thing to store beside the number, which is two answers
 * to one question and the Excel failure this project exists to replace. Now there is one answer —
 * `groupOf(customerNumber)` — and no rule to enforce, because a household on 37 in BLUE is not a
 * state anything can represent.
 *
 * Every piece is proved on its own: `groupOf` in the domain gate, the allocation and the derivation
 * against fakes, the two dropped columns against a throwaway SQLite file. What none of them can see
 * is that the *screens* say one thing: the intake, the record, the card, „Karten neu ausstellen",
 * the counter and the customer list all state a week, and each of them derives it. So this spec
 * walks one register from an empty one to a household that has changed weeks, and reads the
 * consequence off every screen that shows one.
 *
 * ## Why this spec owns a register
 *
 * It runs in the **`isolated` project** (`playwright.config.ts`), the second server with the second
 * database, because one of its subjects is a **week that is full while the register is not** — with
 * a quota of 240 there are 120 odd slots and 120 even ones, and either half can run out on its own.
 * That state can only be reached by deciding the quota, and the quota is a single global number: on
 * the shared register the specs before this one hold numbers in the hundreds, and no quota this file
 * could set would be both above the active count and low enough to exhaust one parity.
 *
 * Owning a register is also what lets every figure here be an absolute number rather than a delta.
 * Six slots, six households, and „Rot 3, Blau 3" means what it says.
 *
 * `waiting-list.spec.ts` shares that register and runs after this file (the suite is serial in
 * alphabetical file order); it empties the register and sets its own quota in its opening test, so
 * what this one leaves behind is nobody's business but its own.
 */

// A fixed seed so a failure is reproducible; only names come from Faker. Every date stays a literal,
// because which week collects is decided by dates — and the whole spec is about weeks.
faker.seed(20260902);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at for the isolated server. */
const NOW_FILE = ISOLATED.now;

/**
 * The two days this spec is judged on: Thursday 08.01.2026 and Thursday 15.01.2026.
 *
 * Both follow from the seeded settings alone (`src/infrastructure/prisma/seed.ts`): anchor
 * `2026-W02` = RED and distributions on ISO weekday 4, so the Thursday of W02 is a RED distribution
 * day and the Thursday of W03 a BLUE one. Two days is what a household changing weeks needs — one it
 * collects on before the move, and one it collects on after.
 */
const RED_DAY = "2026-01-08T09:00:00.000Z";
const BLUE_DAY = "2026-01-15T09:00:00.000Z";

/**
 * The register this spec works in: six slots, and no more.
 *
 * Three of each parity, which is the smallest register in which a week can be full while the other
 * still has something to give — the fact this whole file exists to make visible.
 */
const QUOTA = 6;

/** The slots, named for what each is here to do. All six are used, and the parity is the point. */
const NUMBERS = {
  /** The household that changes weeks: registered RED, moved onto {@link NUMBERS.moveTo}. */
  mover: 1,
  /** Registered by picking the *other* week: even, and therefore BLUE without anything being set. */
  blue: 2,
  /** The two that fill RED up, so that the intake has a week it cannot offer. */
  fillerOne: 3,
  fillerTwo: 5,
  /** Registered while RED is full, to show the other week still takes households normally. */
  registeredWhileRedIsFull: 4,
  /** The slot the mover moves onto — the last free one, and even. */
  moveTo: 6,
} as const;

/** Born well before 13 years ago: a grown-up on either of the two days above. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
/** Born comfortably inside the last 13 years of both days: the baby that outdates a printed card. */
const BABY_BIRTH_DATE = "2024-03-05";
const CERTIFICATE_TYPE = "Jobcenter-Bescheid";
/** Comfortably in the future, so nobody here is turned away for a lapsed certificate. */
const CERTIFICATE_VALID_UNTIL = "2028-05-31";

/**
 * The database the isolated server is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is taken from `registers.ts` — the one place that knows which engine this run drives, and
 * therefore which register is behind it. It is resolved to an absolute path because a relative
 * SQLite url resolves against the schema directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(ISOLATED.database)}` });

/** Make the app believe it is `instant`, for every request until the file is removed. */
function pinDay(instant: string): void {
  writeFileSync(NOW_FILE, instant, "utf8");
}

/** A card number as both the screens and the register spell it, e.g. `1k2`. */
function card(customerNumber: number, index: number): string {
  return `${customerNumber}k${index}`;
}

/** The German for the week a number collects in — derived here exactly as the app derives it. */
function groupWord(customerNumber: number): string {
  return de.customers.groups[groupOf(customerNumber)];
}

function person(): Person {
  return { firstName: faker.person.firstName(), lastName: faker.person.lastName() };
}

/** The numbers a `<select>` is offering right now, in the order it offers them. */
async function offeredNumbers(page: Page, testId: string): Promise<ReadonlyArray<number>> {
  return page
    .getByTestId(testId)
    .locator("option")
    .evaluateAll((options) => options.map((option) => Number(option.getAttribute("value"))));
}

/**
 * The two free-slot figures, off whichever of the two screens states them.
 *
 * They are the same sentence on the intake and on the record, and deliberately so: a week that is
 * full is a fact about the register, not about the screen it is read on.
 */
function freeNumbers(page: Page): Promise<string> {
  return page.getByTestId("free-numbers-by-group").innerText();
}

/**
 * Register a one-person household on the given slot, through the real form.
 *
 * The **week is picked first**, because since US-31 that is the first half of picking a number: the
 * radios filter the list beneath them, so a slot is reached by choosing the week it belongs to and
 * then the slot. Waited for rather than clicked straight away — the radio is controlled, and a click
 * before React owns it moves the dot without moving the list.
 *
 * @returns the surrogate id the record page is addressed by, and the card the registration printed.
 */
async function register(page: Page, slot: number): Promise<{ id: number; cardNumber: string }> {
  await page.goto("/kunden/neu");

  const group = groupOf(slot);
  await hydrated(page.locator(`#group-${group}`));
  await page.locator(`#group-${group}`).check();
  await expect(page.locator(`#customerNumber option[value="${slot}"]`)).toHaveCount(1);
  await page.getByTestId("customer-number-select").selectOption(String(slot));

  await fillPersonalData(page, person(), {
    birthDate: GROWN_UP_BIRTH_DATE,
    certificateType: CERTIFICATE_TYPE,
    certificateValidUntil: CERTIFICATE_VALID_UNTIL,
  });

  await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();
  await page.waitForURL(/\/kunden\/\d+(\?|$)/);

  await expect(page.getByTestId("customer-number")).toHaveText(String(slot));
  const id = Number(new URL(page.url()).pathname.split("/").at(-1));
  expect(Number.isInteger(id)).toBe(true);

  return { id, cardNumber: await page.getByTestId("card-number").innerText() };
}

/** Type a number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page, query: string): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(query);
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${query}`));
}

/** This household's row on „Karten neu ausstellen", if the list has one. */
function dueRow(page: Page, customerNumber: number) {
  return page.locator(`[data-testid="cards-due-row"][data-customer-number="${customerNumber}"]`);
}

const words = de.customers.numberChange;

test.describe.configure({ mode: "serial" });

test.describe("Die Nummer entscheidet die Gruppe", () => {
  /** The household that changes weeks, and the card it holds before it does. */
  let mover: { id: number; cardNumber: string };

  /**
   * Start from an empty register on **every attempt**, not only the first.
   *
   * The database is deleted and re-seeded in `webServer.command` (`playwright.config.ts`), which
   * runs once per *run*. `retries` is 2 on CI and this block is `mode: "serial"`, so a retry replays
   * it from the first test against the register the previous attempt already filled — and the first
   * test's whole subject is an *empty* register offering every slot. `clearRegister` empties
   * everything, which no spec on the shared register may do; this file owns its register outright,
   * which is what the isolated project is for.
   */
  test.beforeAll(async () => {
    pinDay(RED_DAY);
    await prisma.waitingListEntry.deleteMany();
    await clearRegister(prisma);
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it would freeze January for `waiting-list.spec.ts`
    // behind it on this same server.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("the intake opens on the recommended week and offers only that week's numbers", async ({
    page,
  }) => {
    // DF's quota is a settings value like any other, so it is lowered on the screen staff would use
    // rather than in the seed — which is also the only way the number in force is proved to reach
    // the registration form at all.
    await page.goto("/einstellungen");
    await fillSticky(page.locator("#quotaN"), String(QUOTA));
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();
    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);

    await page.goto("/kunden/neu");

    // An empty register is level, and a level register is proposed RED — the tie-break, stated on
    // the screen beside both sizes.
    await expect(page.locator("#group-RED")).toBeChecked();
    await expect(page.getByTestId("group-proposal")).toHaveText(
      `${de.customers.assignment.suggestedGroup(de.customers.groups.RED)} · ` +
        de.customers.assignment.groupSizes(0, 0),
    );

    // The list under the radios is that week's slots and nothing else. This is the whole of why no
    // rule has to be enforced anywhere: a number and a week that disagree were never offered.
    expect(await offeredNumbers(page, "customer-number-select")).toEqual([1, 3, 5]);
    await expect(page.getByTestId("customer-number-select")).toHaveValue("1");
    // Three slots each, and the figures are about the register rather than about the choice above.
    expect(await freeNumbers(page)).toBe(de.customers.assignment.freeNumbersByGroup(3, 3));

    // Switching the week re-filters the list and takes the preselection with it: the number picked
    // a moment ago belongs to the week just left, so keeping it would be keeping a slot that is not
    // on the list.
    await page.locator("#group-BLUE").check();
    expect(await offeredNumbers(page, "customer-number-select")).toEqual([2, 4, 6]);
    await expect(page.getByTestId("customer-number-select")).toHaveValue("2");
    expect(await freeNumbers(page)).toBe(de.customers.assignment.freeNumbersByGroup(3, 3));

    // And back, to the lowest of the week returned to rather than to whatever was last chosen.
    await page.locator("#group-RED").check();
    await expect(page.getByTestId("customer-number-select")).toHaveValue("1");
  });

  test("a household registered on an even number is blue on the record and on the card", async ({
    page,
  }) => {
    // Registered against the recommendation, which is what makes this a test of the *choice*: the
    // form proposed RED and the household is BLUE, and the only thing that made it BLUE is the 2.
    const { id } = await register(page, NUMBERS.blue);

    await expect(page.getByTestId("record-number-group")).toHaveText(
      de.customers.record.numberAndGroup(NUMBERS.blue, de.customers.groups.BLUE),
    );

    await page.goto(`/kunden/${id}/karte`);
    await expect(page.getByTestId("card-number")).toHaveText(card(NUMBERS.blue, 1));
    await expect(page.getByTestId("card-group")).toHaveText(de.customers.groups.BLUE);
  });

  test("a week with no free number cannot be chosen, and the other week still registers", async ({
    page,
  }) => {
    mover = await register(page, NUMBERS.mover);
    expect(mover.cardNumber).toBe(card(NUMBERS.mover, 1));
    await register(page, NUMBERS.fillerOne);
    await register(page, NUMBERS.fillerTwo);

    await page.goto("/kunden/neu");

    // Every odd slot below the quota is taken, so RED cannot be chosen — and the reason stands
    // beside the radio rather than leaving staff with a control that refuses without saying why. It
    // is what the radio is described by, so it is read out with it.
    const red = page.locator("#group-RED");
    await expect(red).toBeDisabled();
    await expect(red).toHaveAttribute("aria-describedby", "group-RED-full");
    await expect(page.locator("#group-RED-full")).toHaveText(
      de.customers.assignment.groupFull(de.customers.groups.RED),
    );

    // The register is *not* full, and the screen behaves accordingly: BLUE is standing, its two
    // slots are on offer, and the waiting list is not mentioned. That is the distinction this batch
    // bought — „voll" is now a question with two answers, and only one of them turns an applicant
    // away (US-12 stays for the other).
    await expect(page.locator("#group-BLUE")).toBeChecked();
    expect(await offeredNumbers(page, "customer-number-select")).toEqual([4, 6]);
    expect(await freeNumbers(page)).toBe(de.customers.assignment.freeNumbersByGroup(0, 2));
    await expect(page.getByTestId("registration-waiting-list-link")).toHaveCount(0);
    await expect(page.getByTestId("registration-error")).toHaveCount(0);

    await register(page, NUMBERS.registeredWhileRedIsFull);
  });

  test("the counter reads the week off the number, and turns the other one away", async ({
    page,
  }) => {
    // A RED distribution day. The two households differ in nothing a fixture set: one holds an odd
    // number and the other an even one.
    await lookUp(page, String(NUMBERS.mover));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    await expect(page.getByTestId("counter-group")).toHaveText(de.customers.groups.RED);

    await lookUp(page, String(NUMBERS.blue));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "WRONG_GROUP",
    );
    await expect(page.getByTestId("counter-group")).toHaveText(de.customers.groups.BLUE);
  });

  test("a card falls behind a household's counts, and never behind its week", async ({ page }) => {
    await page.goto(`/kunden/${mover.id}`);

    // A baby joins the household, so the card in their pocket now prints counts the record no longer
    // has. That is one of the two reasons a card can be behind — and since US-31 it is one of only
    // two, because the week a card names is the number printed on it.
    await page.getByTestId("add-member").click();
    await page.getByTestId("member-first-name-1").fill(faker.person.firstName());
    await page.getByTestId("member-last-name-1").fill(faker.person.lastName());
    await fillDay(page.getByTestId("member-birth-date-1"), BABY_BIRTH_DATE);
    await page.getByTestId("household-submit").click();
    await expect(page.getByTestId("household-saved")).toBeVisible();

    await page.goto("/karten-neuausstellung");
    const row = dueRow(page, NUMBERS.mover);
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("cards-due-reason")).toHaveText(
      de.cardsDue.reasons.HOUSEHOLD_CHANGE,
    );

    // And no row anywhere reports a week. There are two reasons left in the whole vocabulary, which
    // is the assertion: „Gruppe gewechselt" is not a row this list can print because a household
    // cannot change weeks without the same act printing the card.
    const reasons = await page.getByTestId("cards-due-reason").allInnerTexts();
    expect(new Set(reasons)).toEqual(
      new Set(reasons.map(() => de.cardsDue.reasons.HOUSEHOLD_CHANGE)),
    );
    expect(Object.values(de.cardsDue.reasons)).toEqual([
      de.cardsDue.reasons.AGE_13,
      de.cardsDue.reasons.HOUSEHOLD_CHANGE,
    ]);
  });

  test("moving the household to an even number moves them to the other week", async ({ page }) => {
    await page.goto(`/kunden/${mover.id}`);

    await expect(page.getByTestId("record-number-group")).toHaveText(
      de.customers.record.numberAndGroup(NUMBERS.mover, de.customers.groups.RED),
    );
    // The control opens in the household's own week — which can never be the sold-out one, because
    // their own slot is one of its choices — and offers exactly what the register has left plus that
    // slot. Their own number is not *free*, which is why the figures beneath say „Rot: 0".
    const select = page.getByTestId("number-change-select");
    await hydrated(select);
    await expect(page.locator("#group-RED")).toBeChecked();
    await expect(page.locator("#group-RED")).toBeEnabled();
    await expect(select).toHaveValue(String(NUMBERS.mover));
    expect(await offeredNumbers(page, "number-change-select")).toEqual([NUMBERS.mover]);
    expect(await freeNumbers(page)).toBe(de.customers.assignment.freeNumbersByGroup(0, 1));
    await expect(page.getByTestId("group-sizes")).toHaveText(
      de.customers.assignment.groupSizes(3, 2),
    );

    // The other week, and with it the one slot the register has left.
    await page.locator("#group-BLUE").check();
    await expect(select).toHaveValue(String(NUMBERS.moveTo));

    // All three values before the write, because all three are copied onto a piece of card by hand:
    // the slot, the week that slot collects in, and the number to write on the card. The index is
    // `k2` on a slot nobody has ever held: it is the later of the slot's next and the household's
    // own, and this household is holding their first card (US-30.3).
    await page.getByTestId("number-change-open").click();
    await expect(page.getByTestId("number-change-confirm")).toHaveText(
      plain(words.confirm(NUMBERS.moveTo, groupWord(NUMBERS.moveTo), card(NUMBERS.moveTo, 2))),
    );

    await page.getByTestId("number-change-submit").click();
    await expect(page.getByTestId("number-change-error")).toHaveCount(0);

    // The same three values afterwards, plus the slot that was freed — the one fact the revalidated
    // record above cannot state, because every field on it now says 6.
    await expect(page.getByTestId("number-change-saved")).toHaveText(
      plain(
        words.saved(
          NUMBERS.mover,
          NUMBERS.moveTo,
          groupWord(NUMBERS.moveTo),
          card(NUMBERS.moveTo, 2),
        ),
      ),
    );

    // Nothing was set to make this household BLUE: the badge, the card and the two sizes all read
    // the same number a different way.
    await expect(page.getByTestId("record-number-group")).toHaveText(
      de.customers.record.numberAndGroup(NUMBERS.moveTo, de.customers.groups.BLUE),
    );
    await expect(page.getByTestId("card-number")).toHaveText(card(NUMBERS.moveTo, 2));
    await expect(page.getByTestId("group-sizes")).toHaveText(
      de.customers.assignment.groupSizes(2, 3),
    );
    // One slot swapped for another: the register has exactly as many free numbers as before, and
    // they have changed sides. „A move never frees a slot" and „a move can change which week has
    // one" are both said by this line.
    expect(await freeNumbers(page)).toBe(de.customers.assignment.freeNumbersByGroup(1, 0));
  });

  test("the card carries the week it was printed for, and the replaced one keeps its own", async ({
    page,
  }) => {
    await page.goto(`/kunden/${mover.id}/karte`);

    await expect(page.getByTestId("card-number")).toHaveText(card(NUMBERS.moveTo, 2));
    await expect(page.getByTestId("card-group")).toHaveText(de.customers.groups.BLUE);

    // The card the household walked in with is listed under the slot it was printed on — and
    // therefore under the week it was printed for, since the two are the same fact. Re-labelling it
    // `6k2` would put a BLUE card into the world with a RED card's number on it, and the piece of
    // card saying `1k1` is still in somebody's pocket.
    await expect(page.getByTestId("superseded-card")).toHaveText([
      de.customers.cardView.supersededEntry(
        card(NUMBERS.mover, 1),
        "08.01.2026",
        de.customers.cardReasons.FIRST_ISSUE,
      ),
    ]);
    expect(groupWord(NUMBERS.mover)).not.toBe(groupWord(NUMBERS.moveTo));
  });

  test("the move takes the household off the reissue list", async ({ page }) => {
    await page.goto("/karten-neuausstellung");

    // The card the move printed carries today's counts, so the row is gone — not ticked off, but
    // derived afresh and no longer true. And nothing arrived in its place: a move can only ever take
    // a row off this list.
    await expect(dueRow(page, NUMBERS.mover)).toHaveCount(0);
    await expect(dueRow(page, NUMBERS.moveTo)).toHaveCount(0);
  });

  test("the counter serves the household under the new number, in the new week", async ({
    page,
  }) => {
    // The BLUE distribution day of the following week. Nothing was written between the move and
    // this: the household collects in the other week because the number they hold is even.
    pinDay(BLUE_DAY);

    await lookUp(page, String(NUMBERS.moveTo));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    await expect(page.getByTestId("counter-group")).toHaveText(de.customers.groups.BLUE);
    await expect(page.getByTestId("counter-card-number")).toHaveText(card(NUMBERS.moveTo, 2));
    await expect(page.getByTestId("serve-button")).toBeVisible();

    // And on the card itself, which is how it is read at the table.
    await lookUp(page, card(NUMBERS.moveTo, 2));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
  });

  test("a superseded card is answered with the week it was printed for", async ({ page }) => {
    pinDay(RED_DAY);

    // The vacated slot goes to the next household, and its card run counts on: `1k2`, because `1k1`
    // is out in the world in the mover's pocket (US-25).
    const successor = await register(page, NUMBERS.mover);
    expect(successor.cardNumber).toBe(card(NUMBERS.mover, 2));

    // The mover's old card number now resolves to the household holding that slot today, and is
    // refused as the superseded card it is — under the week the slot collects in, which is the week
    // printed on the card. It is never answered as the mover's, and never in the mover's week.
    await lookUp(page, card(NUMBERS.mover, 1));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "OUTDATED_CARD",
    );
    await expect(page.getByTestId("counter-group")).toHaveText(groupWord(NUMBERS.mover));
    await expect(page.getByTestId("counter-card-number")).toHaveText(card(NUMBERS.mover, 2));
  });

  test("the list's week filter returns exactly the households whose numbers have that parity", async ({
    page,
  }) => {
    await page.goto("/kunden");

    // Six slots, six households, three of each week — and the balance is counted off the numbers,
    // so it cannot disagree with the rows it stands above.
    await expect(page.getByTestId("group-counts")).toHaveText(de.customerList.groupBalance(3, 3));

    for (const group of ["RED", "BLUE"] as const) {
      await page.goto("/kunden");
      await page.getByTestId("group-filter").selectOption(group);
      await Promise.all([
        page.waitForURL(/\/kunden\?/),
        page.getByRole("button", { name: de.customerList.filters.submit }).click(),
      ]);

      const shown = await page
        .getByTestId("customer-row")
        .evaluateAll((rows) => rows.map((row) => Number(row.getAttribute("data-customer-number"))));
      expect(shown.every((number) => groupOf(number) === group)).toBe(true);
      expect(shown).toEqual([1, 2, 3, 4, 5, 6].filter((number) => groupOf(number) === group));
      // The balance is not the filter's: it answers „which week is smaller", which the rows on
      // screen have no bearing on.
      await expect(page.getByTestId("group-counts")).toHaveText(de.customerList.groupBalance(3, 3));
    }
  });
});
