import { expect, test, type Page } from "@playwright/test";
import { faker } from "@faker-js/faker";
import { de } from "@/i18n/de";

/**
 * Registering a customer, driven through the built app
 * (tasks/prd-us-01-register-customer.md §US-01.7).
 *
 * This is the only proof that the whole chain holds together — form, server action,
 * `registerCustomer`, the Prisma adapter and the partial unique index on the customer number. The
 * unit gates cover each of those in isolation; what they cannot see is a customer number that never
 * reaches the card, or a rejection that quietly wrote half a household.
 *
 * The specs run **serially against one shared database** (`data/e2e.db`, deleted and re-seeded
 * before the server boots): they share the customer-number sequence with every other spec file, so
 * nothing here names a customer number outright. The happy path reads the one the form proposes and
 * the rejection spec asserts that the same number is still free afterwards.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. Every date
// here stays a literal, because the rules under test are about dates.
faker.seed(20260722);

/** Born well before 13 years ago: a grown-up whichever day this spec is run. */
const GROWN_UP_BIRTH_DATE = "1988-04-17";
/** Born comfortably inside the last 13 years: a child until 2033. */
const CHILD_BIRTH_DATE = "2020-06-15";
const CERTIFICATE_VALID_UNTIL = "2027-03-31";

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
  await page.locator("#birthDate").fill(GROWN_UP_BIRTH_DATE);
  await page.locator("#street").fill(faker.location.street());
  await page.locator("#houseNumber").fill(faker.location.buildingNumber());
  await page.locator("#zip").fill(faker.location.zipCode("#####"));
  await page.locator("#city").fill(faker.location.city());
  await page.locator("#certificateType").fill("Jobcenter-Bescheid");
  await page.locator("#certificateValidUntil").fill(CERTIFICATE_VALID_UNTIL);
}

test.describe.configure({ mode: "serial" });

test.describe("Kundenaufnahme", () => {
  /** The number the happy path consumed, so the rejection spec can name its successor. */
  let registeredNumber: string;

  test("a two-person household is registered with a number, a card and derived counts", async ({
    page,
  }) => {
    const lastName = faker.person.lastName();
    const applicant = person(lastName);
    const child = person(lastName);

    await page.goto("/kunden/neu");

    // The number is a proposal, not a reservation — but on a serial run it is the number the save
    // will actually assign, so the card can be predicted from it.
    const proposedNumber = await page.getByTestId("proposed-number").innerText();
    registeredNumber = proposedNumber;

    await fillPersonalData(page, applicant);

    // The applicant counts as a household member themselves: the first row mirrors the personal
    // data, so only the child has to be added by hand.
    await expect(page.getByTestId("household-row")).toHaveCount(1);
    await expect(page.locator("#memberFirstName-0")).toHaveValue(applicant.firstName);

    await page.getByTestId("add-member").click();
    await page.locator("#memberFirstName-1").fill(child.firstName);
    await page.locator("#memberLastName-1").fill(child.lastName);
    await page.locator("#memberBirthDate-1").fill(CHILD_BIRTH_DATE);

    // The counts are derived as staff type — there is no input for them.
    await expect(page.getByTestId("grown-ups")).toHaveText("1");
    await expect(page.getByTestId("children")).toHaveText("1");

    await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();

    // Success is a redirect to the card that was just issued.
    await page.waitForURL(/\/kunden\/\d+$/);

    await expect(page.getByRole("main")).toContainText(
      `${de.customers.fields.customerNumber}: ${proposedNumber}`,
    );
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
    const proposedNumber = await page.getByTestId("proposed-number").innerText();
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
    await expect(page.getByTestId("proposed-number")).toHaveText(proposedNumber);
  });
});
