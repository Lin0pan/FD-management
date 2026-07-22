"use client";

/**
 * The settings form.
 *
 * A client component because `useActionState` reports the outcome of the `saveSettings` server
 * action back into the page; otherwise it is a plain HTML form. It holds no rules — the values it
 * shows come from the server, and every constraint on them is checked in the domain.
 */

import { useActionState } from "react";
import { formatEuroAmount } from "@/domain/money";
import type { Cents } from "@/domain/money";
import type { Settings } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { saveSettings } from "./actions";
import { initialSaveSettingsState } from "./save-settings-state";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const COLOURS = ["RED", "BLUE"] as const;

const fieldClass =
  "w-full rounded border border-foreground/20 bg-transparent px-2 py-1 tabular-nums";

function NumberField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: number;
}): React.ReactElement {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-foreground/70">{label}</span>
      <input
        className={fieldClass}
        type="number"
        inputMode="numeric"
        min={0}
        name={name}
        id={name}
        defaultValue={value}
      />
    </label>
  );
}

/** A euro amount, shown as `2,50` and parsed back into whole cents by the server action. */
function EuroField({
  name,
  label,
  cents,
}: {
  name: string;
  label: string;
  cents: Cents;
}): React.ReactElement {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-foreground/70">{label}</span>
      <input
        className={fieldClass}
        type="text"
        inputMode="decimal"
        name={name}
        id={name}
        defaultValue={formatEuroAmount(cents)}
      />
    </label>
  );
}

export function SettingsForm({
  settings,
  today,
}: {
  settings: Settings;
  today: string;
}): React.ReactElement {
  const [state, formAction, pending] = useActionState(saveSettings, initialSaveSettingsState);

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{de.settings.currentHeading}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField name="quotaN" label={de.settings.fields.quotaN} value={settings.quotaN} />
          <NumberField
            name="portionsPerGrownUp"
            label={de.settings.fields.portionsPerGrownUp}
            value={settings.portionsPerGrownUp}
          />
          <NumberField
            name="portionsPerChild"
            label={de.settings.fields.portionsPerChild}
            value={settings.portionsPerChild}
          />
          <NumberField
            name="reminderThreshold"
            label={de.settings.fields.reminderThreshold}
            value={settings.reminderThreshold}
          />
          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground/70">
              {de.settings.fields.weekAnchorIsoWeek}
            </span>
            <input
              className={fieldClass}
              type="text"
              name="weekAnchorIsoWeek"
              id="weekAnchorIsoWeek"
              defaultValue={settings.weekAnchor.isoWeek}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground/70">
              {de.settings.fields.weekAnchorColour}
            </span>
            <select
              className={fieldClass}
              name="weekAnchorColour"
              id="weekAnchorColour"
              defaultValue={settings.weekAnchor.colour}
            >
              {COLOURS.map((colour) => (
                <option key={colour} value={colour}>
                  {de.settings.colours[colour]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground/70">
              {de.settings.fields.distributionWeekday}
            </span>
            <select
              className={fieldClass}
              name="distributionWeekday"
              id="distributionWeekday"
              defaultValue={settings.distributionWeekday}
            >
              {WEEKDAYS.map((weekday) => (
                <option key={weekday} value={weekday}>
                  {de.settings.weekdays[weekday]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{de.settings.prices.heading}</h2>
        <p className="max-w-prose text-sm text-foreground/70">{de.settings.prices.hint}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <EuroField
            name="pricePerGrownUp"
            label={de.settings.fields.pricePerGrownUp}
            cents={settings.pricePerGrownUp}
          />
          <EuroField
            name="pricePerChild"
            label={de.settings.fields.pricePerChild}
            cents={settings.pricePerChild}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground/70">{de.settings.effectiveFrom}</span>
            <input
              className={fieldClass}
              type="date"
              name="effectiveFrom"
              id="effectiveFrom"
              defaultValue={today}
            />
            <span className="text-xs text-foreground/60">{de.settings.effectiveFromHint}</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground/70">{de.settings.reason}</span>
            <input className={fieldClass} type="text" name="reason" id="reason" defaultValue="" />
            <span className="text-xs text-foreground/60">{de.settings.reasonHint}</span>
          </label>
        </div>

        {state.status !== "idle" && state.message !== undefined ? (
          <p
            role="status"
            data-testid={state.status === "error" ? "settings-error" : "settings-saved"}
            className={
              state.status === "error"
                ? "max-w-prose rounded border border-red-500/40 bg-red-500/10 px-3 py-2"
                : "max-w-prose rounded border border-green-600/40 bg-green-600/10 px-3 py-2"
            }
          >
            {state.message}
          </p>
        ) : null}

        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-60"
          >
            {pending ? de.settings.saving : de.settings.save}
          </button>
        </div>
      </section>
    </form>
  );
}
