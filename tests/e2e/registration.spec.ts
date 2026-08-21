import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { foldName } from "@/domain/customer/nameSearch";
import { de } from "@/i18n/de";
import { SHARED } from "./registers";
import { typedDay } from "./day";

/**
 * Registering a customer, driven through the built app
 * (tasks/prd-us-01-register-customer.md §US-01.7, tasks/prd-us-24-choose-customer-number.md
 * §US-024.5).
 *
 * This is the only proof that the whole chain holds together — form, server action,
 * `registerCustomer`, the Prisma adapter and the partial unique index on the customer number. The
 * unit gates cover each of those in isolation; what they cannot see is a customer number that never
 * reaches the card, or a rejection that quietly wrote half a household.
 *
 * Since US-24 the number is a *choice*, and the whole feature is the difference between the number
 * the form offered and the number the database stored — a difference no layer below the browser can
 * be asked about. So the second half of this file is about the dropdown: what it opens on, what it
 * offers, that a number picked out of it is the number saved, and that a number posted around it is
 * refused without writing anything.
 *
 * The specs run **serially against one shared database** (`data/e2e.db`, deleted and re-seeded
 * before the server boots): they share the customer-number sequence with every other spec file, so
 * nothing here names a customer number outright. The happy path reads the one the form proposes, the
 * rejection spec asserts that the same number is still free afterwards, and the pool specs seed
 * {@link NUMBERS} — a band of their own — and read the ends of the register out of Prisma.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every date
// here stays a literal, because the rules under test are about dates.
faker.seed(20260722);

/** Born well before 13 years ago: a grown-up whichever day this spec is run. */
const GROWN_UP_BIRTH_DATE = "1988-04-17";
/** Born comfortably inside the last 13 years: a child until 2033. */
const CHILD_BIRTH_DATE = "2020-06-15";
const CERTIFICATE_VALID_UNTIL = "2027-03-31";

/**
 * The three numbers the dropdown specs own.
 *
 * High, and clear of the low sequence the registration, archive, card and re-registration specs
 * consume — but **inside the quota of 240**, which is what makes this band different from the ones
 * the other specs took (241 upwards). The pool the control offers is `1..quotaN`, so a household
 * seeded above the quota is invisible to it: a number nobody may pick could not prove that a taken
 * number is kept out of the list, because it was never in it. 232–234 are free of every band listed
 * in `scripts/ralph/progress.txt` — counter (201–206, 239), portions (211), serve (221–222) and
 * reminders (231) are the only ones below 240.
 */
const NUMBERS = {
  /** Held by an active household: never an option, and the number the stale form posts. */
  taken: 232,
  /** Held by an archived household: the slot came back, so it *is* an option. */
  released: 233,
  /** Free, and the one the choice spec picks instead of the number the form opened on. */
  chosen: 234,
} as const;

/** Certificates for the seeded households: valid long past any day this suite could run. */
const SEEDED_CERTIFICATE_VALID_UNTIL = "2027-06-30";
/** When the seeded households were taken on, and when the archived one gave its number back. */
const SEEDED_ISSUED_AT = "2025-01-02T00:00:00.000Z";
const SEEDED_ARCHIVED_AT = "2025-11-03T10:00:00.000Z";

/**
 * The database the built app is running against — the same file, opened a second time.
 *
 * `playwright.config.ts` sets `DATABASE_URL` for the *server*; this process never had one, so the
 * path is taken from `registers.ts` — the one place that knows which engine this run drives, and
 * therefore which register is behind it. It is resolved to an absolute path because a relative
 * SQLite url resolves against the schema directory, not the working directory.
 */
const prisma = new PrismaClient({ datasourceUrl: `file:${resolve(SHARED.database)}` });

interface Person {
  readonly firstName: string;
  readonly lastName: string;
}

function person(lastName: string): Person {
  return { firstName: faker.person.firstName(), lastName };
}

/** Fill everything except the household — the part every spec here needs the same way. */
async function fillPersonalData(page: Page, applicant: Person): Promise<void> {
  await page.locator("#firstName").fill(applicant.firstName);
  await page.locator("#lastName").fill(applicant.lastName);
  await page.locator("#birthDate").fill(typedDay(GROWN_UP_BIRTH_DATE));
  await page.locator("#street").fill(faker.location.street());
  await page.locator("#houseNumber").fill(faker.location.buildingNumber());
  await page.locator("#zip").fill(faker.location.zipCode("#####"));
  await page.locator("#city").fill(faker.location.city());
  await page.locator("#certificateType").fill("Jobcenter-Bescheid");
  await page.locator("#certificateValidUntil").fill(typedDay(CERTIFICATE_VALID_UNTIL));
}

/**
 * Put one household on a number of this spec's own, straight through Prisma.
 *
 * Through the database rather than through the form because what is under test is the *pool*, not
 * the intake: registering two more households on the screen would prove US-01 again and could not
 * put anybody on a number of my choosing anyway — the form allocates the lowest free one unless
 * somebody picks, which is the very thing being set up here.
 *
 * An archived row is seeded as archived rather than archived through the app: `archive.spec.ts`
 * drives that flow, and what this spec needs is only the state it leaves behind — a household that
 * kept its number as history and gave up the slot.
 */
async function seedHousehold(customerNumber: number, status: "ACTIVE" | "ARCHIVED"): Promise<void> {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const birthDate = new Date(`${GROWN_UP_BIRTH_DATE}T00:00:00.000Z`);
  const archived = status === "ARCHIVED";

  await prisma.customer.create({
    data: {
      customerNumber,
      firstName,
      lastName,
      // Written beside the names they come from: a row seeded without them is a household the
      // customer list could never find.
      firstNameFolded: foldName(firstName),
      lastNameFolded: foldName(lastName),
      birthDate,
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      group: "RED",
      status,
      blockReason: null,
      archiveReason: archived ? "Umgezogen, telefonisch abgemeldet." : null,
      archivedAt: archived ? new Date(SEEDED_ARCHIVED_AT) : null,
      reminderCount: 0,
      notes: "",
      householdMembers: { create: [{ firstName, lastName, birthDate }] },
      certificates: {
        create: {
          type: "Jobcenter-Bescheid",
          validUntil: new Date(`${SEEDED_CERTIFICATE_VALID_UNTIL}T00:00:00.000Z`),
          recordedAt: new Date(SEEDED_ISSUED_AT),
        },
      },
      cards: {
        // The printed counts match the household exactly, so neither card is due for reissue
        // (US-13) and this spec leaves the home screen's badge where it found it.
        create: {
          customerNumber,
          index: 1,
          issuedAt: new Date(SEEDED_ISSUED_AT),
          reason: "FIRST_ISSUE",
          grownUpsAtIssue: 1,
          childrenAtIssue: 0,
          groupAtIssue: "RED",
        },
      },
    },
  });
}

/**
 * The lowest free number, as the *database* has it at this moment.
 *
 * Worked out here rather than imported from `src/domain/customer/customerNumber.ts`: the claim is
 * that the control opens on the number the register implies, and computing the expectation with the
 * very function under the screen would make the assertion agree with itself. It is the same two
 * facts the repository reads — every number a non-archived household holds (a blocked one still
 * occupies its slot; only archiving releases it) and the quota in force — and it has to be read at
 * assertion time, because the specs before this file in the alphabet have all moved it.
 */
async function lowestFreeNumber(): Promise<number> {
  const [settings, holders] = await Promise.all([
    prisma.settingsVersion.findFirstOrThrow({ orderBy: [{ recordedAt: "desc" }, { id: "desc" }] }),
    prisma.customer.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { customerNumber: true },
    }),
  ]);
  const taken = new Set(holders.map((holder) => holder.customerNumber));

  for (let candidate = 1; candidate <= settings.quotaN; candidate += 1) {
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  throw new Error(`The shared e2e register is full at a quota of ${settings.quotaN}.`);
}

/**
 * Everything a refused registration must leave exactly as it found it.
 *
 * The customers are listed rather than counted, because the failure worth catching is not only a
 * household that got written but one whose number, group or status moved on the way through. The
 * four child tables are counted: a registration writes a member row, a certificate, a card and an
 * audit entry, so a half-finished one shows up here even when no customer row survived it.
 */
async function registerSnapshot(): Promise<string> {
  const [customers, members, certificates, cards, auditEntries] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { id: "asc" },
      select: { id: true, customerNumber: true, status: true, group: true },
    }),
    prisma.householdMember.count(),
    prisma.certificate.count(),
    prisma.card.count(),
    prisma.auditEntry.count(),
  ]);
  return JSON.stringify({ customers, members, certificates, cards, auditEntries });
}

/** One `<option>` of the number control, addressed by the number it carries. */
function option(page: Page, customerNumber: number): Locator {
  return page.locator(`#customerNumber option[value="${customerNumber}"]`);
}

test.describe.configure({ mode: "serial" });

test.describe("Kundenaufnahme", () => {
  /** The number the happy path consumed, so the rejection spec can name its successor. */
  let registeredNumber: string;

  test.beforeAll(async () => {
    // Seeded before the first spec rather than before the dropdown ones: both numbers are far above
    // anything the three intake specs below consume, so the register they see is unchanged, and a
    // seed that runs once cannot be half-applied by a spec that failed.
    await seedHousehold(NUMBERS.taken, "ACTIVE");
    await seedHousehold(NUMBERS.released, "ARCHIVED");
  });

  test.afterAll(async () => {
    // The households stay: they are the register, and the specs that follow this file read deltas
    // against whatever it left behind. Only the second connection to the file is given up.
    await prisma.$disconnect();
  });

  /**
   * The regression DF reported from Safari, and the reason a day is no longer `<input type="date">`
   * (ADR-013).
   *
   * It is deliberately **typed**, not filled. Every other date in this suite goes in through
   * `fill()`, which assigns the value straight onto the element — and against the native date widget
   * that was the whole problem: it bypassed the segment editor, so 144 green specs said nothing
   * about the path a human uses, and WebKit could not even be made to type into it. A text field has
   * no such gap. What `pressSequentially` puts in is what DF put in, in either engine.
   *
   * `15.03.1985` is not an arbitrary date. Typed into a US-ordered widget it was read as month 15,
   * which Chromium silently clamped to December — `1985-12-03`, a valid birthdate nobody entered,
   * and one that would move a household's portions and price without anything reporting it.
   */
  test("a birthdate is typed as TT.MM.JJJJ, and the day DF type is the day they get", async ({
    page,
  }) => {
    await page.goto("/kunden/neu");

    const birthDate = page.locator("#birthDate");
    await birthDate.click();
    await birthDate.pressSequentially("15031985");

    // The dots are the field's doing: eight digits go in, a written day comes out.
    await expect(birthDate).toHaveValue("15.03.1985");

    // And it is read as March, not clamped into December. The derived panel is the proof, because
    // it counts the applicant only once their birthdate parses.
    await expect(page.getByTestId("grown-ups")).toHaveText("1");
  });

  test("a day that is not a day is refused rather than guessed at", async ({ page }) => {
    await page.goto("/kunden/neu");

    const birthDate = page.locator("#birthDate");
    await birthDate.click();
    // Month 15 — the value the old widget invented a December from.
    await birthDate.pressSequentially("03151985");
    await expect(birthDate).toHaveValue("03.15.1985");

    // Nothing is derived from a day that cannot be read; the panel shows its empty mark rather than
    // a figure computed from a date nobody typed.
    await expect(page.getByTestId("grown-ups")).toHaveText("—");
  });

  test("a two-person household is registered with a number, a card and derived counts", async ({
    page,
  }) => {
    const lastName = faker.person.lastName();
    const applicant = person(lastName);
    const child = person(lastName);

    await page.goto("/kunden/neu");

    // The number is a proposal, not a reservation — but on a serial run it is the number the save
    // will actually assign, so the card can be predicted from it.
    const proposedNumber = await page.getByTestId("customer-number-select").inputValue();
    registeredNumber = proposedNumber;

    await fillPersonalData(page, applicant);

    // The applicant counts as a household member themselves: the first row mirrors the personal
    // data, so only the child has to be added by hand.
    await expect(page.getByTestId("household-row")).toHaveCount(1);
    await expect(page.locator("#memberFirstName-0")).toHaveValue(applicant.firstName);

    await page.getByTestId("add-member").click();
    await page.locator("#memberFirstName-1").fill(child.firstName);
    await page.locator("#memberLastName-1").fill(child.lastName);
    await page.locator("#memberBirthDate-1").fill(typedDay(CHILD_BIRTH_DATE));

    // The counts are derived as staff type — there is no input for them.
    await expect(page.getByTestId("grown-ups")).toHaveText("1");
    await expect(page.getByTestId("children")).toHaveText("1");

    await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();

    // Success is a redirect to the card that was just issued.
    await page.waitForURL(/\/kunden\/\d+(\?|$)/);

    await expect(page.getByTestId("customer-number")).toHaveText(String(proposedNumber));
    await expect(page.getByTestId("card-number")).toHaveText(`${proposedNumber}k1`);
    await expect(page.getByTestId("customer-status")).toHaveText(de.customers.status.ACTIVE);

    // The same counts, derived again from the stored birthdates rather than carried over.
    await expect(page.getByTestId("grown-ups")).toHaveText("1");
    await expect(page.getByTestId("children")).toHaveText("1");
    await expect(page.getByTestId("household-member")).toHaveCount(2);
  });

  test("an empty household is refused in German and nothing is written", async ({ page }) => {
    await page.goto("/kunden/neu");

    // The number the previous registration left free — its successor, because that one is now
    // taken. It has to still be free after the rejection.
    const proposedNumber = await page.getByTestId("customer-number-select").inputValue();
    expect(proposedNumber).toBe(String(Number(registeredNumber) + 1));

    await fillPersonalData(page, person(faker.person.lastName()));

    // Removing the mirrored row leaves a household with nobody in it — the one thing a customer
    // record cannot be, since the applicant themselves is always a member.
    await page.getByTestId("remove-member-0").click();
    await expect(page.getByTestId("household-row")).toHaveCount(0);

    await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();

    await expect(page.getByTestId("registration-error")).toHaveText(
      de.customers.errors.emptyHousehold,
    );
    // Still on the form: no customer was created, so there is no card to redirect to.
    await expect(page).toHaveURL(/\/kunden\/neu$/);

    // Nothing was written, and no customer number was consumed on the way.
    await page.goto("/kunden/neu");
    await expect(page.getByTestId("customer-number-select")).toHaveValue(proposedNumber);
  });

  // Last in the file on purpose: it registers a household of its own, and the rejection above
  // asserts the next free number against the *first* registration. Anything that consumes a number
  // between the two rewrites that arithmetic.
  test("confirms the registration on the record it lands on, and only on the way in", async ({
    page,
  }) => {
    await page.goto("/kunden/neu");
    await fillPersonalData(page, person(faker.person.lastName()));
    await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();
    await page.waitForURL(/\/kunden\/\d+(\?|$)/);

    // The action never returns on success — it redirects — so this sentence is the only thing that
    // tells a staff member the household was taken on rather than merely displayed.
    await expect(page.getByTestId("registration-confirmation")).toHaveText(de.customers.new.saved);
    await expect(page.getByTestId("registration-confirmation")).toBeInViewport();

    // It belongs to the arrival, not to the record: the same record opened from the list — which is
    // how it is reached every day after the first minute — says nothing.
    await page.goto(new URL(page.url()).pathname);
    await expect(page.getByTestId("registration-confirmation")).toHaveCount(0);
  });

  // The number as a choice (US-24). Everything above this line registers on the number the form
  // opened on, which is what makes it the proof that the default did not move.

  test("the control opens on the lowest free number the register has", async ({ page }) => {
    // Read from the database, not written down: three specs before this one in the alphabet
    // register households, and the two above it in this file do too, so the lowest free number is a
    // fact about the whole run rather than a constant anybody could state here.
    const lowest = await lowestFreeNumber();

    await page.goto("/kunden/neu");

    await expect(page.getByTestId("customer-number-select")).toHaveValue(String(lowest));
    // The preselection is the *first* option and not merely a selected one somewhere in the list:
    // the hint under the control promises staff that the lowest is what they are being offered.
    await expect(page.locator("#customerNumber option").first()).toHaveAttribute(
      "value",
      String(lowest),
    );
  });

  test("a number an active household holds is not offered, and one archiving freed is", async ({
    page,
  }) => {
    await page.goto("/kunden/neu");

    // The two seeded households differ in nothing but their status, so the status is the only thing
    // that can be keeping one number out of the list and letting the other in. This is the rule the
    // register runs on — a number is a slot, and only archiving gives the slot back.
    await expect(option(page, NUMBERS.taken)).toHaveCount(0);
    await expect(option(page, NUMBERS.released)).toHaveCount(1);
  });

  test("the number picked in the dropdown is the number the household gets", async ({ page }) => {
    const applicant = person(faker.person.lastName());

    await page.goto("/kunden/neu");

    // Higher than the one the form opened on — otherwise a save that ignored the choice entirely
    // would pass, which is the failure this whole story exists to prevent.
    const proposedNumber = await page.getByTestId("customer-number-select").inputValue();
    expect(Number(proposedNumber)).toBeLessThan(NUMBERS.chosen);

    await page.getByTestId("customer-number-select").selectOption(String(NUMBERS.chosen));
    await fillPersonalData(page, applicant);
    await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();
    await page.waitForURL(/\/kunden\/\d+(\?|$)/);

    await expect(page.getByTestId("customer-number")).toHaveText(String(NUMBERS.chosen));
    await expect(page.getByTestId("card-number")).toHaveText(`${NUMBERS.chosen}k1`);

    // And in the store, which is the only place the difference between the offered number and the
    // saved one could hide: the record screen renders whatever it was handed.
    const saved = await prisma.customer.findFirstOrThrow({
      where: { customerNumber: NUMBERS.chosen, status: { not: "ARCHIVED" } },
      select: { lastName: true, cards: { select: { index: true } } },
    });
    expect(saved.lastName).toBe(applicant.lastName);
    expect(saved.cards.map((card) => card.index)).toEqual([1]);
  });

  test("a number posted around the control is refused by name and writes nothing", async ({
    page,
  }) => {
    const before = await registerSnapshot();

    await page.goto("/kunden/neu");
    await fillPersonalData(page, person(faker.person.lastName()));

    // A stale form: the number was on offer when the page was rendered and somebody has taken it
    // since. The option is put back by hand because the *server* is what has to refuse it — a
    // control that no longer lists the number cannot prove anything about the rule behind it, and
    // this is exactly the shape a form left open over a distribution day would post.
    await page
      .getByTestId("customer-number-select")
      .evaluate((select: HTMLSelectElement, value: string): void => {
        const stale = document.createElement("option");
        stale.value = value;
        stale.textContent = value;
        select.append(stale);
        select.value = value;
      }, String(NUMBERS.taken));

    await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();

    // The sentence names the number, because "not available" about an unnamed number is advice a
    // staff member cannot act on when the form offers 200 of them.
    await expect(page.getByTestId("registration-error")).toHaveText(
      de.customers.errors.customerNumberUnavailable(NUMBERS.taken),
    );
    await expect(page).toHaveURL(/\/kunden\/neu$/);

    // Not "no customer was created" but "the register is the register it was": a refusal that wrote
    // a household member, a certificate or an audit entry on its way to failing would leave the
    // count of customers untouched and still be a bug.
    expect(await registerSnapshot()).toBe(before);
  });
});
