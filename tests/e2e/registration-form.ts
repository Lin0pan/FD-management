import { faker } from "@faker-js/faker";
import type { Page } from "@playwright/test";
import { fillDay, fillSticky } from "./day";

/**
 * Filling the intake at `/kunden/neu`, and the identical half of the waiting-list application.
 *
 * Two spec files drive this form, and until this module existed each held a copy of the filler. The
 * copies then diverged in the one way that matters: `registration.spec.ts` was moved onto
 * {@link fillSticky} when the hydration window was diagnosed, and `waiting-list.spec.ts` — whose
 * copy was private, so nothing pointed at it — was not. It went on filling nine controlled fields
 * with a bare `fill()` and was one of the two files that reddened a WebKit run on CI months later.
 *
 * So the filler lives here, once. A second copy of it is the bug, not the duplication.
 */

/** Somebody as the form takes them: the two fields every spec makes up, and nothing else. */
export interface Person {
  readonly firstName: string;
  readonly lastName: string;
}

/**
 * The dates and the certificate a spec pins, because the rules under test are about dates.
 *
 * Passed in rather than fixed here: each spec documents why its birthdate is a grown-up and why its
 * certificate outlives the run, and those arguments belong beside the assertions that rest on them.
 */
export interface Eligibility {
  /** ISO. Well before 13 years ago, unless the spec is about the boundary. */
  readonly birthDate: string;
  readonly certificateType: string;
  /** ISO. Comfortably in the future, so nobody is refused for a lapsed certificate. */
  readonly certificateValidUntil: string;
}

/**
 * Fill everything except the household — the part every spec needs the same way.
 *
 * **Every field on this form is controlled, so every fill goes through {@link fillSticky}**: a
 * `fill()` in the window between the server's HTML arriving and the component hydrating is written
 * straight to the DOM, and the first render from state deletes it again. The fields are controlled
 * because a refused save must not empty them (`registration-form.tsx`, `DetailsDraft`), and they are
 * `required`, so a value hydration wiped makes the browser *silently* decline to submit — no
 * request, no answer, and a failure five seconds later on an element that was never going to appear.
 *
 * The address is Faker's: nothing asserts it, and a spec that pinned it would be claiming the form
 * cares.
 */
export async function fillPersonalData(
  page: Page,
  person: Person,
  eligibility: Eligibility,
): Promise<void> {
  await fillSticky(page.locator("#firstName"), person.firstName);
  await fillSticky(page.locator("#lastName"), person.lastName);
  await fillDay(page.locator("#birthDate"), eligibility.birthDate);
  await fillSticky(page.locator("#street"), faker.location.street());
  await fillSticky(page.locator("#houseNumber"), faker.location.buildingNumber());
  await fillSticky(page.locator("#zip"), faker.location.zipCode("#####"));
  await fillSticky(page.locator("#city"), faker.location.city());
  await fillSticky(page.locator("#certificateType"), eligibility.certificateType);
  await fillDay(page.locator("#certificateValidUntil"), eligibility.certificateValidUntil);
}
