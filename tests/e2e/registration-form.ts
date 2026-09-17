import { faker } from "@faker-js/faker";
import { expect, type Locator, type Page } from "@playwright/test";
import { CERTIFICATE_TYPE_OTHER } from "@/app/certificate-type-resolver";
import { fillDay, fillSticky, hydrated } from "./day";

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
  await fillCertificateType(page, eligibility.certificateType);
  await fillDay(page.locator("#certificateValidUntil"), eligibility.certificateValidUntil);
}

/**
 * `CertificateTypeField` (US-33.5) is one component behind four different ids — `certificateType` at
 * the two intake forms, `renewal-type-field` on the record, `renewal-type` at the counter — so every
 * helper below takes the id rather than assuming the intake's own.
 */

async function configuredValues(select: Locator): Promise<ReadonlyArray<string | null>> {
  return select
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.getAttribute("value")));
}

/**
 * Fill an Art-des-Nachweises control: the type is selected when the register's current vocabulary
 * carries it, and typed into the "Sonstiges" field it reveals otherwise.
 *
 * Reads the `<select>`'s *own* options rather than assuming a fixture configured them, so one call
 * works unmodified whether this register has the type configured or not — a register with nothing
 * configured falls onto "Sonstiges", exactly like the plain text box this control replaced.
 */
export async function fillCertificateTypeControl(
  page: Page,
  id: string,
  type: string,
): Promise<void> {
  const select = page.locator(`#${id}`);
  await hydrated(select);
  const configured = await configuredValues(select);

  if (configured.includes(type)) {
    await select.selectOption(type);
  } else {
    await select.selectOption(CERTIFICATE_TYPE_OTHER);
    await fillSticky(page.locator(`#${id}-other`), type);
  }
}

/** {@link fillCertificateTypeControl} for the intake's own `certificateType` control. */
export async function fillCertificateType(page: Page, type: string): Promise<void> {
  await fillCertificateTypeControl(page, "certificateType", type);
}

/**
 * A control with nothing pre-filled: "Sonstiges" selected and its free-text field empty — the one
 * state a plain blank input used to have, now split across the select and the field it reveals.
 */
export async function expectCertificateTypeControlBlank(page: Page, id: string): Promise<void> {
  await expect(page.locator(`#${id}`)).toHaveValue(CERTIFICATE_TYPE_OTHER);
  await expect(page.locator(`#${id}-other`)).toHaveValue("");
}

/** {@link expectCertificateTypeControlBlank} for the intake's own `certificateType` control. */
export async function expectCertificateTypeBlank(page: Page): Promise<void> {
  await expectCertificateTypeControlBlank(page, "certificateType");
}

/**
 * What a control holds after a fill: selected under `type` when it is configured, "Sonstiges" with
 * `type` standing in the free-text field otherwise — the same rule {@link fillCertificateTypeControl}
 * fills by, read back rather than assumed.
 */
export async function expectCertificateTypeControlValue(
  page: Page,
  id: string,
  type: string,
): Promise<void> {
  const select = page.locator(`#${id}`);
  const configured = await configuredValues(select);

  if (configured.includes(type)) {
    await expect(select).toHaveValue(type);
  } else {
    await expect(select).toHaveValue(CERTIFICATE_TYPE_OTHER);
    await expect(page.locator(`#${id}-other`)).toHaveValue(type);
  }
}
