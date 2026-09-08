"use server";

/**
 * The write actions belonging to the customer record **alone** — the loss reissue (US-09.3), the
 * edits the record is for (US-16.5), and the move to another customer number (US-30.7). What is
 * shared with the counter lives one level up (`../block-actions.ts`, `../archive-actions.ts`).
 *
 * Each is one form, one use case, one audit entry, deliberately not a single `saveCustomer` (PRD §7):
 * a merged action would name every field on every save, and the log would stop saying what was
 * decided.
 *
 * They read fields, call one use case and translate a typed domain error. Every rule lives below; a
 * disabled save button is a courtesy, never the guard.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { changeCustomerNumber } from "@/application/customers/change-customer-number";
import { listNumberChoices, type NumberChoice } from "@/application/customers/list-number-choices";
import { reissueCard } from "@/application/customers/reissue-card";
import { renewCertificate } from "@/application/customers/renew-certificate";
import { updateCustomerDetails } from "@/application/customers/update-customer-details";
import { updateHousehold } from "@/application/customers/update-household";
import { updateNotes } from "@/application/customers/update-notes";
import type { IssuedCard } from "@/domain/card/card";
import { formatCardNumber } from "@/domain/card/cardNumber";
import type { RegisteredCustomer } from "@/domain/customer/customer";
import {
  CertificateValidUntilInPast,
  CustomerArchived,
  CustomerNumberTaken,
  CustomerNumberUnchanged,
  MissingRequiredField,
} from "@/domain/errors";
import { customerFieldLabel, de } from "@/i18n/de";
import { tierOf } from "../../notice-tier";
import { customerDeps } from "../deps";
import {
  calendarDay,
  customerErrorField,
  customerErrorMessage,
  fieldRefusals,
  householdRows,
} from "../neu/registration-input";
import { type NumberChangeState } from "./number-change-state";
import { type ReissueState } from "./reissue-state";
import { savedAfter, type RecordFormState } from "./record-state";

/** A surrogate id as a hidden form field carries it — a positive whole number, or the form is stale. */
const surrogateId = z
  .string()
  .regex(/^\d+$/)
  .transform((value): number => Number(value));

/**
 * The customer number the move was asked for, as the `<select>` submits it. Whether it is *a slot* is
 * `assertChoosableNumber`'s question and, for a race, the partial unique index's. Separate from
 * {@link surrogateId} because it rejects `0`: a customer number is never a row id.
 */
const chosenNumber = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform((value): number => Number(value));

/**
 * The household as the record's editor submits it — the registration's three repeated fields, read by
 * the same helper, so the two screens cannot disagree about what a half-typed row means.
 */
const householdForm = z.object({
  householdMembers: z.array(
    z.object({ firstName: z.string(), lastName: z.string(), birthDate: calendarDay }),
  ),
});

/** Who the customer is and where they live. Note the absence of a customer number (FR-7). */
const detailsForm = z.object({
  firstName: z.string(),
  lastName: z.string(),
  birthDate: calendarDay,
  street: z.string(),
  houseNumber: z.string(),
  zip: z.string(),
  city: z.string(),
});

/**
 * The renewed certificate. The fields are named as the registration names them, because a mark is
 * addressed by the input's own `name` (§7) and only a name the dictionary has a label for is
 * markable — two spellings for one box on four screens would mean two entries and a translation.
 */
const renewalForm = z.object({ certificateType: z.string(), certificateValidUntil: calendarDay });

/**
 * The German sentence for a domain error one of the record's edits can raise. The rules about
 * customer *data* go through the shared `customerErrorMessage`, so a correction and an intake cannot
 * report one broken rule differently; what is added is the pair only an edit can hit.
 */
function recordMessage(error: unknown): string {
  if (error instanceof CustomerArchived) {
    return de.customers.record.errors.archived;
  }
  return customerErrorMessage(error) ?? de.customers.record.errors.unknown;
}

/**
 * A thrown edit failure as the record shows it. The mark comes from the registration's
 * `customerErrorField`, so a blank ZIP marks the ZIP box here exactly as it does on the intake; only
 * the sentence differs.
 *
 * `CustomerArchived` names no field on purpose — it refuses every form on the screen, not one box.
 */
function recordRefusal(error: unknown): RecordFormState & { status: "error" } {
  const field = customerErrorField(error);
  return {
    status: "error",
    message: recordMessage(error),
    tier: tierOf(error),
    ...(field === null ? {} : { fields: [field] }),
  };
}

/** The record and everything derived from it downstream: the counter's verdict, and the card view. */
function revalidateRecord(customerId: number): void {
  revalidatePath(`/kunden/${customerId}`);
  revalidatePath("/ausgabe");
}

/**
 * Issue a replacement for a lost card. The reason is fixed here rather than taken off the form: this
 * is the loss control, and that is what makes the loss count on the card view mean what it says.
 *
 * Nothing is checked before the call — the confirmation step is a courtesy, and `reissueCard`
 * decides. The number goes back with the confirmation **from what was written**, not echoed off the
 * form, so the receipt cannot say something the register does not.
 */
export async function reissueCardAction(
  _previous: ReissueState,
  formData: FormData,
): Promise<ReissueState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  if (!customerId.success) {
    return { status: "error", message: de.customers.reissue.errors.unknown, tier: "error" };
  }

  let cardNumber: string;
  try {
    const card = await reissueCard(customerDeps, { customerId: customerId.data, reason: "LOST" });
    // Both halves off the card the store handed back: the slot it was printed under is on the row
    // itself (ADR-016), so the receipt names what was written rather than what agrees with it.
    cardNumber = formatCardNumber(card.customerNumber, card.index);
  } catch (error: unknown) {
    if (error instanceof CustomerArchived) {
      return {
        status: "error",
        message: de.customers.reissue.errors.archived,
        tier: tierOf(error),
      };
    }
    // A lost card race has words of its own in the shared `customerErrorMessage`; only the last word
    // is this control's.
    return {
      status: "error",
      message: customerErrorMessage(error) ?? de.customers.reissue.errors.unknown,
      tier: tierOf(error),
    };
  }

  revalidatePath(`/kunden/${customerId.data}`);
  revalidatePath(`/kunden/${customerId.data}/karte`);
  return { status: "saved", cardNumber };
}

/**
 * Replace the household with the rows now on the screen (US-16.1). Nothing derived is submitted: the
 * counts the editor shows while staff type are the browser's arithmetic over the rule the save
 * applies, not values on their way to the database.
 */
export async function updateHouseholdAction(
  previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  const members = householdForm.safeParse({ householdMembers: householdRows(formData) });
  if (!customerId.success) {
    return { status: "error", message: de.customers.record.errors.unknown, tier: "error" };
  }
  if (!members.success) {
    // Every refused row, not the first: with a day field per household member a correction fails in
    // three places at once, and one round trip per row is how an edit takes five saves.
    return { ...fieldRefusals(members.error, de.customers.record.errors.unknown), status: "error" };
  }

  try {
    await updateHousehold(customerDeps, {
      customerId: customerId.data,
      members: members.data.householdMembers,
    });
  } catch (error: unknown) {
    return recordRefusal(error);
  }

  revalidateRecord(customerId.data);
  return savedAfter(previous);
}

/**
 * Correct the customer's name, birthdate and address (US-16.2). The customer number is not among the
 * fields and the use case takes none — moving a household is its own act
 * ({@link changeCustomerNumberAction}, US-30), not a correction of who they are (FR-7).
 */
export async function updateDetailsAction(
  previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  const fields = detailsForm.safeParse({
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    birthDate: String(formData.get("birthDate") ?? ""),
    street: String(formData.get("street") ?? ""),
    houseNumber: String(formData.get("houseNumber") ?? ""),
    zip: String(formData.get("zip") ?? ""),
    city: String(formData.get("city") ?? ""),
  });
  if (!customerId.success) {
    return { status: "error", message: de.customers.record.errors.unknown, tier: "error" };
  }
  if (!fields.success) {
    return { ...fieldRefusals(fields.error, de.customers.record.errors.unknown), status: "error" };
  }

  const { firstName, lastName, birthDate, street, houseNumber, zip, city } = fields.data;
  try {
    await updateCustomerDetails(customerDeps, {
      customerId: customerId.data,
      firstName,
      lastName,
      birthDate,
      address: { street, houseNumber, zip, city },
    });
  } catch (error: unknown) {
    return recordRefusal(error);
  }

  revalidateRecord(customerId.data);
  return savedAfter(previous);
}

/**
 * Save the free-text note the counter reads (US-16.3). An empty note is a legitimate answer, so
 * nothing here refuses one — the only bound is the length, and it is the domain's.
 */
export async function updateNotesAction(
  previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  if (!customerId.success) {
    return { status: "error", message: de.customers.record.errors.unknown, tier: "error" };
  }

  try {
    await updateNotes(customerDeps, {
      customerId: customerId.data,
      notes: String(formData.get("notes") ?? ""),
    });
  } catch (error: unknown) {
    return recordRefusal(error);
  }

  revalidateRecord(customerId.data);
  return savedAfter(previous);
}

/**
 * The numbers a refusal carries back, as a patch to spread into the error state — `freshPoolAfterRace`'s
 * shape (US-24). A patch rather than an optional array, so the field stays *absent* where nothing was
 * re-read and the control can tell "no fresh list" from "an empty one".
 *
 * **`CustomerNumberTaken` is the only code that re-reads.** `CustomerNumberOutOfRange` is a refusal of
 * the register's shape rather than of one slot, and `CardNumberTaken` is tiered red precisely because
 * the whole screen has to be read again — half-refreshing here would hide that.
 *
 * It takes the customer read on the way in: nothing was written, so a second `findById` would only be
 * a second moment.
 */
async function freshChoicesAfterRace(
  customer: RegisteredCustomer,
  error: unknown,
): Promise<{ numberChoices?: ReadonlyArray<NumberChoice> }> {
  if (!(error instanceof CustomerNumberTaken)) {
    return {};
  }
  return { numberChoices: await listNumberChoices(customerDeps, customer) };
}

/**
 * Move the household to another customer number and print the card that goes with it (US-30) — one
 * use case, writing both in one transaction, never two calls in turn.
 *
 * Nothing is checked before the call; `changeCustomerNumber` decides, down to re-reading the quota,
 * which a screen open since staff lowered it (US-14) cannot know.
 *
 * The household is read **before** the move for one value: the slot they are leaving. By the time the
 * receipt is on screen that row says the new number, so it cannot be read afterwards — and echoing it
 * off the form would let the receipt say something the register never did.
 */
export async function changeCustomerNumberAction(
  _previous: NumberChangeState,
  formData: FormData,
): Promise<NumberChangeState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  const customerNumber = chosenNumber.safeParse(String(formData.get("customerNumber") ?? ""));
  if (!customerId.success || !customerNumber.success) {
    return { status: "error", message: de.customers.record.errors.unknown, tier: "error" };
  }

  // The same answer a stale hidden `customerId` gets, because it is the same fact: the screen is
  // describing a household the register cannot show it.
  const customer = await customerDeps.customers.findById(customerId.data);
  if (customer === null) {
    return { status: "error", message: de.customers.record.errors.unknown, tier: "error" };
  }

  let card: IssuedCard;
  try {
    card = await changeCustomerNumber(customerDeps, {
      customerId: customerId.data,
      customerNumber: customerNumber.data,
    });
  } catch (error: unknown) {
    // Named here rather than in `recordMessage` because the sentence quotes the number, which this
    // layer holds. Only a second tab or a stale form reaches it.
    if (error instanceof CustomerNumberUnchanged) {
      return {
        status: "error",
        message: de.customers.errors.customerNumberUnchanged(error.customerNumber),
        tier: tierOf(error),
      };
    }
    // `recordMessage` rather than `recordRefusal`, which also carries a field to mark: a mark belongs
    // to a form of typed boxes where the refusal has to say which is wrong, and this form has one
    // dropdown the sentence beneath it is unambiguously about.
    return {
      status: "error",
      message: recordMessage(error),
      tier: tierOf(error),
      ...(await freshChoicesAfterRace(customer, error)),
    };
  }

  // Every screen reading either half of what was written: the record and card view show the new
  // numbers, `/kunden` counts the freed slot, the counter resolves both numbers, and
  // `/karten-neuausstellung` no longer lists a household whose card was just printed.
  revalidateRecord(customerId.data);
  revalidatePath(`/kunden/${customerId.data}/karte`);
  revalidatePath("/kunden");
  revalidatePath("/karten-neuausstellung");
  return {
    status: "saved",
    from: customer.customerNumber,
    to: card.customerNumber,
    cardNumber: formatCardNumber(card.customerNumber, card.index),
  };
}

/**
 * Record a renewed needs certificate from the record (US-16.5, FR-6) — the counter's own use case,
 * and its reset of the reminder count. Offered whether or not the certificate has expired: a
 * household bringing the renewal early should not have to be turned away first.
 */
export async function renewCertificateAction(
  previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  const fields = renewalForm.safeParse({
    certificateType: String(formData.get("certificateType") ?? ""),
    certificateValidUntil: String(formData.get("certificateValidUntil") ?? ""),
  });
  if (!customerId.success) {
    return { status: "error", message: de.customers.record.errors.unknown, tier: "error" };
  }
  if (!fields.success) {
    // The schema's own answer rather than a blanket „Kein gültiges Datum.“ (ADR-013). Both fields are
    // `required`, so only the unreadable branch is reachable through the UI — the distinction is kept
    // because the guard is the browser's, not a rule.
    return {
      ...fieldRefusals(fields.error, de.distribution.certificate.renewal.errors.unknown),
      status: "error",
    };
  }

  try {
    await renewCertificate(customerDeps, {
      customerId: customerId.data,
      type: fields.data.certificateType,
      validUntil: fields.data.certificateValidUntil,
    });
  } catch (error: unknown) {
    // The renewal speaks the counter's dictionary, not the record's; the *fields* it names are the
    // shared ones, so the mark comes from where every other screen's does.
    const field = customerErrorField(error);
    const marks = field === null ? {} : { fields: [field] };
    if (error instanceof CertificateValidUntilInPast) {
      return {
        status: "error",
        message: de.distribution.certificate.renewal.errors.validUntilInPast,
        tier: tierOf(error),
        ...marks,
      };
    }
    if (error instanceof MissingRequiredField) {
      return {
        status: "error",
        message: de.customers.errors.missingField(customerFieldLabel(error.field)),
        tier: tierOf(error),
        ...marks,
      };
    }
    return {
      status: "error",
      message: de.distribution.certificate.renewal.errors.unknown,
      tier: tierOf(error),
    };
  }

  revalidateRecord(customerId.data);
  return savedAfter(previous);
}
