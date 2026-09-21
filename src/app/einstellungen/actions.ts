"use server";

/**
 * The settings screen's server action — the adapter between an HTML form and `updateSettings`. It
 * gives the submitted strings a shape, turns euro text into cents, and translates a typed domain
 * error. Every rule about *what is allowed* lives below; adding one here would be a bug.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateCertificateTypes } from "@/application/settings/update-certificate-types";
import { updateSettings } from "@/application/settings/update-settings";
import {
  CertificateTypeTooLong,
  DomainError,
  DuplicateCertificateType,
  DuplicateEggThreshold,
  EggsNotIncreasing,
  InvalidEuroAmount,
  InvalidSettings,
  MissingRequiredField,
  QuotaBelowActiveCustomers,
} from "@/domain/errors";
import { parseEuros } from "@/domain/money";
import { de, settingsFormFieldLabel } from "@/i18n/de";
import { summarise, type FormRefusal } from "../field-refusal";
import { tierOf } from "../notice-tier";
import { settingsDeps } from "./deps";
import type { SaveCertificateTypesState } from "./save-certificate-types-state";
import type { SaveSettingsState, SubmittedSettings } from "./save-settings-state";

/** A whole number as typed into a form field. Range rules belong to the domain, not here. */
const wholeNumber = z.string().transform((value, ctx): number => {
  if (!/^\d+$/.test(value.trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: de.settings.errors.notAnInteger });
    return z.NEVER;
  }
  return Number(value.trim());
});

/** A euro amount as typed into a form field, converted to whole cents before it leaves the adapter. */
const euroAmount = z.string().transform((value, ctx): number => {
  try {
    return parseEuros(value);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: de.settings.errors.notAnAmount });
    return z.NEVER;
  }
});

/**
 * A euro amount that may be left out — the Maximalpreis (US-26.5). An empty field is an *answer*,
 * not a missing one: no cap is a different claim from a cap of `0,00`. Anything else goes through
 * the same {@link parseEuros} as a required amount.
 */
const optionalEuroAmount = z.string().transform((value, ctx): number | null => {
  if (value.trim() === "") {
    return null;
  }
  try {
    return parseEuros(value);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: de.settings.errors.notAnAmount });
    return z.NEVER;
  }
});

const settingsForm = z.object({
  quotaN: wholeNumber,
  reason: z.string(),
  pricePerGrownUp: euroAmount,
  pricePerChild: euroAmount,
  priceCap: optionalEuroAmount,
  /**
   * The egg rule's rows, paired back out of the repeated inputs by {@link eggRuleRows}. Both fields
   * go through the same {@link wholeNumber} as the quota; what a *legal* staircase is stays
   * `createEggRule`'s.
   */
  eggRule: z.array(z.object({ minPersons: wholeNumber, eggs: wholeNumber })),
});

/**
 * The submitted strings, read once and used twice: parsed into the values the use case takes, and
 * handed back untouched on a refusal so the form keeps what was typed. Keyed by the inputs' `name`s,
 * which is what makes the second use possible.
 */
function formValues(formData: FormData): SubmittedSettings {
  const text = (name: string): string => String(formData.get(name) ?? "");
  return {
    quotaN: text("quotaN"),
    reason: text("reason"),
    pricePerGrownUp: text("pricePerGrownUp"),
    pricePerChild: text("pricePerChild"),
    priceCap: text("priceCap"),
  };
}

/**
 * One typed row of the egg rule, with its position **on screen** alongside — carried because a wholly
 * blank row is dropped before validation, which shifts every index below it. Spent in
 * {@link screenPath}.
 */
interface TypedEggRow {
  readonly position: number;
  readonly minPersons: string;
  readonly eggs: string;
}

/**
 * Pair the repeated egg-rule inputs back into rows, on `householdRows`' model: the count is the
 * **longer** of the two parallel lists, so a row whose egg count was left blank reaches the schema
 * rather than vanishing.
 *
 * A row where **both** fields are blank is dropped — it is the row „Zeile hinzufügen“ just made, and
 * pressing that button then saving must not refuse. One blank field is still a half-typed row.
 */
function eggRuleRows(formData: FormData): ReadonlyArray<TypedEggRow> {
  const thresholds = formData.getAll("eggThreshold").map(String);
  const counts = formData.getAll("eggCount").map(String);
  const rows = Math.max(thresholds.length, counts.length);

  return Array.from({ length: rows }, (_unused, position) => ({
    position,
    minPersons: thresholds[position] ?? "",
    eggs: counts[position] ?? "",
  })).filter((row) => row.minPersons.trim() !== "" || row.eggs.trim() !== "");
}

/** A row of the egg rule as the schema and the domain both name it, e.g. `eggRule.1.eggs`. */
const EGG_RULE_PATH = /^eggRule\.(\d+)\.(minPersons|eggs)$/;

/**
 * The path a refusal named, with an egg row's index put back to its position **on screen**.
 *
 * Zod and `createEggRule` both number by position in the list they were handed — the one with blank
 * rows already dropped. The form still shows the empty row somebody added, so without this a refusal
 * would mark the row above the one that was typed.
 */
function screenPath(path: string, rows: ReadonlyArray<TypedEggRow>): string {
  const match = EGG_RULE_PATH.exec(path);
  if (match === null) {
    return path;
  }
  const row = rows[Number(match[1])];
  return row === undefined ? path : `eggRule.${row.position}.${match[2]}`;
}

/**
 * Everything the schema refused, in one answer. A settings path is already the input's own `name`, so
 * there is nothing to translate — but a path with no label is still dropped, which is the test every
 * screen applies (§7). It drops nothing today; it keeps that a fact rather than an assumption.
 */
function settingsRefusals(error: z.ZodError, eggRows: ReadonlyArray<TypedEggRow>): FormRefusal {
  const fields = error.issues
    .map((issue) => ({
      path: screenPath(issue.path.join("."), eggRows),
      problem: issue.message,
    }))
    .filter((field) => settingsFormFieldLabel(field.path) !== null);

  return summarise(fields, de.settings.errors.unknown, settingsFormFieldLabel);
}

/**
 * Turn a typed domain error into the answer the screen shows: the sentence, the tier, and — where the
 * error names one — the field to mark. Every settings field is spelled the same in the domain and
 * on the form, so `field` is the input's own `name`.
 *
 * **The three collisions deliberately name no field**, and that is the division between the two
 * refusal paths here. A malformed value in one row is that row's fault and marks its control; two
 * rows that contradict each other are neither one's, and marking one would call it malformed when
 * the two are merely inconsistent — so the sentence names the thresholds itself, which is what makes
 * the rows findable. `QuotaBelowActiveCustomers` is the same shape one level up.
 */
function refusal(
  error: unknown,
  eggRows: ReadonlyArray<TypedEggRow>,
): Pick<SaveSettingsState, "message" | "tier" | "fields"> {
  const tier = tierOf(error);
  if (error instanceof DuplicateEggThreshold) {
    return { message: de.settings.eggs.duplicateThreshold(error.minPersons), tier };
  }
  if (error instanceof EggsNotIncreasing) {
    return {
      message: de.settings.eggs.eggsNotIncreasing(
        error.minPersons,
        error.eggs,
        error.lowerMinPersons,
        error.lowerEggs,
      ),
      tier,
    };
  }
  if (error instanceof QuotaBelowActiveCustomers) {
    return {
      message: de.settings.errors.quotaBelowActiveCustomers(error.quotaN, error.activeCustomers),
      tier,
    };
  }
  if (error instanceof InvalidEuroAmount) {
    return { message: de.settings.errors.invalidAmount(error.text), tier };
  }
  if (error instanceof InvalidSettings) {
    // The summary names the field, so the mark stays the short generic words — a mark naming its own
    // field would say it twice in one eyeful. `errorFields` answers for the flat settings and
    // `settingsFormFieldLabel` for the egg rows, whose label is built from an index.
    const path = screenPath(error.field, eggRows);
    return {
      message: de.settings.errors.invalidSettings(
        de.settings.errorFields[error.field] ?? settingsFormFieldLabel(path) ?? error.field,
      ),
      tier,
      fields: [{ path, problem: de.settings.errors.invalidValue }],
    };
  }
  if (error instanceof DomainError && error.code === "NoSettingsInForce") {
    return { message: de.settings.errors.noSettings, tier };
  }
  return { message: de.settings.errors.unknown, tier };
}

/**
 * Validate the form, append a new settings version — in force at once — and record the change.
 *
 * On any failure nothing is written, and the form comes back with the explanation, the field to mark
 * and **the submission itself**, so the valid edits beside the refused one are not thrown away.
 */
export async function saveSettings(
  _previous: SaveSettingsState,
  formData: FormData,
): Promise<SaveSettingsState> {
  const values = formValues(formData);
  // Deliberately not part of {@link SubmittedSettings}: the rows are React state and survive
  // `useActionState`'s reset on their own, so there is nothing for a refusal to hand back.
  const eggRows = eggRuleRows(formData);
  const parsed = settingsForm.safeParse({ ...values, eggRule: eggRows });
  if (!parsed.success) {
    // A refusal, not an error: every issue here is a value somebody typed into a field still on
    // screen, and the path is already the input's own name.
    //
    // Every issue, not the first: with three money boxes, a summary naming none of them leaves the
    // staff member by the button not knowing which to look at.
    return { status: "error", ...settingsRefusals(parsed.error, eggRows), values };
  }
  const form = parsed.data;

  try {
    await updateSettings(settingsDeps, {
      reason: form.reason,
      settings: {
        quotaN: form.quotaN,
        pricePerGrownUp: form.pricePerGrownUp,
        pricePerChild: form.pricePerChild,
        priceCap: form.priceCap,
        // In the order they were typed: sorting is `createEggRule`'s, and an adapter that sorted
        // first would number its rows differently from the screen that shows them.
        eggRule: form.eggRule,
      },
    });
  } catch (error: unknown) {
    return { status: "error", ...refusal(error, eggRows), values };
  }

  revalidatePath("/einstellungen");
  return { status: "saved", message: de.settings.saved };
}

/**
 * One typed row of the certificate-type list, with its position **on screen** alongside — carried
 * because a wholly blank row is dropped before it reaches the domain, which shifts every index below
 * it. The egg rule's `TypedEggRow` in the same shape, for the same reason.
 */
interface TypedCertificateTypeRow {
  readonly position: number;
  readonly label: string;
}

/**
 * Pair the repeated `certificateTypeLabel` inputs into rows, dropping a wholly blank one — the row
 * „Art hinzufügen" just made. One field per row, unlike the egg rule's two, so there is no partial row
 * to preserve: a row is either typed or it is the blank one just added.
 *
 * Dropping it here is also why `createCertificateTypeList`'s own blank refusal cannot arrive from
 * this screen — the branch below is kept anyway, because the drop is this adapter's convenience and
 * the rule is the domain's.
 */
function certificateTypeRows(formData: FormData): ReadonlyArray<TypedCertificateTypeRow> {
  return formData
    .getAll("certificateTypeLabel")
    .map(String)
    .map((label, position) => ({ position, label }))
    .filter((row) => row.label.trim() !== "");
}

/** A row of the certificate-type list as the domain names it, e.g. `certificateTypes.1.label`. */
const CERTIFICATE_TYPE_PATH = /^certificateTypes\.(\d+)\.label$/;

/**
 * The path a refusal named, with a certificate-type row's index put back to its position **on
 * screen** — `screenPath`'s egg-rule counterpart, for the same reason.
 */
function certificateTypeScreenPath(
  path: string,
  rows: ReadonlyArray<TypedCertificateTypeRow>,
): string {
  const match = CERTIFICATE_TYPE_PATH.exec(path);
  if (match === null) {
    return path;
  }
  const row = rows[Number(match[1])];
  return row === undefined ? path : `certificateTypes.${row.position}.label`;
}

/**
 * Turn a typed domain error from `updateCertificateTypes` into the answer the card shows.
 *
 * **`DuplicateCertificateType` and `CertificateTypeTooLong` name no field**, in `DuplicateEggThreshold`'s
 * own shape: neither carries which row is at fault (a spelling collides with *another* row; a length
 * is a property of the text alone), so marking one would call it malformed when the true fault is
 * between two rows or a length nobody has picked out from the sentence.
 */
function certificateTypeRefusal(
  error: unknown,
  rows: ReadonlyArray<TypedCertificateTypeRow>,
): Pick<SaveCertificateTypesState, "message" | "tier" | "fields"> {
  const tier = tierOf(error);
  if (error instanceof DuplicateCertificateType) {
    return { message: de.settings.certificateTypes.errors.duplicate(error.label), tier };
  }
  if (error instanceof CertificateTypeTooLong) {
    return {
      message: de.settings.certificateTypes.errors.tooLong(error.length, error.maxLength),
      tier,
    };
  }
  if (error instanceof MissingRequiredField) {
    const path = certificateTypeScreenPath(error.field, rows);
    const match = CERTIFICATE_TYPE_PATH.exec(path);
    const position = match === null ? null : Number(match[1]) + 1;
    return {
      message: de.customers.errors.missingField(
        position === null ? error.field : de.settings.certificateTypes.fieldLabel(position),
      ),
      tier,
      fields: [{ path, problem: de.customers.errors.fieldRequired }],
    };
  }
  return { message: de.settings.certificateTypes.errors.unknown, tier };
}

/**
 * Validate the submitted list through the domain, replace it and record one audit entry — all of it
 * `updateCertificateTypes`'s. This adapter only turns form data into an array of strings and a typed
 * refusal back into the card's words.
 *
 * On any failure nothing is written, and the card comes back with the explanation and, where the
 * refusal names one, the row to mark.
 */
export async function saveCertificateTypes(
  _previous: SaveCertificateTypesState,
  formData: FormData,
): Promise<SaveCertificateTypesState> {
  const rows = certificateTypeRows(formData);

  try {
    await updateCertificateTypes(
      settingsDeps,
      rows.map((row) => row.label),
    );
  } catch (error: unknown) {
    return { status: "error", ...certificateTypeRefusal(error, rows) };
  }

  revalidatePath("/einstellungen");
  return { status: "saved", message: de.settings.certificateTypes.saved };
}
