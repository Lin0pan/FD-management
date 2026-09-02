import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { SHARED } from "./registers";
import { fillDay, fillSticky } from "./day";

/**
 * Archiving a household and watching their customer number come back into circulation, driven through
 * the built app (tasks/prd-us-10-archive-customer.md §US-10.5).
 *
 * Every piece is already proved in isolation: `transition` refuses a reason-less archive in the domain
 * gate, `archiveCustomer` stamps the row and keeps the children against fakes, `takenActiveNumbers`
 * skips archived rows against a throwaway SQLite file, and `findByCustomerNumber` prefers the active
 * holder. What none of them can see is the sentence DF actually cares about — *the number is free
 * again, and the household is still on file*. Those are two claims about two different customers on
 * three different screens, so this spec drives the whole mechanic end to end: register a household,
 * serve them so the archive has something to keep, archive them with a reason, and then watch the very
 * next registration be handed the number they gave up.
 *
 * Unlike the other specs here, this one **registers through the form rather than seeding through
 * Prisma**, and therefore names no customer number of its own: the freed number is only interesting
 * because the allocator handed it out, gave it back and handed it out again. It reads the number off
 * the proposal, exactly as the registration and card specs do, so the shared `data/e2e.db` sequence
 * stays undisturbed — this spec consumes one number net and leaves an archived row behind on it.
 *
 * "Still findable" is asserted through the record URL. Archiving frees the number, so the number is no
 * longer a way back to the household who gave it up (the counter answers whoever holds it now) — until
 * the customer search of US-15 exists, the surrogate id is the only find path there is.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every date
// stays a literal, because a distribution day and a valid certificate are decided by dates.
faker.seed(20260727);

/** The file `playwright.config.ts` points `FD_FIXED_NOW_FILE` at, relative to the repo root. */
const NOW_FILE = SHARED.now;

/**
 * The day this spec is judged on: Thursday 08.01.2026, 09:00 UTC.
 *
 * It follows from the seeded settings alone (`src/infrastructure/prisma/seed.ts`): anchor `2026-W02`
 * = RED, distributions on ISO weekday 4. So it is a RED distribution day, which is what lets the RED
 * household be served before they are archived — the hand-out is the record the archive must keep.
 */
const TODAY = "2026-01-08T09:00:00.000Z";
/** The day the archived banner names, as `germanDate` renders it. */
const TODAYS_DATE = germanDate(new Date(TODAY));

/** Born well before 13 years ago: a grown-up. Comfortably inside the last 13 years: a child. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
const CHILD_BIRTH_DATE = "2020-06-15";
const CERTIFICATE_VALID_UNTIL = "2027-06-30";

/**
 * Why this household is archived. Multi-line on purpose: it is the only explanation a later colleague
 * will find, so the banner has to carry it as it was typed rather than collapse it into one line.
 */
const ARCHIVE_REASON = "Umgezogen nach Paderborn, telefonisch abgemeldet.\nKeine Rückkehr geplant.";

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

/** A household as the form left it: the number on their card and the id their record lives at. */
interface Household {
  readonly id: number;
  readonly customerNumber: string;
  readonly name: string;
}

/**
 * Register one RED household with a grown-up and a child through the real form.
 *
 * The group is checked by hand rather than accepted from the balancing suggestion, because the
 * hand-out below depends on it: only a RED household is clear to serve in a RED week.
 *
 * @returns the number the proposal offered — which, on a serial run, is the number the save assigns.
 */
async function register(page: Page): Promise<Household> {
  const lastName = faker.person.lastName();
  const firstName = faker.person.firstName();
  const childFirstName = faker.person.firstName();

  await page.goto("/kunden/neu");
  const customerNumber = await page.getByTestId("customer-number-select").inputValue();

  await fillSticky(page.locator("#firstName"), firstName);
  await fillSticky(page.locator("#lastName"), lastName);
  await fillDay(page.locator("#birthDate"), GROWN_UP_BIRTH_DATE);
  await fillSticky(page.locator("#street"), faker.location.street());
  await fillSticky(page.locator("#houseNumber"), faker.location.buildingNumber());
  await fillSticky(page.locator("#zip"), faker.location.zipCode("#####"));
  await fillSticky(page.locator("#city"), faker.location.city());
  await fillSticky(page.locator("#certificateType"), "Jobcenter-Bescheid");
  await fillDay(page.locator("#certificateValidUntil"), CERTIFICATE_VALID_UNTIL);

  // The group choice is a `<details>` that starts closed (US-20.2), so the summary is clicked the
  // way staff would click it: a radio inside a closed disclosure has no bounding box and `check()`
  // would time out. A real click rather than `evaluate(d => (d.open = true))`, so that a summary
  // which stopped opening turns this spec red instead of being stepped around.
  await page.getByTestId("group-choice-open").click();
  await page.locator("#group-RED").check();

  // The applicant mirrors into the first household row; only the child is added by hand.
  await page.getByTestId("add-member").click();
  await fillSticky(page.locator("#memberFirstName-1"), childFirstName);
  await fillSticky(page.locator("#memberLastName-1"), lastName);
  await fillDay(page.locator("#memberBirthDate-1"), CHILD_BIRTH_DATE);

  await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();
  await page.waitForURL(/\/kunden\/\d+(\?|$)/);

  // The record the registration redirected to is addressed by the surrogate id, not by the number —
  // which is the whole reason an archived household stays reachable once the number has moved on.
  const id = Number(new URL(page.url()).pathname.split("/").at(-1));
  expect(Number.isInteger(id)).toBe(true);

  // The card names the slot, and the index is deliberately not pinned here: it counts the slot's
  // whole run rather than this household's, so a registration onto a number an archived household
  // released is not `k1` (US-25). The tests that know the run assert the index themselves.
  await expect(page.getByTestId("card-number")).toHaveText(new RegExp(`^${customerNumber}k\\d+$`));
  return { id, customerNumber, name: `${firstName} ${lastName}` };
}

/** Type a number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page, customerNumber: string): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(customerNumber);
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${customerNumber}`));
}

/**
 * Everything the household owns, as one comparable string.
 *
 * Archiving is a status change and nothing else (FR-5), so this has to come out identical either side
 * of it: the number stays on the row for historical reference, and the cards, the hand-outs, the
 * members and the certificate are all still there. One equality covers every table the archive could
 * have touched, and a future write nobody thought to check still fails the spec.
 */
async function belongings(id: number): Promise<string> {
  const [customer, cards, records] = await Promise.all([
    prisma.customer.findUniqueOrThrow({
      where: { id },
      select: {
        customerNumber: true,
        firstName: true,
        lastName: true,
        reminderCount: true,
        householdMembers: { select: { firstName: true, birthDate: true } },
        certificates: { select: { type: true, validUntil: true } },
      },
    }),
    prisma.card.findMany({
      where: { customerId: id },
      select: { index: true, reason: true },
      orderBy: { index: "asc" },
    }),
    prisma.distributionRecord.findMany({
      where: { customerId: id },
      select: { dayKey: true, paidCents: true, showedUp: true },
      orderBy: { dayKey: "asc" },
    }),
  ]);
  return JSON.stringify({ customer, cards, records });
}

/** The row's own mutable state, plus the size of the audit log — what a refused archive must not move. */
async function state(id: number): Promise<string> {
  const [customer, auditEntries] = await Promise.all([
    prisma.customer.findUniqueOrThrow({
      where: { id },
      select: { status: true, blockReason: true, archiveReason: true, archivedAt: true },
    }),
    prisma.auditEntry.count(),
  ]);
  return JSON.stringify({ customer, auditEntries });
}

const verdicts = de.distribution.counter.verdicts;

test.describe.configure({ mode: "serial" });

test.describe("Kunde archivieren", () => {
  /** The household this spec archives — registered in the first test, read by all the others. */
  let household: Household;

  test.beforeAll(() => {
    pinToday();
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it would freeze January for the settings specs,
    // which save a version stamped *now* and would then assert against the wrong month.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("a household is registered and served, so the archive has something to keep", async ({
    page,
  }) => {
    household = await register(page);

    // A hand-out on the day of registration: this is the row that must survive being archived, and
    // it can only be created here, because a household seeded through Prisma never held the number
    // the allocator is about to hand back out.
    await lookUp(page, household.customerNumber);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    await page.getByTestId("serve-button").click();
    await expect(page.getByTestId("already-served")).toBeVisible();

    expect(await prisma.distributionRecord.count({ where: { customerId: household.id } })).toBe(1);
  });

  test("archiving without a reason is refused and writes nothing", async ({ page }) => {
    const before = { belongings: await belongings(household.id), state: await state(household.id) };

    await page.goto(`/kunden/${household.id}`);
    await page.getByTestId("archive-open").click();

    // The reason is an archive's only record (FR-1), so save stays out of reach until one is typed —
    // and a run of spaces is no reason at all, because the use case trims before it reads.
    await expect(page.getByTestId("archive-submit")).toBeDisabled();
    await page.getByTestId("archive-reason").fill("   ");
    await expect(page.getByTestId("archive-submit")).toBeDisabled();
    await page.getByTestId("archive-reason").fill("x");
    await expect(page.getByTestId("archive-submit")).toBeEnabled();

    // The disabled button is a courtesy, not the guard: the rule lives in the state machine, behind
    // the use case. So the courtesy is stepped around — the field is blanked in the DOM without
    // telling React, which leaves the button enabled and submits a whitespace-only reason — and the
    // server is made to answer for itself. Spaces rather than an empty string, because `required`
    // would otherwise stop the form before it ever reached the action.
    await page.getByTestId("archive-reason").evaluate((field: HTMLTextAreaElement) => {
      field.value = "   ";
    });
    await page.getByTestId("archive-submit").click();

    await expect(page.getByTestId("archive-error")).toHaveText(
      de.customers.archive.errors.missingReason,
    );
    // Refused means refused: no status moved, no reason was stored, and the audit log did not grow.
    expect(await state(household.id)).toBe(before.state);
    expect(await belongings(household.id)).toBe(before.belongings);
    await expect(page.getByTestId("archived-banner")).toHaveCount(0);
  });

  test("archiving with a reason renders the record read-only and deletes nothing", async ({
    page,
  }) => {
    const before = await belongings(household.id);

    await page.goto(`/kunden/${household.id}`);
    await page.getByTestId("archive-open").click();

    // The confirmation is asserted rather than clicked past: it names the number that is about to go
    // back into circulation and promises that the record is kept, which are the two things staff
    // would otherwise learn from a support call — and both are proved by the tests below.
    await expect(page.getByTestId("archive-confirm")).toHaveText(
      de.customers.archive.confirm(Number(household.customerNumber)),
    );

    await page.getByTestId("archive-reason").fill(ARCHIVE_REASON);
    await page.getByTestId("archive-submit").click();

    // The archive navigates back to the record it was pressed on, and says so at the top of it. The
    // navigation is the point: the control is at the foot of a long page, and a `redirect` to the URL
    // the browser is already on leaves the scroll where it was — measured, that left the archived
    // banner 356px *above* the viewport, stating the outcome to nobody.
    await expect(page).toHaveURL(new RegExp(`/kunden/${household.id}\\?archiviert=1$`));
    await expect(page.getByTestId("archive-saved")).toHaveText(
      de.customers.archive.saved(Number(household.customerNumber)),
    );

    // The action revalidates the record in place: the status flips and the banner takes the top of
    // the page, carrying the day and the reason.
    await expect(page.getByTestId("customer-status")).toHaveText(de.customers.status.ARCHIVED);
    await expect(page.getByTestId("archived-banner")).toBeVisible();
    await expect(page.getByTestId("archived-reason")).toHaveText(
      de.customers.archive.bannerDetail(TODAYS_DATE, ARCHIVE_REASON),
    );
    // `toHaveText` normalises whitespace, so it cannot tell a reason shown as written from one
    // collapsed into a single run-on line. The line breaks a colleague typed are part of the record,
    // so the rendering itself is asserted.
    await expect(page.getByTestId("archived-reason")).toHaveCSS("white-space", "pre-line");

    // Read-only means every write control is *gone*, not disabled — there is no way out of ARCHIVED.
    await expect(page.getByTestId("archive-open")).toHaveCount(0);
    await expect(page.getByTestId("block-open")).toHaveCount(0);
    await expect(page.getByTestId("reissue-open")).toHaveCount(0);

    // And nothing was deleted on the way: same number, same card, same hand-out, same household.
    expect(await belongings(household.id)).toBe(before);
  });

  test("an archived household cannot be served at the counter", async ({ page }) => {
    const before = { belongings: await belongings(household.id), state: await state(household.id) };

    // The number still resolves to them for as long as nobody else holds it, and the answer is a
    // refusal: archived households are not entitled, whatever the week's colour says.
    await lookUp(page, household.customerNumber);

    await expect(page.getByTestId("counter-verdict")).toHaveAttribute("data-verdict", "ARCHIVED");
    await expect(page.getByTestId("counter-verdict-headline")).toHaveText(
      verdicts.archived.headline,
    );
    // The headline carries the refusal alone; the status badge below says the same thing in the
    // record, which is why the banner no longer repeats it.
    await expect(page.getByTestId("counter-verdict-detail")).toHaveCount(0);
    await expect(page.getByTestId("counter-status")).toHaveText(de.customers.status.ARCHIVED);
    // No hand-out can be recorded, and there is nothing left to archive either.
    await expect(page.getByTestId("serve-button")).toHaveCount(0);
    await expect(page.getByTestId("archive-open")).toHaveCount(0);

    // Turning someone away is a read (FR-4): the refusal cost the archived household nothing.
    expect(await state(household.id)).toBe(before.state);
    expect(await belongings(household.id)).toBe(before.belongings);
  });

  test("the freed number is handed to the next household while the archived record stays", async ({
    page,
  }) => {
    const archived = await belongings(household.id);

    // The point of the whole story: the number the archived household gave up is the lowest free one
    // again, so the very next registration is offered it — no gap in the sequence, no renumbering.
    await page.goto("/kunden/neu");
    await expect(page.getByTestId("customer-number-select")).toHaveValue(household.customerNumber);

    const successor = await register(page);
    expect(successor.customerNumber).toBe(household.customerNumber);
    expect(successor.id).not.toBe(household.id);
    await expect(page.getByTestId("customer-number")).toHaveText(String(household.customerNumber));
    // The number came back; the card number did not. The archived household walked out holding
    // `k1`, so the new holder starts at `k2` and that piece of card can never be issued again
    // (US-25).
    await expect(page.getByTestId("card-number")).toHaveText(`${household.customerNumber}k2`);

    // The number now names its new holder — an active holder always wins over an archived one, so
    // the counter cannot serve or refuse the wrong household.
    await lookUp(page, household.customerNumber);
    await expect(page.getByTestId("counter-name")).toHaveText(successor.name);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );

    // And the household who gave the number up is still there in full, reachable by their record:
    // the banner, the reason, the card and the hand-out from the day they were registered.
    await page.goto(`/kunden/${household.id}`);
    await expect(page.getByRole("main")).toContainText(household.name);
    await expect(page.getByTestId("archived-banner")).toBeVisible();
    await expect(page.getByTestId("archived-reason")).toHaveText(
      de.customers.archive.bannerDetail(TODAYS_DATE, ARCHIVE_REASON),
    );
    expect(await belongings(household.id)).toBe(archived);
  });
});
