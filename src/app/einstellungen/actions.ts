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
  InvalidEuroAmount,
  InvalidSettings,
  QuotaBelowActiveCustomers,
} from "@/domain/errors";
import { parseEuros } from "@/domain/money";
import { parseWeekColour } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { tierOf } from "../notice-tier";
import { settingsDeps } from "./deps";
import type { SaveSettingsState } from "./save-settings-state";

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
  portionsPerGrownUp: wholeNumber,
  portionsPerChild: wholeNumber,
  weekAnchorIsoWeek: z.string(),
  weekAnchorColour: weekColour,
  distributionWeekday: wholeNumber,
  reason: z.string(),
  pricePerGrownUp: euroAmount,
  pricePerChild: euroAmount,
});

function formValues(formData: FormData): Record<string, unknown> {
  const text = (name: string): string => String(formData.get(name) ?? "");
  return {
    quotaN: text("quotaN"),
    portionsPerGrownUp: text("portionsPerGrownUp"),
    portionsPerChild: text("portionsPerChild"),
    weekAnchorIsoWeek: text("weekAnchorIsoWeek"),
    weekAnchorColour: text("weekAnchorColour"),
    distributionWeekday: text("distributionWeekday"),
    reason: text("reason"),
    pricePerGrownUp: text("pricePerGrownUp"),
    pricePerChild: text("pricePerChild"),
  };
}

/**
 * The two settings the domain and the form spell differently.
 *
 * `Settings` nests the anchor week, so the domain calls these `weekAnchor.isoWeek` and
 * `weekAnchor.colour`; an HTML form is flat and `<input name>` cannot be a path, so the form calls
 * them `weekAnchorIsoWeek` and `weekAnchorColour` — the ids §7.2 of
 * `docs/ui_redesign_einstellungen.md` fixed. The other six settings are spelled the same on both
 * sides and are not listed.
 */
const INPUT_NAME: Record<string, string | undefined> = {
  "weekAnchor.isoWeek": "weekAnchorIsoWeek",
  "weekAnchor.colour": "weekAnchorColour",
};

/**
 * Turn a typed domain error into the answer the screen shows: the German sentence, the tier it is
 * said in, and — where the error names one — the field to mark.
 *
 * Every error carries the values that made it fail, so the message can name concrete numbers
 * without re-deriving them here.
 *
 * `field` is the **form input's** name, which is what the form needs in order to mark one — turning a
 * domain fact into what the browser can use is this adapter's whole job, and it already does it for
 * the sentence. Six of the eight settings are spelled the same on both sides; the two nested ones
 * are not, and {@link INPUT_NAME} is that translation.
 *
 * It used to be recovered in the browser instead, by comparing the finished sentence back against
 * `invalidSettings(<label>)`. That is a match on a German string: it held only while the eight
 * labels stayed distinct, and the first reworded one would have unmarked a field with nothing
 * failing. The field belongs to the error and now travels with it.
 *
 * `QuotaBelowActiveCustomers` deliberately names no field: it is a collision between the new maximum
 * and the register's actual size, so marking `quotaN` alone would say the number is malformed when
 * it is merely too small. That refusal stays a summary by the button.
 */
function refusal(error: unknown): Pick<SaveSettingsState, "message" | "tier" | "field"> {
  const tier = tierOf(error);
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
    return {
      message: de.settings.errors.invalidSettings(
        de.settings.errorFields[error.field] ?? error.field,
      ),
      tier,
      field: INPUT_NAME[error.field] ?? error.field,
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
 * form comes back with a German explanation.
 */
export async function saveSettings(
  _previous: SaveSettingsState,
  formData: FormData,
): Promise<SaveSettingsState> {
  const parsed = settingsForm.safeParse(formValues(formData));
  if (!parsed.success) {
    // A refusal, not an error: every issue this schema raises is a value somebody typed into a field
    // that is still on screen — a quota that is not a whole number, a price that is not an amount.
    // The path is already the input's own name, so it marks the field without a translation.
    const issue = parsed.error.issues[0];
    return {
      status: "error",
      message: issue.message,
      tier: "refusal",
      field: typeof issue.path[0] === "string" ? issue.path[0] : undefined,
    };
  }
  const form = parsed.data;

  try {
    await updateSettings(settingsDeps, {
      reason: form.reason,
      settings: {
        quotaN: form.quotaN,
        portionsPerGrownUp: form.portionsPerGrownUp,
        portionsPerChild: form.portionsPerChild,
        weekAnchor: { isoWeek: form.weekAnchorIsoWeek, colour: form.weekAnchorColour },
        distributionWeekday: form.distributionWeekday,
        pricePerGrownUp: form.pricePerGrownUp,
        pricePerChild: form.pricePerChild,
      },
    });
  } catch (error: unknown) {
    return { status: "error", ...refusal(error) };
  }

  revalidatePath("/einstellungen");
  return { status: "saved", message: de.settings.saved };
}
