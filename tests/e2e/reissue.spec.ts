import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";

/**
 * Replacing a lost card and watching the old one stop working, driven through the built app
 * (tasks/prd-us-09-reissue-card-after-loss.md §US-09.4).
 *
 * Every piece of this is already proved in isolation: `issueCard` picks the next index against
 * fakes, `counterVerdict` returns `OUTDATED_CARD` for a superseded number in the domain gate, and
 * `issueCounts` aggregates a mixed history against a throwaway SQLite file. What none of them can
 * see is the sentence FD actually cares about — *the card in the customer's hand no longer works,
 * and the one we just wrote on does*. Those are two different screens, a write between them and a
 * derived number on each side, so this spec follows one household through the whole loop: reissue on
 * the record, read the new number off the card view, present the old number at the counter and be
 * refused, present the new one and be served.
 *
 * The other half is FR-3: being refused for an old card is *not* a sanction. It must not serve, not
 * block, not archive and not record — an absence only visible from outside the app, so the spec
 * snapshots the household through Prisma either side of the refused lookup and compares.
 *
 * One household is seeded straight through Prisma: RED, active, current certificate, one card. It
 * takes number 251 so the registration and card specs, which allocate the *lowest* free number in
 * the shared `data/e2e.db`, keep the low sequence they assert against, and so it stays clear of the
 * counter (201–206/239), portions (211), serve (221–222), reminders (231) and block (241) specs.
 */

// A fixed seed so a failure is reproducible; only the name and address come from Faker. Every date
// stays a literal, because a distribution day and a valid certificate are decided by dates.
faker.seed(20260726);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = "data/e2e-now.txt";

/**
 * The day this spec is judged on: Thursday 08.01.2026, 09:00 UTC.
 *
 * It follows from the seeded settings alone (`src/infrastructure/prisma/seed.ts`): anchor `2026-W02`
 * = RED, distributions on ISO weekday 4. So it is a RED distribution day, which is what makes the
 * RED household clear to serve on its new card — the replacement has to be good for food *today*,
 * not merely on file.
 */
const TODAY = "2026-01-08T09:00:00.000Z";

/** The number this spec owns. Well clear of the low sequence and the other specs' 200s. */
const CUSTOMER_NUMBER = 251;

/** The household's card number at a given running index, e.g. `251k2`. */
function card(index: number): string {
  return `${CUSTOMER_NUMBER}k${index}`;
}

/** Born well before 13 years ago: a grown-up. Comfortably inside the last 13 years: a child. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
const CHILD_BIRTH_DATE = "2020-06-15";
const VALID_CERTIFICATE = "2027-06-30";

/** The day the seeded first card was handed over, as the card view writes it. */
const SEEDED_CARD_ISSUED_AT = "2026-01-02T00:00:00.000Z";
const SEEDED_CARD_DATE = "02.01.2026";

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

/**
 * Insert one RED, active household with a grown-up, a child, a current certificate and one card.
 *
 * @returns the surrogate id the record page is addressed by (the URL takes the id, not the number).
 */
async function seedHousehold(): Promise<number> {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();
  const childFirstName = faker.person.firstName();

  const customer = await prisma.customer.create({
    data: {
      customerNumber: CUSTOMER_NUMBER,
      firstName,
      lastName,
      birthDate: new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      group: "RED",
      status: "ACTIVE",
      reminderCount: 0,
      notes: "",
      householdMembers: {
        create: [
          { firstName, lastName, birthDate: new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`) },
          {
            firstName: childFirstName,
            lastName,
            birthDate: new Date(`${CHILD_BIRTH_DATE}T00:00:00.000Z`),
          },
        ],
      },
      certificates: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: new Date(`${VALID_CERTIFICATE}T00:00:00.000Z`),
          recordedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      },
      cards: {
        create: [
          {
            index: 1,
            issuedAt: new Date(SEEDED_CARD_ISSUED_AT),
            reason: "FIRST_ISSUE",
            grownUpsAtIssue: 1,
            childrenAtIssue: 1,
          },
        ],
      },
    },
    select: { id: true },
  });

  return customer.id;
}

/**
 * Everything a refused lookup must leave exactly as it found it.
 *
 * The status is what a block or an archive would move, the distribution records are what a serve
 * would add, and the cards and audit entries are counted because either would gain a row — turning
 * someone away for an old card is a read, and a read that wrote anything would show up here.
 */
async function snapshotHousehold(id: number): Promise<string> {
  const [customer, cards, records, auditEntries] = await Promise.all([
    prisma.customer.findUniqueOrThrow({
      where: { id },
      select: { customerNumber: true, status: true, group: true, reminderCount: true },
    }),
    prisma.card.count({ where: { customerId: id } }),
    prisma.distributionRecord.count({ where: { customerId: id } }),
    prisma.auditEntry.count(),
  ]);
  return JSON.stringify({ customer, cards, records, auditEntries });
}

/**
 * Reissue once from the given screen, checking the confirmation before writing.
 *
 * The confirmation is asserted rather than clicked past: naming the number that dies and the number
 * that replaces it is the whole point of the step, because the second one is what staff copy onto
 * the physical card. The screen is re-opened each time so the disclosure starts closed.
 *
 * @param path the screen to reissue from — the customer record or its card view, both of which
 * carry the control and must behave identically.
 */
async function reissue(page: Page, path: string, current: string, next: string): Promise<void> {
  await page.goto(path);
  await page.getByTestId("reissue-open").click();
  await expect(page.getByTestId("reissue-confirm")).toHaveText(
    de.customers.reissue.confirm(current, next),
  );

  await page.getByTestId("reissue-submit").click();
  // Both screens show the held card number, so the write is confirmed by the number itself moving on
  // whichever screen it was started from — not by a toast that could outlive a failed transaction.
  await expect(page.getByTestId("card-number")).toHaveText(next);
  await expect(page.getByTestId("reissue-error")).toHaveCount(0);
}

/** Type a number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page, query: string): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(query);
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${query}`));
}

const verdicts = de.distribution.counter.verdicts;

test.describe.configure({ mode: "serial" });

test.describe("Karte nach Verlust neu ausstellen", () => {
  let id: number;

  test.beforeAll(async () => {
    pinToday();
    id = await seedHousehold();
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it would freeze January for the settings specs,
    // which save a version stamped *now* and would then assert against the wrong month.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("a reissue from the record hands out the next number and supersedes the old one", async ({
    page,
  }) => {
    await reissue(page, `/kunden/${id}`, card(1), card(2));

    // The card view is what staff read while they write the new card, so the replacement has to be
    // complete there: the new number, the old one listed as replaced, and the sentence that says so.
    await page.getByTestId("card-view-link").click();
    await page.waitForURL(/\/kunden\/\d+\/karte$/);

    await expect(page.getByTestId("card-number")).toHaveText(card(2));
    await expect(page.getByRole("main")).toContainText(de.customers.cardView.current);
    // The replaced number stays on record with the day and the reason *it* was handed over — a
    // superseded card is invalid, not deleted.
    await expect(page.getByTestId("superseded-card")).toHaveText(
      de.customers.cardView.supersededEntry(
        card(1),
        SEEDED_CARD_DATE,
        de.customers.cardReasons.FIRST_ISSUE,
      ),
    );

    // One card issued after the first, and that one was a loss — the two figures the card view shows.
    await expect(page.getByTestId("cards-issued")).toHaveText("2");
    await expect(page.getByTestId("reissues-for-loss")).toHaveText("1");
  });

  test("the lost card is refused at the counter without costing the household anything", async ({
    page,
  }) => {
    const before = await snapshotHousehold(id);

    await lookUp(page, card(1));

    // The verdict names both numbers: the one presented, so staff can see they read it right, and
    // the one that is now valid, so the conversation can move straight to the replacement.
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "OUTDATED_CARD",
    );
    await expect(page.getByTestId("counter-verdict-headline")).toHaveText(
      verdicts.outdatedCard.headline,
    );
    await expect(page.getByTestId("counter-verdict-detail")).toHaveText(
      verdicts.outdatedCard.detail(card(1), card(2)),
    );
    // Turned away means turned away: no hand-out can be recorded from this screen.
    await expect(page.getByTestId("serve-button")).toHaveCount(0);

    // FR-3: an old card is a refusal, never a sanction. The household is neither blocked nor
    // archived, no distribution record appeared, and the register is byte-for-byte as it was.
    expect(await snapshotHousehold(id)).toBe(before);
    const after = await prisma.customer.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    expect(after.status).toBe("ACTIVE");
  });

  test("the replacement card is clear to serve on the same day", async ({ page }) => {
    await lookUp(page, card(2));

    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    await expect(page.getByTestId("counter-verdict-headline")).toHaveText(
      verdicts.clearToServe.headline,
    );
    // Same household, same number, same group as before the loss — only the index moved.
    await expect(page.getByTestId("counter-card-number")).toHaveText(card(2));
    await expect(page.getByTestId("counter-status")).toHaveText(de.customers.status.ACTIVE);
    await expect(page.getByTestId("serve-button")).toBeVisible();
  });

  test("two further reissues take the loss count to three and are not held up", async ({
    page,
  }) => {
    // From the card view this time, which is the screen staff already have open once a card is in
    // question — and, being the same control, must reissue exactly as the record does.
    await reissue(page, `/kunden/${id}/karte`, card(2), card(3));
    await reissue(page, `/kunden/${id}/karte`, card(3), card(4));

    // Nothing stood in the way of the third: there is no limit and no confirmation beyond the one
    // every reissue gets (FR-4).
    await page.goto(`/kunden/${id}/karte`);
    await expect(page.getByTestId("card-number")).toHaveText(card(4));
    await expect(page.getByTestId("cards-issued")).toHaveText("4");
    await expect(page.getByTestId("reissues-for-loss")).toHaveText("3");

    // The count is information, not a verdict: the screen states it and offers the next reissue in
    // the same breath, with no warning attached to it (FR-4, §5).
    await expect(page.getByRole("main")).toContainText(de.customers.cardView.issuedHint);
    await expect(page.getByTestId("reissue-open")).toBeVisible();

    // And the household is still just a household — three losses have moved no status and every
    // superseded number is on record rather than deleted.
    await expect(page.getByTestId("superseded-card")).toHaveCount(3);
    await lookUp(page, card(4));
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
  });
});
