import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import { SHARED } from "./registers";
import { fillDay, typedDay } from "./day";

/**
 * A household that was archived coming back and being registered again, driven through the built app
 * (tasks/prd-us-11-reuse-archived-record.md §US-11.5).
 *
 * Every part is proved on its own already: `searchArchivedCustomers` lists only archived rows against
 * fakes, `draftFromArchived` copies a household without touching it, `registerCustomer` allocates the
 * lowest free number and issues the next card due on it, and the folded search keys are matched
 * against a throwaway
 * SQLite file. What none of them can see is the sentence DF actually cares about — *these are the same
 * people and a different customer*. That claim spans three screens, two customer records and the
 * allocator in between, so it can only be made here.
 *
 * The spec deliberately arranges the awkward case rather than the comfortable one: before the
 * household comes back, **somebody else is given the number they gave up**. A re-registration that
 * quietly reused the old number would pass a friendlier fixture and collide here — which is exactly
 * the mistake FR-3 exists to prevent.
 *
 * Like `archive.spec.ts` this one **registers through the form** rather than seeding through Prisma:
 * a household inserted by hand never held a number the allocator handed out, so the number moving on
 * would not be observable. It therefore names no customer number of its own — every number is read off
 * the proposal — and consumes two numbers net, leaving one archived record behind on the first.
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
 * household be served before they are archived — the hand-out is the history the archived record has
 * to keep once its people have been registered a second time.
 */
const TODAY = "2026-01-08T09:00:00.000Z";
/** The day the archive search and the pre-fill banner name, as `germanDate` renders it. */
const TODAYS_DATE = germanDate(new Date(TODAY));

/** Born well before 13 years ago: a grown-up. Comfortably inside the last 13 years: a child. */
const GROWN_UP_BIRTH_DATE = "1985-02-11";
const CHILD_BIRTH_DATE = "2020-06-15";
const CERTIFICATE_VALID_UNTIL = "2027-06-30";
/** The paper the returning household presents today — a new one, never the archived record's. */
const RETURNING_CERTIFICATE_TYPE = "Wohngeldbescheid";

/** Why the household was archived. Shown on the search result, because it may be what staff need. */
const ARCHIVE_REASON = "Vorübergehend weggezogen, Rückkehr nicht ausgeschlossen.";

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

interface Person {
  readonly firstName: string;
  readonly lastName: string;
}

interface Address {
  readonly street: string;
  readonly houseNumber: string;
  readonly zip: string;
  readonly city: string;
}

/** A household as the form left it: who they are, where they live and what they were given. */
interface Household {
  readonly id: number;
  readonly customerNumber: string;
  readonly applicant: Person;
  readonly child: Person;
  readonly address: Address;
}

/**
 * Register one RED household — a grown-up and a child — through the real form.
 *
 * The surname is passed in rather than drawn here, because the whole spec turns on two records
 * sharing one: the household that comes back, and the active household who was given their number
 * in the meantime and must therefore *not* appear in an archive search for that name (FR-6).
 *
 * The group is checked by hand rather than accepted from the balancing suggestion: the hand-out
 * below depends on it, since only a RED household is clear to serve in a RED week.
 *
 * @returns the number the proposal offered — which, on a serial run, is the number the save assigns.
 */
async function register(page: Page, lastName: string): Promise<Household> {
  const applicant: Person = { firstName: faker.person.firstName(), lastName };
  const child: Person = { firstName: faker.person.firstName(), lastName };
  const address: Address = {
    street: faker.location.street(),
    houseNumber: faker.location.buildingNumber(),
    zip: faker.location.zipCode("#####"),
    city: faker.location.city(),
  };

  await page.goto("/kunden/neu");
  const customerNumber = await page.getByTestId("customer-number-select").inputValue();

  await page.locator("#firstName").fill(applicant.firstName);
  await page.locator("#lastName").fill(applicant.lastName);
  await fillDay(page.locator("#birthDate"), GROWN_UP_BIRTH_DATE);
  await page.locator("#street").fill(address.street);
  await page.locator("#houseNumber").fill(address.houseNumber);
  await page.locator("#zip").fill(address.zip);
  await page.locator("#city").fill(address.city);
  await page.locator("#certificateType").fill("Jobcenter-Bescheid");
  await fillDay(page.locator("#certificateValidUntil"), CERTIFICATE_VALID_UNTIL);

  // Both disclosures on this screen start closed. This one is the group choice (US-20.2): clicked
  // for real, once per page load, because a radio inside a closed `<details>` has no bounding box —
  // the same reason `searchArchive` below clicks its own summary rather than setting `open`.
  await page.getByTestId("group-choice-open").click();
  await page.locator("#group-RED").check();

  // The applicant mirrors into the first household row; only the child is added by hand.
  await page.getByTestId("add-member").click();
  await page.locator("#memberFirstName-1").fill(child.firstName);
  await page.locator("#memberLastName-1").fill(child.lastName);
  await fillDay(page.locator("#memberBirthDate-1"), CHILD_BIRTH_DATE);

  await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();
  await page.waitForURL(/\/kunden\/\d+(\?|$)/);

  const id = Number(new URL(page.url()).pathname.split("/").at(-1));
  expect(Number.isInteger(id)).toBe(true);

  // The card names the slot, and the index is deliberately not pinned here: it counts the slot's
  // whole run rather than this household's, so the successor below — registered onto the number the
  // returning household released — is not `k1` (US-25).
  await expect(page.getByTestId("card-number")).toHaveText(new RegExp(`^${customerNumber}k\\d+$`));
  return { id, customerNumber, applicant, child, address };
}

/** Type a number at the counter and press Enter, exactly as staff do it. */
async function lookUp(page: Page, customerNumber: string): Promise<void> {
  await page.goto("/ausgabe");
  await page.getByTestId("counter-input").fill(customerNumber);
  await page.getByTestId("counter-input").press("Enter");
  await expect(page).toHaveURL(new RegExp(`nummer=${customerNumber}`));
}

/**
 * Everything the archived household is and owns, as one comparable string.
 *
 * Re-registration must not reach back into the record it copied from (FR-5), so this has to come out
 * identical either side of it — right down to `previousCustomerId`, which points forwards from the new
 * record and must never be written onto the old one. One equality covers every table the
 * re-registration could have touched, and a future write nobody thought to check still fails the spec.
 */
async function belongings(id: number): Promise<string> {
  const [customer, cards, records] = await Promise.all([
    prisma.customer.findUniqueOrThrow({
      where: { id },
      select: {
        customerNumber: true,
        firstName: true,
        lastName: true,
        status: true,
        group: true,
        reminderCount: true,
        archiveReason: true,
        archivedAt: true,
        previousCustomerId: true,
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
      select: { dayKey: true, paid: true, showedUp: true },
      orderBy: { dayKey: "asc" },
    }),
  ]);
  return JSON.stringify({ customer, cards, records });
}

/**
 * Search the archive as staff do: unfold the panel beside the form, type into it and press Suchen.
 *
 * The panel is a `<details>` that starts closed (US-19.1), so the click is not a flourish — a
 * control inside a closed disclosure has no bounding box and `fill()` would time out against it.
 * It is a *real* click on the summary rather than `evaluate(d => (d.open = true))` for the same
 * reason the fold is worth testing at all: a summary that silently stopped opening has to turn this
 * spec red, and setting the property by hand would step around exactly the thing that broke.
 *
 * Called once per page load, never twice — a second click would fold the panel away again. Every
 * caller below does `page.goto("/kunden/neu")` first, and the wait on `#archiveLastName` is what
 * says the panel opened rather than the fill merely finding it.
 */
async function searchArchive(page: Page, lastName: string): Promise<void> {
  await page.getByTestId("archive-search-open").click();
  await expect(page.locator("#archiveLastName")).toBeVisible();

  await page.locator("#archiveLastName").fill(lastName);
  await page.getByTestId("archive-search-submit").click();
}

/**
 * Take the data from one result row, and wait until the form actually holds it.
 *
 * The wait is not politeness: applying a pre-fill **remounts the form**, so every field is a new DOM
 * node. Typing into the old one — the certificate, which is the one thing that has to be typed —
 * would fill a node that is about to be thrown away, and the registration would be submitted without
 * it. The banner appears with the remounted form, so it is the signal that the fields on screen are
 * the ones the submit will read.
 */
async function selectMatch(page: Page, customerId: number): Promise<void> {
  await page.getByTestId(`archive-select-${customerId}`).click();
  await expect(page.getByTestId("archive-prefill-notice")).toBeVisible();
}

/** One result row, addressed by the record it stands for rather than by its position in the list. */
function matchRow(page: Page, customerId: number): Locator {
  return page.locator(`[data-testid="archive-match"][data-customer-id="${customerId}"]`);
}

const words = de.customers.archiveSearch;

test.describe.configure({ mode: "serial" });

test.describe("Wiederaufnahme aus dem Archiv", () => {
  /** The household that leaves and comes back — registered, served and archived in the first test. */
  let returning: Household;
  /** The household given their number in the meantime: same surname, and still active. */
  let successor: Household;
  /** Everything the archived record was worth the moment before it was copied from. */
  let archived: string;
  /** The record the re-registration created — a second one for the same people. */
  let reregisteredId: number;
  /** The number that record was given, read off the proposal rather than assumed. */
  let reregisteredNumber: string;

  /**
   * The one surname both records carry. Drawn here rather than inside `register` so the search can
   * be asked a question with two candidate answers, only one of which is archived.
   */
  const surname = faker.person.lastName();

  test.beforeAll(() => {
    pinToday();
  });

  test.afterAll(async () => {
    // The pinned today goes with the spec: leaving it would freeze January for the settings specs,
    // which save a version stamped *now* and would then assert against the wrong month.
    rmSync(NOW_FILE, { force: true });
    await prisma.$disconnect();
  });

  test("a household is served and archived, so there is something to come back to", async ({
    page,
  }) => {
    returning = await register(page, surname);

    // A hand-out before they leave. It is the history the archived record has to still own after the
    // same people have been registered a second time — the proof that the two records are separate.
    await lookUp(page, returning.customerNumber);
    await expect(page.getByTestId("counter-verdict")).toHaveAttribute(
      "data-verdict",
      "CLEAR_TO_SERVE",
    );
    await page.getByTestId("serve-button").click();
    await expect(page.getByTestId("already-served")).toBeVisible();

    await page.goto(`/kunden/${returning.id}`);
    await page.getByTestId("archive-open").click();
    await page.getByTestId("archive-reason").fill(ARCHIVE_REASON);
    await page.getByTestId("archive-submit").click();
    await expect(page.getByTestId("customer-status")).toHaveText(de.customers.status.ARCHIVED);

    archived = await belongings(returning.id);
    expect(await prisma.distributionRecord.count({ where: { customerId: returning.id } })).toBe(1);
  });

  test("their number is handed to somebody else before they come back", async ({ page }) => {
    // Archiving freed the number, so it is the lowest free one again and the next registration is
    // offered it. That is what makes the re-registration below an honest test: the old number is
    // gone, and a path that tried to restore it would have to collide with an active household.
    await page.goto("/kunden/neu");
    await expect(page.getByTestId("customer-number-select")).toHaveValue(returning.customerNumber);

    successor = await register(page, surname);
    expect(successor.customerNumber).toBe(returning.customerNumber);
    expect(successor.id).not.toBe(returning.id);
    // The number is reusable, the card number is not: the returning household is still carrying
    // `k1`, so the successor is handed `k2` (US-25).
    await expect(page.getByTestId("card-number")).toHaveText(`${successor.customerNumber}k2`);
  });

  test("the archive search finds only the archived household of that name", async ({ page }) => {
    await page.goto("/kunden/neu");

    // Typed in capitals: the search reads the folded key written beside the name, not the name as it
    // was stored, so how staff happen to type it cannot decide whether the household is found.
    await searchArchive(page, surname.toUpperCase());

    const row = matchRow(page, returning.id);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("archive-match-name")).toHaveText(
      `${returning.applicant.firstName} ${returning.applicant.lastName}`,
    );
    await expect(row.getByTestId("archive-match-household-size")).toHaveText(
      words.result.householdSize(2),
    );
    await expect(row.getByTestId("archive-match-reason")).toHaveText(ARCHIVE_REASON);
    // Shown for recognition, and only that: the number is free again and, as this spec has just
    // arranged, already someone else's (FR-3).
    await expect(row.getByTestId("archive-match-former-number")).toHaveText(
      returning.customerNumber,
    );

    // FR-6, asserted where it can actually go wrong: the household who holds that number *now* has
    // the same surname and is active, so only the archive filter keeps them out of this list.
    await expect(matchRow(page, successor.id)).toHaveCount(0);
  });

  test("selecting the match pre-fills the form and the pre-fill can be dropped", async ({
    page,
  }) => {
    await page.goto("/kunden/neu");
    const offered = await page.getByTestId("customer-number-select").inputValue();
    expect(offered).not.toBe(returning.customerNumber);

    await searchArchive(page, surname);
    await selectMatch(page, returning.id);

    // Read before the form is: this is a new registration, not a reactivation (PRD §6).
    await expect(page.getByTestId("archive-prefill-detail")).toHaveText(
      words.prefilled.detail(
        `${returning.applicant.firstName} ${returning.applicant.lastName}`,
        Number(returning.customerNumber),
        TODAYS_DATE,
      ),
    );

    await expect(page.locator("#firstName")).toHaveValue(returning.applicant.firstName);
    await expect(page.locator("#lastName")).toHaveValue(returning.applicant.lastName);
    await expect(page.locator("#birthDate")).toHaveValue(typedDay(GROWN_UP_BIRTH_DATE));
    await expect(page.locator("#street")).toHaveValue(returning.address.street);
    await expect(page.locator("#houseNumber")).toHaveValue(returning.address.houseNumber);
    await expect(page.locator("#zip")).toHaveValue(returning.address.zip);
    await expect(page.locator("#city")).toHaveValue(returning.address.city);

    // The whole household, in the order the archived record listed it — nobody retyped.
    await expect(page.getByTestId("household-row")).toHaveCount(2);
    await expect(page.locator("#memberFirstName-0")).toHaveValue(returning.applicant.firstName);
    await expect(page.locator("#memberBirthDate-0")).toHaveValue(typedDay(GROWN_UP_BIRTH_DATE));
    await expect(page.locator("#memberFirstName-1")).toHaveValue(returning.child.firstName);
    await expect(page.locator("#memberBirthDate-1")).toHaveValue(typedDay(CHILD_BIRTH_DATE));
    await expect(page.getByTestId("grown-ups")).toHaveText("1");
    await expect(page.getByTestId("children")).toHaveText("1");

    // What is decided afresh did not come with it: the certificate is the paper the applicant holds
    // *today*, and the number on offer is the allocator's, not the one they used to have.
    await expect(page.locator("#certificateType")).toHaveValue("");
    await expect(page.locator("#certificateValidUntil")).toHaveValue("");
    await expect(page.getByTestId("customer-number-select")).toHaveValue(offered);

    // Every pre-filled field is a field, not a display: a household that has moved is typed over.
    await page.locator("#city").fill("Delbrück");
    await expect(page.locator("#city")).toHaveValue("Delbrück");

    // And the whole pre-fill can be dropped — including the edit just made, because half a household
    // left behind from the wrong record is the one thing "leer beginnen" must not mean.
    await page.getByTestId("archive-prefill-clear").click();
    await expect(page.getByTestId("archive-prefill-notice")).toHaveCount(0);
    await expect(page.locator("#firstName")).toHaveValue("");
    await expect(page.locator("#city")).toHaveValue("");
    await expect(page.getByTestId("household-row")).toHaveCount(1);
  });

  test("re-registering gives them a new number, a fresh card and no reminders", async ({
    page,
  }) => {
    await page.goto("/kunden/neu");
    reregisteredNumber = await page.getByTestId("customer-number-select").inputValue();
    expect(reregisteredNumber).not.toBe(returning.customerNumber);

    await searchArchive(page, surname);
    await selectMatch(page, returning.id);

    // The one thing that has to be typed: the certificate they present today.
    await page.locator("#certificateType").fill(RETURNING_CERTIFICATE_TYPE);
    await fillDay(page.locator("#certificateValidUntil"), CERTIFICATE_VALID_UNTIL);

    await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();
    await page.waitForURL(/\/kunden\/\d+(\?|$)/);

    reregisteredId = Number(new URL(page.url()).pathname.split("/").at(-1));
    expect(reregisteredId).not.toBe(returning.id);

    await expect(page.getByTestId("customer-number")).toHaveText(String(reregisteredNumber));
    await expect(page.getByTestId("card-number")).toHaveText(`${reregisteredNumber}k1`);
    await expect(page.getByTestId("customer-status")).toHaveText(de.customers.status.ACTIVE);
    await expect(page.getByTestId("reminder-count")).toHaveText("0");

    // The household came across whole, and the counts are derived from it again on this request.
    await expect(page.getByTestId("household-member")).toHaveCount(2);
    await expect(page.getByTestId("grown-ups")).toHaveText("1");
    await expect(page.getByTestId("children")).toHaveText("1");
    // The record's household is an editable set of rows now (US-16.5), so the child's name is a
    // field value rather than page text — asserted on the row, not on the prose.
    await expect(page.locator('input[name="memberFirstName"]').nth(1)).toHaveValue(
      returning.child.firstName,
    );

    const record = await prisma.customer.findUniqueOrThrow({
      where: { id: reregisteredId },
      select: { previousCustomerId: true, reminderCount: true },
    });
    // Display metadata and nothing more: it is how a later screen can say why two records name the
    // same people, and no rule above reads it — every number, card and count on this page was
    // decided as if these people had walked in for the first time.
    expect(record.previousCustomerId).toBe(returning.id);
    expect(record.reminderCount).toBe(0);
    expect(await prisma.distributionRecord.count({ where: { customerId: reregisteredId } })).toBe(
      0,
    );
  });

  test("the archived record is still there, untouched, with its own history", async ({ page }) => {
    // FR-5 in one equality: status, number, household, certificate, cards and hand-outs, compared
    // against the snapshot taken before the re-registration ever read the record.
    expect(await belongings(returning.id)).toBe(archived);
    expect(await prisma.distributionRecord.count({ where: { customerId: returning.id } })).toBe(1);

    await page.goto(`/kunden/${returning.id}`);
    await expect(page.getByRole("main")).toContainText(returning.applicant.firstName);
    await expect(page.getByTestId("customer-status")).toHaveText(de.customers.status.ARCHIVED);
    await expect(page.getByTestId("archived-banner")).toBeVisible();
    await expect(page.getByTestId("archived-reason")).toHaveText(
      de.customers.archive.bannerDetail(TODAYS_DATE, ARCHIVE_REASON),
    );

    // Two records for one household, and the certificate proves which is which: the archived one
    // still holds the paper it was registered with, the new one the paper presented today.
    await page.goto(`/kunden/${reregisteredId}`);
    await expect(page.getByRole("main")).toContainText(RETURNING_CERTIFICATE_TYPE);
    await expect(page.getByTestId("customer-number")).toHaveText(String(reregisteredNumber));
  });
});
