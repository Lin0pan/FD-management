"use client";

/**
 * The settings form.
 *
 * A client component only because the price table gains and loses rows as staff edit it; everything
 * else is a plain HTML form posting to the `saveSettings` server action. It holds no rules — the
 * values it shows come from the server, and every constraint on them is checked in the domain.
 */

import { useActionState, useState } from "react";
import { formatEuroAmount } from "@/domain/money";
import type { Settings } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { saveSettings } from "./actions";
import { initialSaveSettingsState } from "./save-settings-state";

/** One price-table row while it is being edited: text, because that is what a form field holds. */
interface PriceRowDraft {
  readonly key: number;
  readonly grownUps: string;
  readonly children: string;
  readonly euros: string;
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const COLOURS = ["RED", "BLUE"] as const;

function toDrafts(settings: Settings): PriceRowDraft[] {
  return settings.priceTable.map((row, index) => ({
    key: index,
    grownUps: String(row.grownUps),
    children: String(row.children),
    euros: formatEuroAmount(row.cents),
  }));
}

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

export function SettingsForm({
  settings,
  today,
}: {
  settings: Settings;
  today: string;
}): React.ReactElement {
  const [state, formAction, pending] = useActionState(saveSettings, initialSaveSettingsState);
  const [rows, setRows] = useState<PriceRowDraft[]>(() => toDrafts(settings));
  const [nextKey, setNextKey] = useState(() => settings.priceTable.length);

  function addRow(): void {
    setRows([...rows, { key: nextKey, grownUps: "1", children: "0", euros: "0,00" }]);
    setNextKey(nextKey + 1);
  }

  function removeRow(key: number): void {
    setRows(rows.filter((row) => row.key !== key));
  }

  function updateRow(key: number, patch: Partial<Omit<PriceRowDraft, "key">>): void {
    setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

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
        <h2 className="text-xl font-semibold">{de.settings.priceTable.heading}</h2>
        <p className="max-w-prose text-sm text-foreground/70">{de.settings.priceTable.hint}</p>
        <table className="w-full max-w-xl text-left">
          <thead>
            <tr className="text-sm text-foreground/70">
              <th scope="col" className="py-1">
                {de.settings.priceTable.grownUps}
              </th>
              <th scope="col" className="py-1">
                {de.settings.priceTable.children}
              </th>
              <th scope="col" className="py-1">
                {de.settings.priceTable.price}
              </th>
              <th scope="col" className="py-1">
                <span className="sr-only">{de.settings.priceTable.removeRow}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} data-testid="price-row">
                <td className="py-1 pr-2">
                  <input
                    className={fieldClass}
                    type="number"
                    min={0}
                    name="priceGrownUps"
                    aria-label={de.settings.priceTable.grownUps}
                    value={row.grownUps}
                    onChange={(event) => updateRow(row.key, { grownUps: event.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    className={fieldClass}
                    type="number"
                    min={0}
                    name="priceChildren"
                    aria-label={de.settings.priceTable.children}
                    value={row.children}
                    onChange={(event) => updateRow(row.key, { children: event.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    className={fieldClass}
                    type="text"
                    inputMode="decimal"
                    name="priceEuros"
                    aria-label={`${de.settings.priceTable.price} ${row.grownUps}/${row.children}`}
                    value={row.euros}
                    onChange={(event) => updateRow(row.key, { euros: event.target.value })}
                  />
                </td>
                <td className="py-1">
                  <button
                    type="button"
                    className="rounded border border-foreground/20 px-2 py-1 text-sm"
                    onClick={() => removeRow(row.key)}
                  >
                    {de.settings.priceTable.removeRow}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <button
            type="button"
            className="rounded border border-foreground/20 px-3 py-1 text-sm"
            onClick={addRow}
          >
            {de.settings.priceTable.addRow}
          </button>
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
