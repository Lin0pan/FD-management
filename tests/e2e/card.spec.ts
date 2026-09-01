import { expect, test } from "@playwright/test";
import { faker } from "@faker-js/faker";
import { de } from "@/i18n/de";
import { fillDay } from "./day";

/**
 * The card a registration issues, driven through the built app
 * (tasks/prd-us-02-issue-customer-card.md §US-02.5).
 *
 * The unit gates prove that `issueCard` counts on from the highest index the customer number has
 * ever carried and that `readCard` derives the counts from the birthdates. What they cannot see is
 * whether the number the form proposed, the card the registration transaction wrote and the card the
 * view renders are the same card — this spec follows that one household from the empty form to
 * `<number>k1` on screen.
 *
 * It shares `data/e2e.db` and therefore the customer-number sequence with the other specs, so it
 * asserts against the number the screen proposes and never against a literal id.
 */

// A fixed seed so a failure is reproducible; only names and addresses come from Faker. The
// birthdates stay literals, because the counts under test are derived from them.
faker.seed(20260723);

/** Born well before 13 years ago: grown-ups whichever day this spec is run. */
const FIRST_GROWN_UP_BIRTH_DATE = "1985-02-11";
const SECOND_GROWN_UP_BIRTH_DATE = "1987-09-30";
/** Born comfortably inside the last 13 years: a child until 2035. */
const CHILD_BIRTH_DATE = "2022-01-20";
const CERTIFICATE_VALID_UNTIL = "2027-06-30";

test("a registration on an untouched number issues card k1 and the card view shows it", async ({
  page,
}) => {
  const lastName = faker.person.lastName();
  const applicant = { firstName: faker.person.firstName(), lastName };
  const partner = { firstName: faker.person.firstName(), lastName };
  const child = { firstName: faker.person.firstName(), lastName };

  await page.goto("/kunden/neu");

  // The proposal is what the save will actually assign on this serial run, so the card number can
  // be predicted from it — that prediction is half of what this spec is for.
  const proposedNumber = await page.getByTestId("customer-number-select").inputValue();

  await page.locator("#firstName").fill(applicant.firstName);
  await page.locator("#lastName").fill(applicant.lastName);
  await fillDay(page.locator("#birthDate"), FIRST_GROWN_UP_BIRTH_DATE);
  await page.locator("#street").fill(faker.location.street());
  await page.locator("#houseNumber").fill(faker.location.buildingNumber());
  await page.locator("#zip").fill(faker.location.zipCode("#####"));
  await page.locator("#city").fill(faker.location.city());
  await page.locator("#certificateType").fill("Jobcenter-Bescheid");
  await fillDay(page.locator("#certificateValidUntil"), CERTIFICATE_VALID_UNTIL);

  // Chosen by hand rather than accepted from the suggestion, so the card is asserted against the
  // registration input and not against whichever group happened to be smaller. The choice sits
  // behind a `<details>` that starts closed (US-20.2): a radio inside a closed disclosure has no
  // bounding box, so the summary is really clicked — `evaluate(d => (d.open = true))` would step
  // around the very control this proves staff can reach.
  await page.getByTestId("group-choice-open").click();
  await page.locator("#group-BLUE").check();

  // The applicant mirrors into the first household row; the other two are added by hand.
  await page.getByTestId("add-member").click();
  await page.locator("#memberFirstName-1").fill(partner.firstName);
  await page.locator("#memberLastName-1").fill(partner.lastName);
  await fillDay(page.locator("#memberBirthDate-1"), SECOND_GROWN_UP_BIRTH_DATE);

  await page.getByTestId("add-member").click();
  await page.locator("#memberFirstName-2").fill(child.firstName);
  await page.locator("#memberLastName-2").fill(child.lastName);
  await fillDay(page.locator("#memberBirthDate-2"), CHILD_BIRTH_DATE);

  await page.getByRole("button", { name: de.customers.new.submit, exact: true }).click();
  await page.waitForURL(/\/kunden\/\d+(\?|$)/);

  await page.getByTestId("card-view-link").click();
  await page.waitForURL(/\/kunden\/\d+\/karte$/);

  // Index 1 because the form proposes the lowest *free* number, which on this run is a slot nobody
  // has ever held: a card index counts the slot's whole history, so a registration onto a number an
  // archived household released starts above their card rather than at 1 (US-25). That case is
  // `card-number.spec.ts`; what is asserted here is that an untouched slot still begins at 1.
  const cardNumber = await page.getByTestId("card-number").innerText();
  expect(cardNumber).toMatch(/^[0-9]+k1$/);
  expect(cardNumber).toBe(`${proposedNumber}k1`);

  await expect(page.getByTestId("card-name")).toHaveText(
    `${applicant.firstName} ${applicant.lastName}`,
  );
  await expect(page.getByTestId("card-group")).toHaveText(de.customers.groups.BLUE);

  // Derived again, on this request, from the three stored birthdates — no count was ever typed in.
  await expect(page.getByTestId("grown-ups")).toHaveText("2");
  await expect(page.getByTestId("children")).toHaveText("1");

  // A first card replaces nothing, and the view says so rather than showing an empty list.
  await expect(page.getByTestId("superseded-card")).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText(de.customers.cardView.supersededNone);
});
