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
  RetroactiveSettingsVersion,
} from "@/domain/errors";
import { parseEuros } from "@/domain/money";
import { parseWeekColour } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
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

/** The `<input type="date">` value, read as midnight UTC to match how versions are stored. */
const isoDate = z.string().transform((value, ctx): Date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: de.settings.errors.notADate });
    return z.NEVER;
  }
  return new Date(`${value}T00:00:00.000Z`);
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
  reminderThreshold: wholeNumber,
  weekAnchorIsoWeek: z.string(),
  weekAnchorColour: weekColour,
  distributionWeekday: wholeNumber,
  effectiveFrom: isoDate,
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
    reminderThreshold: text("reminderThreshold"),
    weekAnchorIsoWeek: text("weekAnchorIsoWeek"),
    weekAnchorColour: text("weekAnchorColour"),
    distributionWeekday: text("distributionWeekday"),
    effectiveFrom: text("effectiveFrom"),
    reason: text("reason"),
    pricePerGrownUp: text("pricePerGrownUp"),
    pricePerChild: text("pricePerChild"),
  };
}

/** German dates in error messages, so the screen never quotes an ISO timestamp at staff. */
function germanDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

/**
 * Turn a typed domain error into the German sentence the screen shows.
 *
 * Every error carries the values that made it fail, so the message can name concrete numbers
 * without re-deriving them here.
 */
function germanMessage(error: unknown): string {
  if (error instanceof QuotaBelowActiveCustomers) {
    return de.settings.errors.quotaBelowActiveCustomers(error.quotaN, error.activeCustomers);
  }
  if (error instanceof RetroactiveSettingsVersion) {
    return de.settings.errors.retroactiveVersion(
      germanDate(error.effectiveFrom),
      germanDate(error.latestEffectiveFrom),
    );
  }
  if (error instanceof InvalidEuroAmount) {
    return de.settings.errors.invalidAmount(error.text);
  }
  if (error instanceof InvalidSettings) {
    return de.settings.errors.invalidSettings(de.settings.errorFields[error.field] ?? error.field);
  }
  if (error instanceof DomainError && error.code === "MissingAuditReason") {
    return de.settings.errors.missingReason;
  }
  if (error instanceof DomainError && error.code === "NoSettingsInForce") {
    return de.settings.errors.noSettings;
  }
  return de.settings.errors.unknown;
}

/**
 * Validate the form, append a new settings version and record the change in the audit log.
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
    return { status: "error", message: parsed.error.issues[0].message };
  }
  const form = parsed.data;

  try {
    await updateSettings(settingsDeps, {
      effectiveFrom: form.effectiveFrom,
      reason: form.reason,
      settings: {
        quotaN: form.quotaN,
        portionsPerGrownUp: form.portionsPerGrownUp,
        portionsPerChild: form.portionsPerChild,
        reminderThreshold: form.reminderThreshold,
        weekAnchor: { isoWeek: form.weekAnchorIsoWeek, colour: form.weekAnchorColour },
        distributionWeekday: form.distributionWeekday,
        pricePerGrownUp: form.pricePerGrownUp,
        pricePerChild: form.pricePerChild,
      },
    });
  } catch (error: unknown) {
    return { status: "error", message: germanMessage(error) };
  }

  revalidatePath("/einstellungen");
  return { status: "saved", message: de.settings.saved };
}
