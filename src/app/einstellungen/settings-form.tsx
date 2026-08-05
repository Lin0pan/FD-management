"use client";

/**
 * The settings form.
 *
 * A client component because `useActionState` reports the outcome of the `saveSettings` server
 * action back into the page; otherwise it is a plain HTML form. It holds no rules — the values it
 * shows come from the server, and every constraint on them is checked in the domain.
 */

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatEuroAmount } from "@/domain/money";
import type { Cents } from "@/domain/money";
import type { Settings } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { saveSettings } from "./actions";
import { initialSaveSettingsState } from "./save-settings-state";
import type { SaveSettingsState } from "./save-settings-state";
import { Notice } from "../notice";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const COLOURS = ["RED", "BLUE"] as const;

/**
 * The field grid: twelve columns at `lg`, two at `sm`, one below — the same one `/kunden/neu` uses.
 *
 * Every field on this screen was 408px wide because all nine shared one `sm:grid-cols-2`, so a box
 * holding `1` promised as much room as one holding a sentence (§3.3). Below `lg` the spans stop
 * applying and each field takes one of two columns, which still puts a quota beside a portions
 * count at 800px.
 */
const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12";

/**
 * A field's two rows — the label and the control — laid on the grid's own tracks.
 *
 * Without this the row is ragged, because a German label is as long as it is and a narrow column
 * wraps it: measured at 1440, `Höchstzahl der Kunden (N)` takes two lines in its 163px slot and
 * `Portionen je Kind` one, so the five inputs of the first card would start at y=286 and y=296.
 * That is the defect `docs/ui_conversion_guide.md` records from `/kunden/[id]`, where one two-line
 * label put every row's first input 20px below its neighbours.
 *
 * `grid-rows-subgrid` is the fix rather than a `min-h-` guess: each field spans two of the parent's
 * rows and inherits them, so the label row is as tall as the tallest label in that row and every
 * control lands on one baseline — at any label length, in any language, without a magic number.
 * The alternative, bottom-aligning the controls with `mt-auto`, leaves a one-line label floating
 * 46px above its own box.
 */
const FIELD_ROWS = "grid grid-rows-subgrid row-span-2 gap-1.5";

/**
 * A native `<select>` wearing the same tokens and the same height as `Input`.
 *
 * The three selects stay native: Radix's `Select` is a `<button>` plus a portalled listbox, and
 * neither `selectOption` nor `toHaveValue` reaches it. Copied from `FILTER_SELECT` in
 * `kunden/page.tsx`, where it exists for the same reason.
 */
const SELECT =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors " +
  "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 " +
  "dark:bg-input/30";

/** One height for every control on the screen; `Input` and `Button` both default to `h-8` (§3.4). */
const CONTROL_HEIGHT = "h-9";

/**
 * Whether a rejection names this field.
 *
 * The action returns a sentence, not a field name, so the field is read back out of the sentence:
 * an `InvalidSettings` message is always `invalidSettings(<the field's German label>)`, and the
 * eight labels are distinct — `errorFields[x]` is the same string as `fields[x]` for every setting.
 *
 * Deliberately temporary. `docs/ui_redesign_einstellungen.md` §8 step 2 puts the field on
 * `SaveSettingsState` — which is what a per-field message needs anyway — and this goes with it.
 * It is here so that this commit changes no type and no action, which is what lets its green e2e
 * run mean what it says.
 */
function rejects(state: SaveSettingsState, label: string): boolean {
  return state.status === "error" && state.message === de.settings.errors.invalidSettings(label);
}

/**
 * One field of the form, in a slot of the twelve-column grid.
 *
 * `<label htmlFor>` + `id` rather than the old nested `<label><span>`, which worked only by nesting
 * and left the accessibility snapshot with unnamed textboxes. The ids are the field names: four of
 * them are load-bearing (§7.2) and there is one form on this page, so there is nothing for `useId`
 * to disambiguate.
 *
 * Exactly two children, always — the label and one control — because the two rows of `FIELD_ROWS`
 * are what keeps the row's baselines straight. A field that wants a hint under its control wraps
 * both in one element.
 */
function Field({
  name,
  label,
  span,
  invalid,
  children,
}: {
  name: string;
  label: string;
  /** Columns of twelve at `lg`. Below that the grid collapses and the span stops applying. */
  span: string;
  invalid: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={`${FIELD_ROWS} ${span}`}>
      <label
        htmlFor={name}
        className={`self-start text-sm font-medium ${invalid ? "text-destructive" : ""}`.trimEnd()}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/** A section of the form: one card, one real `<h2>` inside its title (guide trap 1). */
function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{heading}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function NumberField({
  name,
  label,
  span,
  value,
  invalid,
}: {
  name: string;
  label: string;
  span: string;
  value: number;
  invalid: boolean;
}): React.ReactElement {
  return (
    <Field name={name} label={label} span={span} invalid={invalid}>
      <Input
        className={`${CONTROL_HEIGHT} tabular-nums`}
        type="number"
        inputMode="numeric"
        min={0}
        name={name}
        id={name}
        defaultValue={value}
        aria-invalid={invalid ? true : undefined}
      />
    </Field>
  );
}

/** A euro amount, shown as `2,50` and parsed back into whole cents by the server action. */
function EuroField({
  name,
  label,
  span,
  cents,
  invalid,
}: {
  name: string;
  label: string;
  span: string;
  cents: Cents;
  invalid: boolean;
}): React.ReactElement {
  return (
    <Field name={name} label={label} span={span} invalid={invalid}>
      <Input
        className={`${CONTROL_HEIGHT} tabular-nums`}
        // Stays text, not `type=number`: a German decimal comma is what staff type, and a number
        // input either refuses `2,50` or silently normalises it to a dot.
        type="text"
        inputMode="decimal"
        name={name}
        id={name}
        defaultValue={formatEuroAmount(cents)}
        aria-invalid={invalid ? true : undefined}
      />
    </Field>
  );
}

export function SettingsForm({ settings }: { settings: Settings }): React.ReactElement {
  const [state, formAction, pending] = useActionState(saveSettings, initialSaveSettingsState);
  const invalid = (label: string): boolean => rejects(state, label);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Section heading={de.settings.amountsHeading}>
        <div className={GRID}>
          <NumberField
            name="quotaN"
            label={de.settings.fields.quotaN}
            span="lg:col-span-2"
            value={settings.quotaN}
            invalid={invalid(de.settings.fields.quotaN)}
          />
          <NumberField
            name="portionsPerGrownUp"
            label={de.settings.fields.portionsPerGrownUp}
            span="lg:col-span-2"
            value={settings.portionsPerGrownUp}
            invalid={invalid(de.settings.fields.portionsPerGrownUp)}
          />
          <NumberField
            name="portionsPerChild"
            label={de.settings.fields.portionsPerChild}
            span="lg:col-span-2"
            value={settings.portionsPerChild}
            invalid={invalid(de.settings.fields.portionsPerChild)}
          />
          <EuroField
            name="pricePerGrownUp"
            label={de.settings.fields.pricePerGrownUp}
            span="lg:col-span-3"
            cents={settings.pricePerGrownUp}
            invalid={invalid(de.settings.fields.pricePerGrownUp)}
          />
          <EuroField
            name="pricePerChild"
            label={de.settings.fields.pricePerChild}
            span="lg:col-span-3"
            cents={settings.pricePerChild}
            invalid={invalid(de.settings.fields.pricePerChild)}
          />
        </div>
        <p className="max-w-prose text-sm text-muted-foreground">{de.settings.prices.hint}</p>
      </Section>

      <Section heading={de.settings.rhythmHeading}>
        <div className={GRID}>
          <Field
            name="weekAnchorIsoWeek"
            label={de.settings.fields.weekAnchorIsoWeek}
            span="lg:col-span-3"
            invalid={invalid(de.settings.fields.weekAnchorIsoWeek)}
          >
            <Input
              className={`${CONTROL_HEIGHT} tabular-nums`}
              type="text"
              name="weekAnchorIsoWeek"
              id="weekAnchorIsoWeek"
              defaultValue={settings.weekAnchor.isoWeek}
              aria-invalid={invalid(de.settings.fields.weekAnchorIsoWeek) ? true : undefined}
            />
          </Field>
          <Field
            name="weekAnchorColour"
            label={de.settings.fields.weekAnchorColour}
            span="lg:col-span-3"
            invalid={invalid(de.settings.fields.weekAnchorColour)}
          >
            {/*
              No red or blue on this control. Here the group is a value being chosen, not a
              household's fact, and the tint is reserved for the latter (§6, US-03.4); the words
              `Rot` and `Blau` carry it.
            */}
            <select
              className={SELECT}
              name="weekAnchorColour"
              id="weekAnchorColour"
              defaultValue={settings.weekAnchor.colour}
              aria-invalid={invalid(de.settings.fields.weekAnchorColour) ? true : undefined}
            >
              {COLOURS.map((colour) => (
                <option key={colour} value={colour}>
                  {de.settings.colours[colour]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            name="distributionWeekday"
            label={de.settings.fields.distributionWeekday}
            span="lg:col-span-3"
            invalid={invalid(de.settings.fields.distributionWeekday)}
          >
            <select
              className={SELECT}
              name="distributionWeekday"
              id="distributionWeekday"
              defaultValue={settings.distributionWeekday}
              aria-invalid={invalid(de.settings.fields.distributionWeekday) ? true : undefined}
            >
              {WEEKDAYS.map((weekday) => (
                <option key={weekday} value={weekday}>
                  {de.settings.weekdays[weekday]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section heading={de.settings.changeHeading}>
        <div className={GRID}>
          <Field name="reason" label={de.settings.reason} span="lg:col-span-12" invalid={false}>
            <div className="flex flex-col gap-1.5">
              <Input
                className={CONTROL_HEIGHT}
                type="text"
                name="reason"
                id="reason"
                defaultValue=""
                // The hint is a sibling, not a `<span>` inside the label: nested, it was
                // concatenated into the field's accessible name and a screen reader announced a
                // 91-character sentence where four words belong (§3.7).
                aria-describedby="reason-hint"
              />
              <p id="reason-hint" className="text-xs text-muted-foreground">
                {de.settings.reasonHint}
              </p>
            </div>
          </Field>
        </div>

        {state.status !== "idle" && state.message !== undefined ? (
          <Notice
            tone={state.status === "error" ? "error" : "success"}
            text={state.message}
            testId={state.status === "error" ? "settings-error" : "settings-saved"}
          />
        ) : null}

        <div>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? de.settings.saving : de.settings.save}
          </Button>
        </div>
      </Section>
    </form>
  );
}
