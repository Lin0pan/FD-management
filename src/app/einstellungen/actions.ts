"use server";

/**
 * The settings screen's server action — the adapter between an HTML form and `updateSettings`. It
 * gives the submitted strings a shape, turns euro text into cents, and translates a typed domain
 * error. Every rule about *what is allowed* lives below; adding one here would be a bug.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateSettings } from "@/application/settings/update-settings";
import {
  DomainError,
  DuplicateEggThreshold,
  EggsNotIncreasing,
  InvalidEuroAmount,
  InvalidSettings,
  QuotaBelowActiveCustomers,
} from "@/domain/errors";
import { parseEuros } from "@/domain/money";
import { parseWeekColour } from "@/domain/policy/settings";
import { de, settingsFormFieldLabel } from "@/i18n/de";
import { summarise, type FormRefusal } from "../field-refusal";
import { tierOf } from "../notice-tier";
import { settingsDeps } from "./deps";
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

const weekColour = z.string().transform((value, ctx) => {
  try {
    return parseWeekColour(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: de.settings.errors.invalidSettings(de.settings.fields.weekAnchorColour),
    });
    return z.NEVER;
  }
});

const settingsForm = z.object({
  quotaN: wholeNumber,
  weekAnchorIsoWeek: z.string(),
  weekAnchorColour: weekColour,
  distributionWeekday: wholeNumber,
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
    weekAnchorIsoWeek: text("weekAnchorIsoWeek"),
    weekAnchorColour: text("weekAnchorColour"),
    distributionWeekday: text("distributionWeekday"),
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
 * The two settings the domain nests and the form flattens — `weekAnchor.isoWeek` against
 * `weekAnchorIsoWeek`. The other seven are spelled the same on both sides and are not listed.
 */
const INPUT_NAME: Record<string, string | undefined> = {
  "weekAnchor.isoWeek": "weekAnchorIsoWeek",
  "weekAnchor.colour": "weekAnchorColour",
};

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
 * error names one — the field to mark. `field` is the **form input's** name, translated through
 * {@link INPUT_NAME} for the two the domain nests.
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
    const path = screenPath(INPUT_NAME[error.field] ?? error.field, eggRows);
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
        weekAnchor: { isoWeek: form.weekAnchorIsoWeek, colour: form.weekAnchorColour },
        distributionWeekday: form.distributionWeekday,
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
