import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { SHARED } from "./registers";
import { fillDay, hydrated } from "./day";

/**
 * A card number is handed out once and never again, driven through the built app
 * (tasks/prd-us-25-globally-unique-card-numbers.md §US-025.6).
 *
 * Every piece is proved on its own: `nextCardIndex` counts on from the highest in the domain gate,
 * `highestIndexForNumber` reads the slot's whole run against a throwaway SQLite file, and
 * `registerCustomer` and `issueCard` both ask it against fakes. What none of them can see is the bug
 * that motivated the story, because it needs *two households and a customer number in between*: a
 * customer number is a slot an archived household gives back (US-10, US-24), so the household who
 * takes it over used to be handed `<slot>k1` — the very number the household who left is still
 * carrying on a piece of card. The counter then answered „Ausgabe frei" to a card belonging to a
 * household that is no longer on the register, and every unit suite in the project stayed green.
 *
 * So this spec walks the whole sequence on one slot: register, note the card, archive, register
 * somebody else on the same number, and ask the counter about both cards. It then asks the database
 * the question the screens cannot — that no two card rows share a number, and that nothing was
 * deleted to arrange it — and reissues once, to prove the run goes on counting upwards rather than
 * back over the numbers the slot has already spent.
 *
 * Unlike the specs that read the number off the proposal, this one **picks its number** (US-24): the
 * two households have to land on the *same* slot, which the allocator would never do while the first
 * of them holds it. {@link SLOT} is therefore a number of this spec's own — high, inside the quota
 * of 240 so the control offers it at all, and clear of every other spec's band.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every date
// stays a literal, because a distribution day and a valid certificate are decided by dates.
faker.seed(20260806);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/**
 * The day this spec is judged on: Thursday 08.01.2026, 09:00 UTC.
 *
 * It follows from the seeded settings alone (`src/infrastructure/prisma/seed.ts`): anchor `2026-W02`
 * = RED, distributions on ISO weekday 4. So it is a RED distribution day, which is what lets the
 * successor's card reach „Ausgabe frei" — the point of the story is that *their* card works and the
 * archived household's does not, and a wrong-colour week would refuse both for the same reason.
 */
const TODAY = "2026-01-08T09:00:00.000Z";

/**
 * The one customer number this spec owns — the slot both households sit on, one after the other.
 *
 * It has to be **inside the quota of 240**, unlike the bands the seeding specs took (241 upwards):
 * the control offers `1..quotaN`, and a number nobody may pick could not be chosen twice. It is
 * **odd, and therefore RED** (US-31), which is what lets the successor's card be cleared on the RED
 * distribution day pinned above — the group is not a second thing to choose any more, it is what
 * this number is. 237 is free of every band named in `scripts/ralph/progress.txt`: counter
 * (201–207, 239), allowance (211), serve (213–217), number change (221–229), reminders (231) and
 * registration (232–236) are the only ones below 240, and the low sequence the allocating specs
 * consume is nowhere near it.
 */
const SLOT = 237;

/** The card number this spec expects at a given index on {@link SLOT}, e.g. `237k2`. */
function card(index: number): string {
  return `${SLOT}k${index}`;
}

/** Born well before 13 years ago: a grown-up on any day this spec could run. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
const CERTIFICATE_VALID_UNTIL = "2027-06-30";

/** Why the first household leaves the register — an archive's only record (US-10, FR-1). */
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

/** A household as the form left it: where its record lives and what was written on its card. */
interface Household {
  readonly id: number;
  readonly cardNumber: string;
}

/**
 * Register one RED household on {@link SLOT} through the real form.
 *
 * The number is chosen in the dropdown rather than accepted from the proposal, which is the only way
 * two households can be put on one slot: the allocator offers the lowest free number, and that is
 * never the number the household before them is still holding.
 *
 * The week is checked by hand rather than accepted from the recommendation, because the counter
 * assertions depend on it — only a RED household is clear to serve in a RED week. Since US-31 that
 * is the same act as choosing the slot: the radios filter the list the number is picked from.
 *
 * @returns the record's id and the card number the screen shows for it.
 */
async function register(page: Page): Promise<Household> {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();

  await page.goto("/kunden/neu");

  // The week first, because the list beneath it is that week's numbers: the slot is odd, so it is
  // RED's list it is on (US-31). Waited for, since a click before React owns the radio moves the dot
  // without moving the list.
  await hydrated(page.locator("#group-RED"));
  await page.locator("#group-RED").check();

  // The slot is free — the register has never held anybody on it, or the household who did has been
  // archived — so it is on offer. That it is offered *after* an archive is US-10's rule, and it is
  // the precondition for everything below: without it there is no second household to hand a card to.
  await expect(page.locator(`#customerNumber option[value="${SLOT}"]`)).toHaveCount(1);
  await page.getByTestId("customer-number-select").selectOption(String(SLOT));

  await page.locator("#firstName").fill(firstName);
  await page.locator("#lastName").fill(lastName);
  await fillDay(page.locator("#birthDate"), GROWN_UP_BIRTH_DATE);
  await page.locator("#street").fill(faker.location.street());
  await page.locator("#houseNumber").fill(faker.location.buildingNumber());
  await page.locator("#zip").fill(faker.location.zipCode("#####"));
  await page.locator("#city").fill(faker.location.city());
  await page.locator("#certificateType").fill("Jobcenter-Bescheid");
  await fillDay(page.locator("#certificateValidUntil"), CERTIFICATE_VALID_UNTIL);

  await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();
  await page.waitForURL(/\/kunden\/\d+(\?|$)/);

  await expect(page.getByTestId("customer-number")).toHaveText(String(SLOT));
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

/** Every card number in the register, as the pair the unique constraint is on. */
async function everyCardNumber(): Promise<ReadonlyArray<string>> {
  const cards = await prisma.card.findMany({
    select: { customerNumber: true, index: true },
    orderBy: [{ customerNumber: "asc" }, { index: "asc" }],
  });
  return cards.map((row) => `${row.customerNumber}k${row.index}`);
}

/** The card indexes on {@link SLOT}, with the record each was printed for. */
async function cardsOnSlot(): Promise<ReadonlyArray<{ index: number; customerId: number }>> {
  return prisma.card.findMany({
    where: { customerNumber: SLOT },
    select: { index: true, customerId: true },
    orderBy: { index: "asc" },
  });
}

const verdicts = de.distribution.counter.verdicts;

test.describe.configure({ mode: "serial" });

test.describe("Kartennummern werden nie doppelt vergeben", () => {
  /** The household who leaves the register still holding a card, and the one given their number. */
  let left: Household;
  let successor: Household;

  test.beforeAll(() => {
    pinToday();
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it would freeze January for the settings specs,
    // which save a version stamped *now* and would then assert against the wrong month.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("a household is archived while still holding the card printed on their number", async ({
    page,
  }) => {
    left = await register(page);
    // Nobody has ever held this slot, so its run starts at 1 — which is now a consequence of the
    // counting rule rather than the constant it used to be (US-25).
    expect(left.cardNumber).toBe(card(1));

    await page.goto(`/kunden/${left.id}`);
    await page.getByTestId("archive-open").click();
    await page.getByTestId("archive-reason").fill(ARCHIVE_REASON);
    await page.getByTestId("archive-submit").click();

    await expect(page.getByTestId("archive-saved")).toHaveText(de.customers.archive.saved(SLOT));
    await expect(page.getByTestId("customer-status")).toHaveText(de.customers.status.ARCHIVED);

    // The card itself is untouched by the archive: it is still on the record, and — this being the
    // whole premise — still in the household's pocket. Nothing recalls a piece of printed card.
    expect(await cardsOnSlot()).toEqual([{ index: 1, customerId: left.id }]);
  });

  test("the household given the freed number is not handed the card that left with it", async ({
    page,
  }) => {
    successor = await register(page);

    expect(successor.id).not.toBe(left.id);
    expect(successor.cardNumber).not.toBe(left.cardNumber);
    // Not merely different: the next number on the slot. The run counts the slot's cards, so the
    // first card of the second household is `237k2`, and `237k1` can never be issued again.
    expect(successor.cardNumber).toBe(card(2));
  });

  test("the card the archived household walked out with is refused at the counter", async ({
    page,
  }) => {
    await lookUp(page, left.cardNumber);

    // The bug this story exists to close: before US-25 this number *was* the successor's card, and
    // the counter said „Ausgabe frei" to a household that is no longer on the register.
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "OUTDATED_CARD",
    );
    await expect(page.getByTestId("counter-verdict-headline")).toHaveText(
      verdicts.outdatedCard.headline,
    );
    // And the number that *is* valid on this slot is named beside it, so the conversation can move
    // straight to the card the household in front of the counter should be holding.
    await expect(page.getByTestId("counter-card-number")).toHaveText(successor.cardNumber);
    await expect(page.getByTestId("serve-button")).toHaveCount(0);
  });

  test("the successor's own card is clear to serve on the same day", async ({ page }) => {
    await lookUp(page, successor.cardNumber);

    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    await expect(page.getByTestId("counter-verdict-headline")).toHaveText(
      verdicts.clearToServe.headline,
    );
    await expect(page.getByTestId("counter-card-number")).toHaveText(card(2));
    await expect(page.getByTestId("serve-button")).toBeVisible();
  });

  test("the successor's card count is theirs and not the slot's", async ({ page }) => {
    await page.goto(`/kunden/${successor.id}/karte`);

    await expect(page.getByTestId("card-number")).toHaveText(card(2));
    // One card, not two: the index counts the slot's history, the count counts the household's. A
    // household reading „Ausgestellte Karten 2" on the day they were registered would be being told
    // they had already lost one.
    await expect(page.getByTestId("cards-issued")).toHaveText("1");
    await expect(page.getByTestId("reissues-for-loss")).toHaveText("0");
    // And it replaces nothing of *theirs*: the superseded list is the record's run, not the slot's.
    await expect(page.getByTestId("superseded-card")).toHaveCount(0);
    await expect(page.getByRole("main")).toContainText(de.customers.cardView.supersededNone);
  });

  test("no card number in the register belongs to two cards, and none was deleted", async () => {
    const numbers = await everyCardNumber();

    // The claim the whole story makes, asserted over the *whole* register rather than this slot:
    // a card number names one physical card, for good.
    expect(numbers).toHaveLength(new Set(numbers).size);
    // Nothing was deleted to make room — the archived household's card is still on file, and the
    // successor's sits above it on the same slot.
    expect(await cardsOnSlot()).toEqual([
      { index: 1, customerId: left.id },
      { index: 2, customerId: successor.id },
    ]);
  });

  test("a reissue counts on from the slot's highest and never back over a spent number", async ({
    page,
  }) => {
    await page.goto(`/kunden/${successor.id}`);
    await page.getByTestId("reissue-open").click();

    // The replacement is `237k3`, and the confirmation names it before the write because it is what
    // staff copy onto the physical card. `237k1` is not offered back even though its household has
    // left the register: the slot's run only ever goes upwards.
    await expect(page.getByTestId("reissue-confirm")).toHaveText(
      de.customers.reissue.confirm(card(2), card(3)),
    );
    await page.getByTestId("reissue-submit").click();
    await expect(page.getByTestId("card-number")).toHaveText(card(3));

    expect(await cardsOnSlot()).toEqual([
      { index: 1, customerId: left.id },
      { index: 2, customerId: successor.id },
      { index: 3, customerId: successor.id },
    ]);

    // The archived household's card is refused as it was before the reissue, now against the newest
    // number — a retired card number stays retired however many cards the slot goes on to print.
    await lookUp(page, left.cardNumber);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "OUTDATED_CARD",
    );
    await expect(page.getByTestId("counter-card-number")).toHaveText(card(3));

    const numbers = await everyCardNumber();
    expect(numbers).toHaveLength(new Set(numbers).size);
  });
});
