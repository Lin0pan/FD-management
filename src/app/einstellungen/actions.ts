"use server";

/**
 * The settings screen's server action — the thin adapter between an HTML form and the
 * `updateSettings` use case.
 *
 * Its only jobs are to give the submitted strings a shape (Zod), turn euro text into whole cents,
 * and translate a typed domain error into a German sentence. Every rule about *what is allowed*
 * lives in the domain and the use case; adding one here would be a bug.
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
 * A euro amount that may be left out — the Maximalpreis (US-26.5).
 *
 * An empty field is an answer here, not a missing one: it says there is no cap, which is a different
 * claim from a cap of `0,00` (every household collects for free). So a value that trims to `""`
 * becomes `null`, and anything else goes through the same {@link parseEuros} as a required amount —
 * one parser for euro text, refusing `2,5o` with the same sentence wherever it is typed.
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
   * The egg rule's rows, paired back out of the repeated inputs by {@link eggRuleRows}.
   *
   * Both fields go through the same {@link wholeNumber} as the quota, so a blank one is refused
   * with the same words wherever it is typed. What a *legal* staircase is stays the domain's:
   * `createEggRule` decides that no two rows share a threshold and that each step awards strictly
   * more than the one below.
   */
  eggRule: z.array(z.object({ minPersons: wholeNumber, eggs: wholeNumber })),
});

/**
 * The submitted strings, read once and used twice: parsed into the values that go to the use case,
 * and handed back untouched on a refusal so the form keeps what was typed.
 *
 * The keys are the inputs' `name`s, which is what makes the second use possible — the form reads
 * them straight back by the same names.
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
 * One typed row of the egg rule, with the position it occupies **on screen** kept alongside.
 *
 * The position is carried because a wholly blank row is dropped before validation, which shifts
 * every index below it: without this, refusing row 3 of the four on screen would mark row 2. See
 * {@link screenPath}, which is where it is spent.
 */
interface TypedEggRow {
  readonly position: number;
  readonly minPersons: string;
  readonly eggs: string;
}

/**
 * Pair the repeated egg-rule inputs back into rows — `householdRows`' shape, and modelled on it.
 *
 * The two fields of a row arrive as two parallel lists, so the row count is the longer of them: a
 * row whose egg count was left blank has to reach the schema and be refused there, not vanish on
 * the way.
 *
 * A row where **both** fields are blank is a different thing and is dropped: it is the row „Zeile
 * hinzufügen“ just made, and pressing that button and then saving must not refuse. One blank field
 * is a half-typed row and is still refused, naming the blank one.
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
 * The path a refusal named, with an egg row's index put back to the row's position on screen.
 *
 * Zod numbers its issues by position in the array it was given, and `createEggRule` numbers its own
 * by position in the rows it was handed — both of which are the list with the blank rows already
 * dropped. The form is not: it still shows the empty row somebody added. Without this translation a
 * refusal would mark the row above the one that was typed, which is precisely the fault the domain
 * refuses to sort its rows in order to avoid.
 *
 * Anything that is not an egg path is already the input's own name and comes back untouched.
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
 * The two settings the domain and the form spell differently.
 *
 * `Settings` nests the anchor week, so the domain calls these `weekAnchor.isoWeek` and
 * `weekAnchor.colour`; an HTML form is flat and `<input name>` cannot be a path, so the form calls
 * them `weekAnchorIsoWeek` and `weekAnchorColour`, and `settings.spec.ts` reaches both by those ids.
 * The other seven settings are spelled the same on both
 * sides and are not listed — `priceCap` among them, which is why a rejected cap marks its field
 * without an entry here.
 */
const INPUT_NAME: Record<string, string | undefined> = {
  "weekAnchor.isoWeek": "weekAnchorIsoWeek",
  "weekAnchor.colour": "weekAnchorColour",
};

/**
 * Everything the schema refused, in one answer.
 *
 * A settings path is already the input's own `name`, so there is nothing to translate — but a path
 * with no label is still dropped, and that is the same test every screen applies: a field nobody can
 * see is a tampered hidden input rather than a mistyped value, an error and not a refusal (§7). None
 * of the ten inputs is hidden, so today it drops nothing; it is the check that keeps that a fact
 * rather than an assumption when an eleventh arrives.
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
 * Turn a typed domain error into the answer the screen shows: the German sentence, the tier it is
 * said in, and — where the error names one — the field to mark.
 *
 * Every error carries the values that made it fail, so the message can name concrete numbers
 * without re-deriving them here.
 *
 * `field` is the **form input's** name, which is what the form needs in order to mark one — turning a
 * domain fact into what the browser can use is this adapter's whole job, and it already does it for
 * the sentence. Five of the seven settings are spelled the same on both sides; the two nested ones
 * are not, and {@link INPUT_NAME} is that translation.
 *
 * It used to be recovered in the browser instead, by comparing the finished sentence back against
 * `invalidSettings(<label>)`. That is a match on a German string: it held only while the labels
 * stayed distinct, and the first reworded one would have unmarked a field with nothing failing. The field belongs to the error and now travels with it.
 *
 * `QuotaBelowActiveCustomers` deliberately names no field: it is a collision between the new maximum
 * and the register's actual size, so marking `quotaN` alone would say the number is malformed when
 * it is merely too small. That refusal stays a summary by the button.
 *
 * The egg rule's two collisions — {@link DuplicateEggThreshold}, {@link EggsNotIncreasing} — name no
 * field for that same reason, and it is the whole division between the two refusal paths on this
 * screen. A malformed value in one row is that row's fault and marks that row's control; two rows
 * that contradict each other are neither one's fault, and marking one of them would say it is
 * malformed when the two are merely inconsistent. With no mark, the sentence has to name the
 * thresholds itself, which is what makes the rows findable.
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
    // The summary already names the field, so the mark under it stays the short generic words — the
    // same division `de.customers.errors.fieldRequired` keeps beside `missingField`. A mark that
    // named its own field would say it twice in one eyeful.
    //
    // `errorFields` answers for the eight flat settings and `settingsFormFieldLabel` for the egg
    // rule's rows, whose label is built from an index rather than looked up by a key.
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
 * Validate the form, append a new settings version — in force at once — and record the change in
 * the audit log.
 *
 * On any failure nothing is written — the use case checks every rule before it appends — and the
 * form comes back with a German explanation, the field to mark, and **the submission itself**, so
 * the valid edits made alongside the one that was refused are not thrown away with it.
 */
export async function saveSettings(
  _previous: SaveSettingsState,
  formData: FormData,
): Promise<SaveSettingsState> {
  const values = formValues(formData);
  // Not part of {@link SubmittedSettings}, and deliberately: the rows are React state in the
  // browser and survive `useActionState`'s reset on their own, so there is nothing here for a
  // refusal to hand back.
  const eggRows = eggRuleRows(formData);
  const parsed = settingsForm.safeParse({ ...values, eggRule: eggRows });
  if (!parsed.success) {
    // A refusal, not an error: every issue this schema raises is a value somebody typed into a field
    // that is still on screen — a quota that is not a whole number, a price that is not an amount.
    // The path is already the input's own name, so it marks the field without a translation.
    //
    // Every issue, not the first. This form holds three money boxes, and „Kein gültiger Betrag.“ by
    // the button named none of them: it was the summary that carried the problem while the mark
    // carried a generic „Ungültiger Wert.“, which is the two facts the wrong way round. The summary
    // names the fields and the marks carry the problems, as on every other form in the app.
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
        // In the order they were typed, not sorted here: sorting is part of constructing the value
        // (`createEggRule`), and an adapter that sorted first would be numbering its rows
        // differently from the screen that shows them.
        eggRule: form.eggRule,
      },
    });
  } catch (error: unknown) {
    return { status: "error", ...refusal(error, eggRows), values };
  }

  revalidatePath("/einstellungen");
  return { status: "saved", message: de.settings.saved };
}
