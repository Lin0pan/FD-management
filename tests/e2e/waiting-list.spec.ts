import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { de } from "@/i18n/de";

/**
 * The waiting list from a full register to a promoted applicant, driven through the built app
 * (tasks/prd-us-12-waiting-list.md §US-12.5).
 *
 * Every part of the chain is already proved on its own: `inArrivalOrder` orders the queue in the
 * domain gate, `registerFromWaitingList` registers before it removes against fakes, and the adapter
 * stamps a removal rather than deleting it against a throwaway SQLite file. What none of them can
 * see is the sentence FD actually cares about — *the register filled up, an applicant was put on a
 * list instead of being turned away, and when a slot came back it went to whoever had waited
 * longest.* That is four screens and three features (US-01, US-10, US-14) agreeing with one another,
 * so it is driven end to end.
 *
 * This is the one spec that runs in the **`isolated` project** (`playwright.config.ts`): its own
 * server, its own empty database. It has to, because it makes the register *full*, and the quota is
 * a single global number — on the shared database the other specs hold customer numbers in the
 * hundreds, so no quota this spec could set would leave the register with nothing free. Owning an
 * empty register is also what lets the quota be a plain 2 instead of an arithmetic expression: with
 * two slots and two households in them, "voll" means what it says.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. The dates
// stay literals, because eligibility and the household split are decided by dates.
faker.seed(20260727);

/** The register this spec works in: two slots, and no more. */
const QUOTA = 2;

/** Born well before 13 years ago: a grown-up whichever day this spec is run. */
const GROWN_UP_BIRTH_DATE = "1979-11-23";
/** Comfortably in the future, so nobody here is refused for a lapsed certificate. */
const CERTIFICATE_VALID_UNTIL = "2028-05-31";
const CERTIFICATE_TYPE = "Jobcenter-Bescheid";

/** Why the household that frees the slot is archived — an archive's only record. */
const ARCHIVE_REASON = "Umgezogen, telefonisch abgemeldet.";

/** Why the second applicant comes off the list at the end — kept on the row, never deleted. */
const REMOVAL_REASON = "Zurückgezogen, hat andere Unterstützung gefunden.";

/**
 * The database the isolated server is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is spelled out. It is absolute because a relative SQLite url resolves against the schema
 * directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve("data/e2e-isolated.db")}` });

/**
 * The customers who hold a number right now — the same rows the quota is checked against.
 *
 * `{ status: { not: "ARCHIVED" } }` is `ON_REGISTER` in the Prisma adapter, spelled out here rather
 * than imported: this spec asks the database the question the screens ask, and an import would make
 * the two agree by construction instead of by fact.
 */
function countOnRegister(): Promise<number> {
  return prisma.customer.count({ where: { status: { not: "ARCHIVED" } } });
}

/** A household as the form left it: the number on their card and the id their record lives at. */
interface Household {
  readonly id: number;
  readonly customerNumber: string;
}

/** An applicant as they were typed into the waiting-list form. */
interface Applicant {
  readonly firstName: string;
  readonly lastName: string;
}

function applicant(): Applicant {
  return { firstName: faker.person.firstName(), lastName: faker.person.lastName() };
}

function fullName(person: Applicant): string {
  return `${person.firstName} ${person.lastName}`;
}

/** Fill the personal half of a registration or an application — the two forms ask for it alike. */
async function fillPersonalData(page: Page, person: Applicant): Promise<void> {
  await page.locator("#firstName").fill(person.firstName);
  await page.locator("#lastName").fill(person.lastName);
  await page.locator("#birthDate").fill(GROWN_UP_BIRTH_DATE);
  await page.locator("#street").fill(faker.location.street());
  await page.locator("#houseNumber").fill(faker.location.buildingNumber());
  await page.locator("#zip").fill(faker.location.zipCode("#####"));
  await page.locator("#city").fill(faker.location.city());
  await page.locator("#certificateType").fill(CERTIFICATE_TYPE);
  await page.locator("#certificateValidUntil").fill(CERTIFICATE_VALID_UNTIL);
}

/**
 * Register a one-person household through the real form and return what it was given.
 *
 * The number is read off the proposal rather than named: on a serial run it is the number the save
 * assigns, and reading it is how the spec stays true if the allocator is ever asked a new question.
 */
async function register(page: Page): Promise<Household> {
  await page.goto("/kunden/neu");
  const customerNumber = await page.getByTestId("customer-number-select").inputValue();

  await fillPersonalData(page, applicant());
  // The applicant mirrors into the first household row, so a one-person household is already there.
  await expect(page.getByTestId("household-row")).toHaveCount(1);

  await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();
  await page.waitForURL(/\/kunden\/\d+(\?|$)/);

  const id = Number(new URL(page.url()).pathname.split("/").at(-1));
  expect(Number.isInteger(id)).toBe(true);
  // The card names the slot, and the index is deliberately not pinned here: it counts the slot's
  // whole run rather than this household's, so a registration onto a released number is not `k1`
  // (US-25). The promotion below asserts the index, because it knows the run.
  await expect(page.getByTestId("card-number")).toHaveText(new RegExp(`^${customerNumber}k\\d+$`));

  return { id, customerNumber };
}

/**
 * Put one applicant on the waiting list through the real form.
 *
 * The confirmation is waited for rather than the row appearing, because the form clears itself by
 * remounting on the saved count: typing the next applicant before the remount would fill fields that
 * are about to be thrown away with it.
 */
async function addToWaitingList(page: Page, person: Applicant): Promise<void> {
  await page.goto("/warteliste");
  await fillPersonalData(page, person);
  await page.getByTestId("waiting-list-add-submit").click();
  await expect(page.getByTestId("waiting-list-add-saved")).toHaveText(
    de.waitingList.add.saved(fullName(person)),
  );
}

test.describe.configure({ mode: "serial" });

test.describe("Warteliste", () => {
  /** The two households that fill the register. The first is the one archived below. */
  let filler: Household;
  /** The applicant who joined first, and therefore the one the freed slot belongs to. */
  const first = applicant();
  /** The applicant behind them, who must still be waiting — and now at the head — at the end. */
  const second = applicant();

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("a third registration into a full register is offered the waiting list", async ({
    page,
  }) => {
    // FD's quota is a settings value like any other, so it is lowered on the screen staff would use
    // rather than in the seed — which is also the only way the number in force is proved to reach
    // the registration form at all.
    await page.goto("/einstellungen");
    await page.locator("#quotaN").fill(String(QUOTA));
    await page.getByRole("button", { name: de.settings.save, exact: true }).click();
    await expect(page.getByTestId("settings-saved")).toHaveText(de.settings.saved);

    // Both slots, filled through the ordinary registration form.
    filler = await register(page);
    const other = await register(page);
    expect([filler.customerNumber, other.customerNumber]).toEqual(["1", "2"]);
    expect(await countOnRegister()).toBe(QUOTA);

    // The third applicant meets a register with nothing left to give: the number dropdown has
    // nothing to offer and is disabled, the limit is named, and the way onto the waiting list is
    // offered right there. It is a link and not a redirect on purpose — the form stays on screen,
    // because the quota may be what should change.
    await page.goto("/kunden/neu");
    await expect(page.getByTestId("customer-number-select")).toBeDisabled();
    await expect(page.getByTestId("customer-number-select").locator("option")).toHaveCount(0);
    await expect(page.getByTestId("registration-error")).toContainText(
      de.customers.errors.noFreeCustomerNumber(QUOTA),
    );

    await page.getByTestId("registration-waiting-list-link").click();
    await page.waitForURL("**/warteliste");
    await expect(
      page.getByRole("heading", { name: de.waitingList.heading, exact: true }),
    ).toBeVisible();
  });

  test("two applicants join the list and stand in the order they arrived", async ({ page }) => {
    await addToWaitingList(page, first);
    await addToWaitingList(page, second);

    const rows = page.getByTestId("waiting-list-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).getByTestId("waiting-list-applicant")).toHaveText(fullName(first));
    await expect(rows.nth(1).getByTestId("waiting-list-applicant")).toHaveText(fullName(second));
    await expect(rows.nth(0).getByTestId("waiting-list-position")).toHaveText(
      `${de.waitingList.position} 1`,
    );
    await expect(rows.nth(0).getByTestId("waiting-list-days")).toHaveText(
      de.waitingList.waitedValue(0),
    );

    // Nothing is free, so nothing is offered: the banner exists to point at a slot, and one that
    // appeared without a slot behind it would send staff to fetch somebody who cannot be registered.
    await expect(page.getByTestId("waiting-list-free-slot")).toHaveCount(0);

    // The hub states the queue's length either way (US-18.1) — a queue that cannot be served yet is
    // still a queue — and marks it as *not* servable. This is the only spec that can make that
    // assertion: the register has to be full for the badge to be neutral while somebody waits, and
    // filling it is what the isolated project is for.
    await page.goto("/kunden");
    const badge = page.getByTestId("waiting-list-badge");
    await expect(badge).toHaveText(de.customerList.actions.waitingListBadge(2, false));
    await expect(badge).toHaveAttribute("data-free-slot", "false");
  });

  test("archiving a household frees a number and the banner names the longest wait", async ({
    page,
  }) => {
    await page.goto(`/kunden/${filler.id}`);
    await page.getByTestId("archive-open").click();
    await page.getByTestId("archive-reason").fill(ARCHIVE_REASON);
    await page.getByTestId("archive-submit").click();
    await expect(page.getByTestId("customer-status")).toHaveText(de.customers.status.ARCHIVED);

    // The number the archived household gave up is free again, and it is offered to the applicant
    // who has waited longest — not to whoever walks in next.
    const names = de.waitingList.banner.names(fullName(first), Number(filler.customerNumber));

    await page.goto("/warteliste");
    await expect(page.getByTestId("waiting-list-free-slot-detail")).toHaveText(names);

    // And on the screen where that number is actually handed out (US-18.3): the staff member about
    // to take a walk-in on is told, before the first field is typed, that somebody has been waiting
    // for exactly this number. It states a fact and gates nothing — the proposal is on screen
    // beneath it, so a walk-in may still be registered. FD decide who is served, not the software.
    await page.goto("/kunden/neu");
    await expect(page.getByTestId("waiting-list-free-slot-detail")).toHaveText(names);
    await expect(page.getByTestId("customer-number-select")).toHaveValue(filler.customerNumber);

    // The hub carries no banner any more, in any state (FR-1): it named one applicant and one number
    // above the register staff came for, and that decision now stands where it is made. What is left
    // there is the count, marked servable in words as well as in colour (US-18.2).
    await page.goto("/kunden");
    await expect(page.getByTestId("waiting-list-free-slot")).toHaveCount(0);
    const badge = page.getByTestId("waiting-list-badge");
    await expect(badge).toHaveText(de.customerList.actions.waitingListBadge(2, true));
    await expect(badge).toHaveAttribute("data-free-slot", "true");
  });

  test("promoting the applicant hands them the freed number and takes them off the list", async ({
    page,
  }) => {
    await page.goto("/warteliste");
    await page.getByTestId("waiting-list-promote").click();

    // The form arrives filled in from the entry — nothing has to be retyped, and nothing is decided
    // here that the application already answered.
    await expect(page.getByTestId("promotion-intro")).toContainText(fullName(first));
    await expect(page.locator("#lastName")).toHaveValue(first.lastName);
    await expect(page.locator("#certificateType")).toHaveValue(CERTIFICATE_TYPE);
    // The draft holds the applicant alone, so the promoted household is one grown-up and no children.
    await expect(page.getByTestId("household-row")).toHaveCount(1);
    await expect(page.getByTestId("grown-ups")).toHaveText("1");
    await expect(page.getByTestId("children")).toHaveText("0");

    await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();
    await page.waitForURL(/\/kunden\/\d+(\?|$)/);

    // They were given the number the archived household released, and the next card on it: the
    // filler walked away holding `k1`, so the promotion continues the slot's run at `k2` (US-25).
    // The promotion inherits that from `registerCustomer` and has no rule of its own.
    await expect(page.getByTestId("customer-number")).toHaveText(String(filler.customerNumber));
    await expect(page.getByTestId("card-number")).toHaveText(`${filler.customerNumber}k2`);
    await expect(page.getByRole("main")).toContainText(fullName(first));

    // A promotion is a registration, so it confirms like one: the same sentence the registration
    // screen's own path leaves on the record, from the same flag on the same redirect.
    await expect(page.getByTestId("registration-confirmation")).toHaveText(de.customers.new.saved);

    // Off the list, but not gone from it (FR-7): the row is stamped with the slot it went to, so the
    // order in which the queue was served stays reconstructable years later.
    expect(await prisma.waitingListEntry.count()).toBe(2);
    const promoted = await prisma.waitingListEntry.findFirstOrThrow({
      where: { firstName: first.firstName, lastName: first.lastName },
    });
    expect(promoted.removedOn).not.toBeNull();
    expect(promoted.removalReason).toBe(`customerNumber=${filler.customerNumber}`);
  });

  test("the applicant behind them is now at the head of the list", async ({ page }) => {
    await page.goto("/warteliste");

    const rows = page.getByTestId("waiting-list-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0).getByTestId("waiting-list-position")).toHaveText(
      `${de.waitingList.position} 1`,
    );
    await expect(rows.nth(0).getByTestId("waiting-list-applicant")).toHaveText(fullName(second));

    // The register is full again, so they wait on — with the place they queued for, and no banner
    // promising a slot that does not exist.
    expect(await countOnRegister()).toBe(QUOTA);
    await expect(page.getByTestId("waiting-list-free-slot")).toHaveCount(0);
  });

  test("taking an applicant off the list says so, on the list they have left", async ({ page }) => {
    await page.goto("/warteliste");
    await expect(page.getByTestId("waiting-list-row")).toHaveCount(1);

    await page.getByTestId("waiting-list-remove-open").click();
    await expect(page.getByTestId("waiting-list-remove-confirm")).toHaveText(
      de.waitingList.remove.confirm(fullName(second)),
    );
    await page.getByTestId("waiting-list-remove-reason").fill(REMOVAL_REASON);
    await page.getByTestId("waiting-list-remove-submit").click();

    // The row and the control that removed it both go, so the answer cannot stand beside the button:
    // the removal redirects and the list itself states it. Until it did, the only evidence a removal
    // had happened was a row missing from a list nobody was looking at.
    await expect(page).toHaveURL(/\/warteliste\?entfernt=1$/);
    await expect(page.getByTestId("waiting-list-remove-saved")).toHaveText(
      de.waitingList.remove.saved,
    );
    await expect(page.getByTestId("waiting-list-row")).toHaveCount(0);

    // Kept, not deleted (FR-7): the row carries the reason it went, which is what keeps the order the
    // queue was served in reconstructable.
    const removed = await prisma.waitingListEntry.findFirstOrThrow({
      where: { firstName: second.firstName, lastName: second.lastName },
    });
    expect(removed.removedOn).not.toBeNull();
    expect(removed.removalReason).toBe(REMOVAL_REASON);
  });
});
