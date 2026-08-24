"use server";

/**
 * The write actions that belong to the customer record **alone**: the reissue after a loss
 * (tasks/prd-us-09-reissue-card-after-loss.md §US-09.3) and the five edits the record is for —
 * household, personal data, notes, group and a renewed certificate
 * (tasks/prd-us-16-maintain-customer-record.md §US-16.5).
 *
 * The actions shared with the counter live one level up beside the components that use them:
 * `../block-actions.ts` and `../archive-actions.ts`. What is here is here because no other screen
 * offers it.
 *
 * Each is one form, one use case, one audit entry — deliberately not a single `saveCustomer` that
 * took every field at once (PRD §7). A merged action would write an audit entry naming every field
 * on every save, and the log would stop saying what was actually decided.
 *
 * Their only job is to read the fields off the form, call one use case, and translate a typed domain
 * error into a German sentence. Every rule lives in the domain and the use cases; a disabled save
 * button is a courtesy, never the guard. On success the affected screens are revalidated, so what
 * they show comes back from the store rather than from client memory — which is also how the record
 * proves a change is in force: the counts, the price and the counter's verdict are all derived on
 * the next read.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { changeGroup } from "@/application/customers/change-group";
import { reissueCard } from "@/application/customers/reissue-card";
import { renewCertificate } from "@/application/customers/renew-certificate";
import { updateCustomerDetails } from "@/application/customers/update-customer-details";
import { updateHousehold } from "@/application/customers/update-household";
import { updateNotes } from "@/application/customers/update-notes";
import { formatCardNumber } from "@/domain/card/cardNumber";
import { parseGroup } from "@/domain/customer/group";
import {
  CertificateValidUntilInPast,
  CustomerArchived,
  GroupUnchanged,
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
import { type ReissueState } from "./reissue-state";
import { savedAfter, type RecordFormState } from "./record-state";

/** A surrogate id as a hidden form field carries it — a positive whole number, or the form is stale. */
const surrogateId = z
  .string()
  .regex(/^\d+$/)
  .transform((value): number => Number(value));

/**
 * The household as the record's editor submits it — the same three repeated fields the registration
 * form uses, read by the same helper, so the two screens cannot come to disagree about what a
 * half-typed row means (a row missing its birthdate reaches the domain and is refused there).
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
 * The renewed certificate: what kind of notice it is and the day it runs to.
 *
 * The two fields are named as the registration names them rather than `type` and `validUntil`,
 * which is what they were called until a refusal had to mark them. A mark is addressed by the
 * input's own `name` (§7), and a name is only markable if the dictionary has a German label for it
 * — `de.customers.fields` has had `certificateType` and `certificateValidUntil` since the
 * registration form, and `DOMAIN_FIELD_PATH` already translates `certificate.type` into the first
 * of them. Two spellings for one field would have meant two entries and a translation between them,
 * for the same box on four screens.
 */
const renewalForm = z.object({ certificateType: z.string(), certificateValidUntil: calendarDay });

/**
 * The German sentence for a domain error one of the record's edits can raise.
 *
 * The rules about customer *data* are the registration's, and are translated by the shared
 * `customerErrorMessage` so a correction and an intake cannot report the same broken rule
 * differently. What is added here is the pair only an edit can hit: a record that has left the
 * register, and the last word for anything unrecognised.
 */
function recordMessage(error: unknown): string {
  if (error instanceof CustomerArchived) {
    return de.customers.record.errors.archived;
  }
  return customerErrorMessage(error) ?? de.customers.record.errors.unknown;
}

/**
 * A thrown edit failure as the record shows it — the sentence, the tier, and the field to mark where
 * the error names one.
 *
 * The mark comes from the registration's `customerErrorField`, so a blank ZIP marks the ZIP box and
 * an over-long note marks the note on this screen exactly as it does on the intake. Only the
 * sentence differs, and only because a correction and an intake fail at different things when
 * nothing matched: {@link recordMessage} is what says so.
 *
 * `CustomerArchived` names no field on purpose. It is a statement about the whole record — every
 * form on the screen is refused, not one box — and the sentence tells staff to reload rather than to
 * fix anything.
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
 * Issue a replacement for the card the customer named by the hidden `customerId` has lost.
 *
 * The reason is fixed here rather than taken off the form: this control is the loss control, and it
 * is what makes the loss count on the card view mean what it says. A reissue for changed household
 * counts is US-13's action and will carry its own reason.
 *
 * Nothing is checked before the call — the form's confirmation step is a courtesy to whoever clicked
 * it, and `reissueCard` is what decides whether the card may be issued. An archived customer is the
 * one refusal, and it comes back as a German sentence beside the button. On success both the record
 * and the card view are revalidated, so whichever screen the reissue was started from shows the new
 * number, and the other one does too when it is next opened.
 *
 * The number goes back with the confirmation, which is what the second read is for. It is the thing
 * staff copy onto the physical card, so it is stated from what was actually written — the index the
 * card came back with and the slot the customer holds — rather than echoed back from the form, which
 * would let the receipt say something the register does not. `formatCardNumber` is the domain's own,
 * so the sentence and the card view spell the number the same way.
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
    const customer = await customerDeps.customers.findById(customerId.data);
    if (customer === null) {
      return { status: "error", message: de.customers.reissue.errors.unknown, tier: "error" };
    }
    cardNumber = formatCardNumber(customer.customerNumber, card.index);
  } catch (error: unknown) {
    if (error instanceof CustomerArchived) {
      return {
        status: "error",
        message: de.customers.reissue.errors.archived,
        tier: tierOf(error),
      };
    }
    return { status: "error", message: de.customers.reissue.errors.unknown, tier: tierOf(error) };
  }

  revalidatePath(`/kunden/${customerId.data}`);
  revalidatePath(`/kunden/${customerId.data}/karte`);
  return { status: "saved", cardNumber };
}

/**
 * Replace the household with the rows now on the screen (US-16.1).
 *
 * Nothing derived is submitted and there is no field for it: the counts and the price the editor
 * shows while staff type are the browser's arithmetic over the same domain rule the save will
 * apply, not values on their way to the database.
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
    // Every refused row, not the first. This form has a day field per household member, so a
    // household corrected in a hurry fails in three places at once, and one round trip per row is
    // how an edit takes five saves. The row schema already said whether each birthdate was blank or
    // unreadable, and `fieldRefusals` is what turns the issue's path into the row it belongs to —
    // the summary used to be „Kein gültiges Datum.“ under the button, naming no row at all.
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
 * Correct the customer's name, birthdate and address (US-16.2).
 *
 * The customer number is not among the fields read here, and the use case takes none: a slot is
 * assigned at registration and released by archiving, never edited (FR-7).
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
 * Move the household to the other balancing group (US-16.4).
 *
 * `GroupUnchanged` is named here rather than in {@link recordMessage} because the sentence quotes
 * the group, and this is the layer that holds it as a parsed `Group` — the error carries the value
 * as a bare string, and re-parsing it to look up a German word would be inventing a way for it to
 * fail.
 */
export async function changeGroupAction(
  previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const customerId = surrogateId.safeParse(String(formData.get("customerId") ?? ""));
  if (!customerId.success) {
    return { status: "error", message: de.customers.record.errors.unknown, tier: "error" };
  }

  let group;
  try {
    group = parseGroup(String(formData.get("group") ?? ""));
  } catch {
    return {
      status: "error",
      message: de.customers.errors.missingField(de.customers.fields.group),
      tier: "refusal",
    };
  }

  try {
    await changeGroup(customerDeps, { customerId: customerId.data, group });
  } catch (error: unknown) {
    if (error instanceof GroupUnchanged) {
      return {
        status: "error",
        message: de.customers.errors.groupUnchanged(de.customers.groups[group]),
        tier: tierOf(error),
      };
    }
    return recordRefusal(error);
  }

  revalidateRecord(customerId.data);
  return savedAfter(previous);
}

/**
 * Record a renewed needs certificate from the record (US-16.5, FR-6) — the same use case the counter
 * calls (US-06.4), and therefore the same reset of the reminder count to zero.
 *
 * Unlike at the counter, it is offered whether or not the certificate has expired: a household that
 * brings the renewal early should not have to be turned away first for the form to appear.
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
    // The schema's own answer, not the blanket „Kein gültiges Datum.“ this used to return whatever
    // `calendarDay` had actually said — telling somebody who typed nothing that their *format* is
    // wrong is the mistake ADR-013 is about. Both fields are `required`, so the browser stops a
    // blank one before it gets here and only the unreadable branch is reachable through the UI; the
    // distinction is kept because it costs nothing and the guard is the browser's, not a rule.
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
    // Two refusals with words of their own — the renewal speaks the counter's dictionary, not the
    // record's — but the *fields* they name are the shared ones, so the mark comes from the same
    // place every other screen's does.
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
