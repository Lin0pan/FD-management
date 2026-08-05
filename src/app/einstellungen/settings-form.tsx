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
import type { Settings } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { saveSettings } from "./actions";
import { initialSaveSettingsState } from "./save-settings-state";
import type { SaveSettingsState, SubmittedSettings } from "./save-settings-state";
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
 * `state.field` is the input's own `name`, put there by the action from the typed error
 * (`actions.ts`). This used to read the field back out of the finished German sentence, by comparing
 * `state.message` against `invalidSettings(<label>)` — its own comment called that deliberately
 * temporary, and it was: the match held only while the eight labels stayed distinct, so the first
 * reworded label would have quietly stopped marking a field with nothing failing anywhere.
 */
function rejects(state: SaveSettingsState, name: string): boolean {
  return state.status === "error" && state.field === name;
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
 * both in one element, which is what a rejected field does with its mark.
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
      {invalid ? (
        // One grid row, two elements: the mark rides under the control rather than beside it, so
        // the subgrid still sees a single row and the labels above stay on one baseline.
        <div className="flex flex-col gap-1">
          {children}
          <FieldRejection name={name} />
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * The mark under a rejected input (`docs/ui_redesign_einstellungen.md` §4.2c).
 *
 * The summary notice by the button is 442px from the field it names, which is what §3.2 measured
 * and what made a rejected save a hunt. This is the other end of that: the words at the field, the
 * `aria-invalid` border and the reddened label pointing at it, and `aria-describedby` so a screen
 * reader reads the two together instead of leaving the sentence to be found by eye.
 *
 * It carries no `settings-error` test id. That one stays on the summary, which is the element
 * holding the sentence naming the field — `settings.spec.ts` asserts its exact text, and one
 * `settings-error` per screen is what keeps that assertion unambiguous (§7.5).
 */
function FieldRejection({ name }: { name: string }): React.ReactElement {
  return (
    <p id={`${name}-error`} data-testid="settings-field-error" className="text-sm text-destructive">
      {de.settings.errors.invalidValue}
    </p>
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
  /** Already a string, because a refused save shows back what was typed — see {@link shownValue}. */
  value: string;
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
        aria-describedby={invalid ? `${name}-error` : undefined}
      />
    </Field>
  );
}

/** A euro amount, shown as `2,50` and parsed back into whole cents by the server action. */
function EuroField({
  name,
  label,
  span,
  value,
  invalid,
}: {
  name: string;
  label: string;
  span: string;
  /** Already formatted, or the text that was refused — see {@link shownValue}. */
  value: string;
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
        defaultValue={value}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? `${name}-error` : undefined}
      />
    </Field>
  );
}

/**
 * What a field shows: what was typed if the last save was refused, otherwise what is stored.
 *
 * This is the whole of `docs/ui_redesign_einstellungen.md` §4.2d. React resets an uncontrolled form
 * once its action resolves — refusal as well as success — and the reset restores each input from its
 * `defaultValue`. With the stored settings as the only `defaultValue`, a refusal rewound every field
 * to what the database said: four edits typed, one of them invalid, **four lost**, and the screen
 * then marking a field that held `240` and calling it an invalid value. Neither half of that is
 * survivable on its own; together they are why a rejected save meant retyping the whole change from
 * memory.
 *
 * `state.values` is present only on a refusal, so the fallback does the right thing without a
 * condition: after a save there is nothing to override with, and the reset lands on the freshly
 * revalidated figures — which is what it should do, and what it already did.
 *
 * `reason` reaches this too, with `""` as its stored value, so it clears after a save and survives a
 * refusal. §4.2d has it clearing in both cases; that is the one place this departs from the document,
 * and the argument is that a refusal is not the end of a change but the middle of one — the sentence
 * still describes the edit being made, and the next thing the staff member does is fix a field and
 * press the same button. Clearing after a *save* is not in question: a reason describes one change
 * and must never be carried into the next.
 */
function shownValue(
  state: SaveSettingsState,
  name: keyof SubmittedSettings,
  stored: string,
): string {
  return state.values?.[name] ?? stored;
}

export function SettingsForm({ settings }: { settings: Settings }): React.ReactElement {
  const [state, formAction, pending] = useActionState(saveSettings, initialSaveSettingsState);
  const invalid = (name: string): boolean => rejects(state, name);
  const shown = (name: keyof SubmittedSettings, stored: string): string =>
    shownValue(state, name, stored);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Section heading={de.settings.amountsHeading}>
        <div className={GRID}>
          <NumberField
            name="quotaN"
            label={de.settings.fields.quotaN}
            span="lg:col-span-2"
            value={shown("quotaN", String(settings.quotaN))}
            invalid={invalid("quotaN")}
          />
          <NumberField
            name="portionsPerGrownUp"
            label={de.settings.fields.portionsPerGrownUp}
            span="lg:col-span-2"
            value={shown("portionsPerGrownUp", String(settings.portionsPerGrownUp))}
            invalid={invalid("portionsPerGrownUp")}
          />
          <NumberField
            name="portionsPerChild"
            label={de.settings.fields.portionsPerChild}
            span="lg:col-span-2"
            value={shown("portionsPerChild", String(settings.portionsPerChild))}
            invalid={invalid("portionsPerChild")}
          />
          <EuroField
            name="pricePerGrownUp"
            label={de.settings.fields.pricePerGrownUp}
            span="lg:col-span-3"
            value={shown("pricePerGrownUp", formatEuroAmount(settings.pricePerGrownUp))}
            invalid={invalid("pricePerGrownUp")}
          />
          <EuroField
            name="pricePerChild"
            label={de.settings.fields.pricePerChild}
            span="lg:col-span-3"
            value={shown("pricePerChild", formatEuroAmount(settings.pricePerChild))}
            invalid={invalid("pricePerChild")}
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
            invalid={invalid("weekAnchorIsoWeek")}
          >
            <Input
              className={`${CONTROL_HEIGHT} tabular-nums`}
              type="text"
              name="weekAnchorIsoWeek"
              id="weekAnchorIsoWeek"
              defaultValue={shown("weekAnchorIsoWeek", settings.weekAnchor.isoWeek)}
              aria-invalid={invalid("weekAnchorIsoWeek") ? true : undefined}
              aria-describedby={
                invalid("weekAnchorIsoWeek") ? "weekAnchorIsoWeek-error" : undefined
              }
            />
          </Field>
          <Field
            name="weekAnchorColour"
            label={de.settings.fields.weekAnchorColour}
            span="lg:col-span-3"
            invalid={invalid("weekAnchorColour")}
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
              defaultValue={shown("weekAnchorColour", settings.weekAnchor.colour)}
              aria-invalid={invalid("weekAnchorColour") ? true : undefined}
              aria-describedby={invalid("weekAnchorColour") ? "weekAnchorColour-error" : undefined}
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
            invalid={invalid("distributionWeekday")}
          >
            <select
              className={SELECT}
              name="distributionWeekday"
              id="distributionWeekday"
              defaultValue={shown("distributionWeekday", String(settings.distributionWeekday))}
              aria-invalid={invalid("distributionWeekday") ? true : undefined}
              aria-describedby={
                invalid("distributionWeekday") ? "distributionWeekday-error" : undefined
              }
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
                // `""` as the stored value, so this clears after a save and survives a refusal —
                // see {@link shownValue} for why the two differ.
                defaultValue={shown("reason", "")}
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
            // A refused save is amber, not red: nothing is broken, a value needs fixing and the
            // field it names is marked. `state.tier` is decided from the typed error on the server
            // and cannot be re-read from this sentence (`notice-tier.ts`).
            tone={state.status === "error" ? (state.tier ?? "error") : "success"}
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
