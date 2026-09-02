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
 * Blocking a customer and seeing it hold at the counter, driven through the built app
 * (tasks/prd-us-08-block-unblock-customer.md §US-08.5).
 *
 * The state machine, the two use cases and the counter verdict are each proved in isolation — the
 * domain gate on `transition`, `block-customer`/`unblock-customer` against fakes, `counterVerdict`
 * on the verdict, and the setStatus invariant against a throwaway SQLite file. What none of them can
 * see is the loop a staff member actually performs: type a reason on the record, then find the
 * household at the counter and read that same reason back, verbatim, as the thing that turns them
 * away. So this spec blocks a real household on the real screen and asserts the reason surfaces at
 * the counter with no serve action offered, then lifts the block and proves the household is servable
 * again on the same customer number and the same card — a block pauses, it never renumbers.
 *
 * It also pins FR-1 from outside: the reason is a block's only record, so an empty one must be
 * impossible to submit — the save control stays disabled until a non-whitespace reason is typed.
 *
 * One household is seeded straight through Prisma: RED, active, current certificate, one card. It
 * takes a number in the 240s so the registration and card specs, which allocate the *lowest* free
 * number in the shared `data/e2e.db`, keep the low sequence they assert against, and so it stays
 * clear of the counter (201–207/239), allowance (211), serve (213–217), number change (221–229)
 * and reminders (231) specs.
 */

// A fixed seed so a failure is reproducible; only the name and address come from Faker. Every date
// stays a literal, because a distribution day and a valid certificate are decided by dates.
faker.seed(20260725);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/**
 * The day this spec is judged on: Thursday 08.01.2026, 09:00 UTC.
 *
 * It follows from the seeded settings alone (`src/infrastructure/prisma/seed.ts`): anchor `2026-W02`
 * = RED, distributions on ISO weekday 4. So it is a RED distribution day, which is what makes the RED
 * household clear to serve once the block is lifted.
 */
const TODAY = "2026-01-08T09:00:00.000Z";

/** The number this spec owns. Well clear of the low sequence and the other specs' 200s. */
const CUSTOMER_NUMBER = 241;
/** The card the household holds — its only card, so the number is fixed. */
const CARD_NUMBER = `${CUSTOMER_NUMBER}k1`;

/** Born well before 13 years ago: a grown-up. Comfortably inside the last 13 years: a child. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
const CHILD_BIRTH_DATE = "2020-06-15";
const VALID_CERTIFICATE = "2027-06-30";

/**
 * The reason typed on the record and read back at the counter. Multi-line on purpose: the counter
 * banner must show it in full, never truncated behind a "more" link, so it has to survive a newline.
 */
const BLOCK_REASON = "Wiederholt aggressiv gegenüber Helfern.\nRücksprache mit der Leitung nötig.";

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

/**
 * Insert one RED, active household with a grown-up, a child, a current certificate and one card.
 *
 * @returns the surrogate id the record page is addressed by (the URL takes the id, not the number),
 * alongside the name the counter should show.
 */
async function seedHousehold(): Promise<{ id: number; name: string }> {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();
  const childFirstName = faker.person.firstName();

  // Idempotent, so a CI retry can re-run this block instead of dying on the

  // unique customer number (tests/e2e/seeding.ts).

  await releaseNumbers(prisma, CUSTOMER_NUMBER);

  const customer = await prisma.customer.create({
    data: {
      customerNumber: CUSTOMER_NUMBER,
      firstName,
      lastName,
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate: new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
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
            customerNumber: CUSTOMER_NUMBER,
            index: 1,
            issuedAt: new Date("2026-01-02T00:00:00.000Z"),
            reason: "FIRST_ISSUE",
            // What the printed card says about the household — matching the seeded one, so no
            // spec here trips the cards-due-for-reissue list (US-13).
            grownUpsAtIssue: 1,
            childrenAtIssue: 1,
          },
        ],
      },
    },
    select: { id: true },
  });

  return { id: customer.id, name: `${firstName} ${lastName}` };
}

/** Type a number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page, customerNumber: number): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(String(customerNumber));
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${customerNumber}`));
}

const words = de.distribution.counter.verdicts;

test.describe.configure({ mode: "serial" });

test.describe("Kunde sperren und entsperren", () => {
  let id: number;
  let name: string;

  test.beforeAll(async () => {
    pinToday();
    ({ id, name } = await seedHousehold());
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it would freeze January for the settings specs,
    // which save a version stamped *now* and would then assert against the wrong month.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("an empty or whitespace reason cannot be submitted", async ({ page }) => {
    await page.goto(`/kunden/${id}`);
    await page.getByTestId("block-open").click();

    // The reason is a block's only record (FR-1), so save stays out of reach until one is typed —
    // and a run of spaces is no reason at all, because the use case trims before it reads.
    await expect(page.getByTestId("block-submit")).toBeDisabled();
    await page.getByTestId("block-reason").fill("   ");
    await expect(page.getByTestId("block-submit")).toBeDisabled();
    await page.getByTestId("block-reason").fill("x");
    await expect(page.getByTestId("block-submit")).toBeEnabled();
  });

  test("a blocked household is turned away at the counter with the reason shown in full", async ({
    page,
  }) => {
    await page.goto(`/kunden/${id}`);
    await page.getByTestId("block-open").click();
    await page.getByTestId("block-reason").fill(BLOCK_REASON);
    await page.getByTestId("block-submit").click();

    // The block says so where the button was. It has to be stated by the control rather than left
    // to the status pill: the pill is 2 000px up the record, and "Sperren" turning into "Sperre
    // aufheben" is a change to the thing you just pressed, not an answer from it.
    await expect(page.getByTestId("block-saved")).toHaveText(de.customers.block.blocked);

    // The action revalidates the record: the status flips to blocked and the reason is on file,
    // shown verbatim on the record before it is ever read at the counter.
    await expect(page.getByTestId("customer-status")).toHaveText(de.customers.status.BLOCKED);
    await expect(page.getByTestId("block-reason-current")).toHaveText(BLOCK_REASON);

    // At the counter the same reason is the verdict — in full, not the "no reason on file" fallback —
    // and no serve action is offered, so a blocked household cannot be handed food.
    await lookUp(page, CUSTOMER_NUMBER);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute("data-verdict", "BLOCKED");
    await expect(page.getByTestId("counter-verdict-headline")).toHaveText(words.blocked.headline);
    await expect(page.getByTestId("counter-verdict-detail")).toHaveText(BLOCK_REASON);
    await expect(page.getByTestId("counter-verdict-detail")).not.toHaveText(words.blocked.noReason);
    // `toHaveText` normalises whitespace, so it cannot tell a reason shown as written from one
    // collapsed into a single run-on line. The line breaks a colleague typed are part of "verbatim
    // and in full", so the rendering itself is asserted: the banner must preserve them.
    await expect(page.getByTestId("counter-verdict-detail")).toHaveCSS("white-space", "pre-line");
    await expect(page.getByTestId("counter-status")).toHaveText(de.customers.status.BLOCKED);
    await expect(page.getByTestId("counter-name")).toHaveText(name);
    await expect(page.getByTestId("serve-button")).toHaveCount(0);
  });

  test("lifting the block makes the household servable on the same number and card", async ({
    page,
  }) => {
    await page.goto(`/kunden/${id}`);

    // Lifting confirms first: the reason being cleared is shown before the button, so it is a
    // deliberate act, not a stray click.
    await page.getByTestId("unblock-open").click();
    await expect(page.getByText(de.customers.block.unblockConfirm(BLOCK_REASON))).toBeVisible();
    await page.getByTestId("unblock-submit").click();

    // And the lift says so in its own words — the confirmation belongs to the write that happened,
    // not to the control now on screen, which is "Sperren" again.
    await expect(page.getByTestId("block-saved")).toHaveText(de.customers.block.unblocked);

    // Back to active, and the block controls give way to "Sperren" again — the reason is gone.
    await expect(page.getByTestId("customer-status")).toHaveText(de.customers.status.ACTIVE);
    await expect(page.getByTestId("block-reason-current")).toHaveCount(0);

    // The household serves again, and neither the customer number nor the card moved — a block
    // pauses a slot, it never renumbers it.
    await lookUp(page, CUSTOMER_NUMBER);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    await expect(page.getByTestId("serve-button")).toBeVisible();
    await expect(page.getByTestId("counter-card-number")).toHaveText(CARD_NUMBER);
  });
});
