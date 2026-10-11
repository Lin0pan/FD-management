import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { clearRegister } from "@/infrastructure/prisma/test-support";
import { hydrated } from "./day";
import { fillPersonalData } from "./registration-form";
import { ISOLATED } from "./registers";
import { endSession, endSessionInHook, startSession } from "./session";

/**
 * The round trip of „Karten drucken“ through the screens (`tasks/prd-us-39-cards-to-print.md`
 * §US-39.8): a card enters the list on issue, leaves on the tick, comes back on „Rückgängig“, and
 * Start, Übersichten and the list agree on one count throughout.
 *
 * **It owns a register** (`ISOLATED_SPECS`): „the tile reads 0" is a claim about the whole of one.
 */

faker.seed(20261001);

const NOW_FILE = ISOLATED.now;

/** The real clock, so a card ticked today reads as printed today. Nothing else here pins a day. */
const NOW = new Date();
const GROWN_UP_BIRTH_DATE = "1979-05-23";
const CERTIFICATE_VALID_UNTIL = new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

/** Three odd slots, so all three sit in RED and the counter's RED afternoon serves them. */
const FIRST = 1;
const SECOND = 3;
/**
 * Where the second household is moved to. Its card there is `5k2`, not `5k1`: a move never prints an
 * index the household already held (`nextCardIndexOnMove`).
 */
const MOVED_TO = 5;

const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(ISOLATED.database)}` });

/** Register a RED household on `slot` through the intake, the checkbox ticked or left alone. */
async function register(page: Page, slot: number, printed: boolean): Promise<number> {
  await page.goto("/kunden/neu");

  const select = page.getByTestId("customer-number-select");
  await hydrated(select);
  await page.locator("#group-RED").check();
  await select.selectOption(String(slot));

  await fillPersonalData(
    page,
    { firstName: faker.person.firstName(), lastName: faker.person.lastName() },
    {
      birthDate: GROWN_UP_BIRTH_DATE,
      certificateType: "Jobcenter-Bescheid",
      certificateValidUntil: CERTIFICATE_VALID_UNTIL,
    },
  );
  const box = page.getByTestId("registration-card-printed");
  await expect(box).not.toBeChecked();
  if (printed) await box.check();

  await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();
  await page.waitForURL(/\/kunden\/\d+(\?|$)/);
  await expect(page.getByTestId("customer-number")).toHaveText(String(slot));

  return Number(new URL(page.url()).pathname.split("/").at(-1));
}

function rows(page: Page): Locator {
  return page.getByTestId("cards-to-print-row");
}

function row(page: Page, customerNumber: number): Locator {
  return page.locator(
    `[data-testid="cards-to-print-row"][data-customer-number="${customerNumber}"]`,
  );
}

/** The list's card numbers, top to bottom. */
async function expectListed(page: Page, cardNumbers: ReadonlyArray<string>): Promise<void> {
  await page.goto("/karten-drucken");
  await expect(
    page.getByRole("heading", { level: 1, name: de.cardsToPrint.heading }),
  ).toBeVisible();
  await expect(page.getByTestId("cards-to-print-card-number")).toHaveText([...cardNumbers]);
}

/** Start's row and the Übersichten tile, which must say the same — and the row is absent at 0. */
async function expectCount(page: Page, count: number): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  if (count === 0) {
    await expect(page.getByTestId("to-do-cards-to-print")).toHaveCount(0);
  } else {
    await expect(page.getByTestId("to-do-cards-to-print-count")).toHaveText(String(count));
  }

  await page.goto("/uebersichten");
  await expect(page.getByTestId("overview-cards-to-print")).toHaveText(String(count));
}

/** „Gedruckt am …“ as the card view writes it, off the date the store holds. */
async function expectPrintedOnCardView(page: Page, id: number): Promise<void> {
  const card = await prisma.card.findFirstOrThrow({
    where: { customerId: id },
    orderBy: { index: "desc" },
  });
  expect(card.printedAt).not.toBeNull();
  if (card.printedAt === null) throw new Error("narrowed above");
  // Today, and on the same day the card was issued: the tick is now, not some other day.
  expect(germanDate(card.printedAt)).toBe(germanDate(NOW));

  await page.goto(`/kunden/${id}/karte`);
  await expect(page.getByTestId("card-printed-at")).toHaveText(
    `${de.customers.cardView.printedAt}: ${germanDate(card.printedAt)}`,
  );
}

test.describe.configure({ mode: "serial" });

test.describe("Karten drucken", () => {
  let firstId: number;
  let secondId: number;

  test.beforeAll(async () => {
    rmSync(NOW_FILE, { force: true });
    await clearRegister(prisma);
  });

  test.afterAll(async ({ browser, baseURL }) => {
    await endSessionInHook({ browser, baseURL });
    await prisma.$disconnect();
  });

  test("shows no to-do and a tile at 0 while nothing is waiting", async ({ page }) => {
    await expectCount(page, 0);
    await page.goto("/karten-drucken");
    await expect(page.getByTestId("cards-to-print-empty")).toHaveText(de.cardsToPrint.empty);
  });

  test("lists a household registered without the checkbox, and the counter still serves it", async ({
    page,
  }) => {
    firstId = await register(page, FIRST, false);

    await expectListed(page, [`${FIRST}k1`]);
    await expectCount(page, 1);

    // Not yet printed changes nothing at the counter (D11).
    await startSession(page, "RED");
    await page.goto("/ausgabe");
    await page.getByTestId("counter-input").fill(`${FIRST}k1`);
    await page.getByTestId("counter-input").press("Enter");
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    await expect(page.getByTestId("counter-verdict-headline")).toHaveText(
      de.distribution.counter.verdicts.clearToServe.headline,
    );
    await endSession(page);
  });

  test("leaves a household registered with the checkbox off the list", async ({ page }) => {
    secondId = await register(page, SECOND, true);

    await expectListed(page, [`${FIRST}k1`]);
    await expectCount(page, 1);
    await expectPrintedOnCardView(page, secondId);
  });

  test("ticks a card off, takes the tick back, and offers no undo once the page is reloaded", async ({
    page,
  }) => {
    await page.goto("/karten-drucken");
    await row(page, FIRST).getByTestId("cards-to-print-submit").click();
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByTestId("cards-to-print-done")).toBeVisible();

    await page.getByTestId("cards-to-print-undo").click();
    await expect(page).toHaveURL(/\/karten-drucken$/);
    await expect(row(page, FIRST)).toHaveCount(1);
    await expect(page.getByTestId("cards-to-print-done")).toHaveCount(0);

    await row(page, FIRST).getByTestId("cards-to-print-submit").click();
    await expect(page.getByTestId("cards-to-print-done")).toBeVisible();

    await expect(page).toHaveURL(/\/karten-drucken$/);
    await page.reload();
    await expect(page.getByTestId("cards-to-print-empty")).toBeVisible();
    await expect(page.getByTestId("cards-to-print-done")).toHaveCount(0);
    await expect(page.getByTestId("cards-to-print-undo")).toHaveCount(0);

    await expectCount(page, 0);
    await expectPrintedOnCardView(page, firstId);
  });

  test("puts a household back with the new card only after a loss reissue", async ({ page }) => {
    await page.goto(`/kunden/${firstId}`);
    await page.getByTestId("reissue-open").click();
    await expect(page.getByTestId("reissue-printed")).not.toBeChecked();
    await page.getByTestId("reissue-submit").click();
    await expect(page.getByTestId("card-number")).toHaveText(`${FIRST}k2`);

    // One row per household, and it is the card it holds — `1k1` was printed and is gone (D4).
    await expectListed(page, [`${FIRST}k2`]);
    await expectCount(page, 1);
  });

  test("lists the card a number change prints, under its new number", async ({ page }) => {
    await page.goto(`/kunden/${secondId}`);
    const select = page.getByTestId("number-change-select");
    await hydrated(select);
    await expect(async () => {
      await select.selectOption(String(MOVED_TO));
      await expect(select).toHaveValue(String(MOVED_TO), { timeout: 500 });
    }).toPass({ timeout: 10_000 });
    await page.getByTestId("number-change-open").click();
    await page.getByTestId("number-change-submit").click();
    await expect(page.getByTestId("customer-number")).toHaveText(String(MOVED_TO));

    // Oldest issue first: the reissue came before the move.
    await expectListed(page, [`${FIRST}k2`, `${MOVED_TO}k2`]);
    await expectCount(page, 2);
  });

  test("keeps a blocked household on the list and drops an archived one", async ({ page }) => {
    await page.goto(`/kunden/${firstId}`);
    await page.getByTestId("block-open").click();
    await page.getByTestId("block-reason").fill("Ausweis nicht vorgelegt.");
    await page.getByTestId("block-submit").click();
    await expect(page.getByTestId("block-saved")).toBeVisible();

    await expectListed(page, [`${FIRST}k2`, `${MOVED_TO}k2`]);
    await expect(row(page, FIRST).getByTestId("cards-to-print-blocked")).toHaveText(
      de.customers.status.BLOCKED,
    );
    await expectCount(page, 2);

    await page.goto(`/kunden/${firstId}`);
    await page.getByTestId("archive-open").click();
    await page.getByTestId("archive-reason").fill("Weggezogen.");
    await page.getByTestId("archive-submit").click();
    await expect(page.getByTestId("archive-saved")).toBeVisible();

    await expectListed(page, [`${MOVED_TO}k2`]);
    await expectCount(page, 1);
  });
});
