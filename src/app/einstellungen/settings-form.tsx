"use client";

/**
 * The settings form.
 *
 * A client component because `useActionState` reports the outcome of the `saveSettings` server
 * action back into the page; otherwise it is a plain HTML form. It holds no rules — the values it
 * shows come from the server, and every constraint on them is checked in the domain.
 */

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type Cents, formatEuroAmount } from "@/domain/money";
import type { Settings } from "@/domain/policy/settings";
import { de } from "@/i18n/de";
import { saveSettings } from "./actions";
import { EggRuleTable } from "./egg-rule-table";
import { initialSaveSettingsState } from "./save-settings-state";
import type { SaveSettingsState, SubmittedSettings } from "./save-settings-state";
import { guardEnter } from "../enter-guard";
import { FieldRejection, useFocusFirstRefusal } from "../field-mark";
import { marking, problemAt, type FieldRefusal } from "../field-refusal";
import { Notice } from "../notice";
import { selectClass } from "../select";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const COLOURS = ["RED", "BLUE"] as const;

/**
 * The field grid, the same one `/kunden/neu` uses: a field's width is a promise about what it wants,
 * so a box holding `1` must not take as much room as one holding a sentence (§3.3).
 */
const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12";

/**
 * A field's two rows laid on the grid's own tracks. Without it the row is ragged: a German label that
 * wraps in a narrow column starts its input ten pixels below its neighbour's
 * (`docs/guideline/ui_styling_guide.md` §3).
 *
 * `grid-rows-subgrid` rather than a `min-h-` guess: each field inherits two of the parent's rows, so
 * the label row is as tall as the tallest label in it at any length, without a magic number.
 * Bottom-aligning with `mt-auto` instead leaves a one-line label floating above its own box.
 */
const FIELD_ROWS = "grid grid-rows-subgrid row-span-2 gap-1.5";

/** One height for every control on the screen; `Input` and `Button` both default to `h-8` (§3.4). */
const CONTROL_HEIGHT = "h-9";

/** The three selects, at this screen's control height. */
const SELECT = selectClass(CONTROL_HEIGHT);

/** The fields the last submission refused, or nothing while it refused none. */
function refusedFields(state: SaveSettingsState): ReadonlyArray<FieldRefusal> | undefined {
  return state.status === "error" ? state.fields : undefined;
}

/**
 * One field of the form, in a slot of the twelve-column grid. `<label htmlFor>` + `id`, so the
 * accessibility snapshot has named textboxes; the ids are the field names, four of them load-bearing
 * (§7), and one form on the page leaves nothing for `useId` to disambiguate.
 *
 * **Exactly two children, always** — the label and one control — because `FIELD_ROWS`' two rows are
 * what keeps the baselines straight. A field wanting a hint wraps both in one element.
 */
function Field({
  name,
  label,
  span,
  problem,
  children,
}: {
  name: string;
  label: string;
  /** Columns of twelve at `lg`. Below that the grid collapses and the span stops applying. */
  span: string;
  /** The words to show under the control, or `null` while nothing is wrong with it. */
  problem: string | null;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={`${FIELD_ROWS} ${span}`}>
      <label
        htmlFor={name}
        className={`self-start text-sm font-medium ${problem === null ? "" : "text-destructive"}`.trimEnd()}
      >
        {label}
      </label>
      {problem === null ? (
        children
      ) : (
        // One grid row, two elements: the mark rides under the control, so the subgrid still sees a
        // single row and the labels above stay on one baseline.
        //
        // The mark carries the refusal's **own** words: with three money boxes on this screen, a
        // generic „Ungültiger Wert.“ under the field and the specific sentence by the button would be
        // the two facts the wrong way round.
        <div className="flex flex-col gap-1">
          {children}
          <FieldRejection id={name} problem={problem} testId="settings-field-error" />
        </div>
      )}
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
  problem,
}: {
  name: string;
  label: string;
  span: string;
  /** Already a string, because a refused save shows back what was typed — see {@link shownValue}. */
  value: string;
  problem: string | null;
}): React.ReactElement {
  return (
    <Field name={name} label={label} span={span} problem={problem}>
      <Input
        className={`${CONTROL_HEIGHT} tabular-nums`}
        type="number"
        inputMode="numeric"
        min={0}
        name={name}
        id={name}
        defaultValue={value}
        {...marking(name, name, problem)}
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
  problem,
  describedBy,
}: {
  name: string;
  label: string;
  span: string;
  /** Already formatted, or the text that was refused — see {@link shownValue}. */
  value: string;
  problem: string | null;
  /** The id of a hint this field is explained by, where one explains this field in particular. */
  describedBy?: string;
}): React.ReactElement {
  // Mark and hint are both read out, in that order: the mark says the value is wrong, the hint what
  // the field means. `marking` writes the mark's id, so the hint is prepended to it.
  const marks = marking(name, name, problem);
  const described = [describedBy, marks["aria-describedby"]]
    .filter((id): id is string => id !== undefined)
    .join(" ");

  return (
    <Field name={name} label={label} span={span} problem={problem}>
      <Input
        className={`${CONTROL_HEIGHT} tabular-nums`}
        // Text, not `type=number`: a number input either refuses the German `2,50` or silently
        // normalises the comma to a dot.
        type="text"
        inputMode="decimal"
        name={name}
        id={name}
        defaultValue={value}
        {...marks}
        aria-describedby={described === "" ? undefined : described}
      />
    </Field>
  );
}

/**
 * What the Maximalpreis field shows for a stored cap. The `null` branch comes **before** the
 * formatting, because `formatEuroAmount(0)` is `0,00` — a cap meaning every household collects for
 * free. Losing it would print that for *no cap*, and the next save would store it.
 */
function capValue(cap: Cents | null): string {
  return cap === null ? "" : formatEuroAmount(cap);
}

/**
 * What a field shows: what was typed if the last save was refused, otherwise what is stored.
 *
 * **React resets an uncontrolled form once its action resolves**, refusal as well as success, and the
 * reset restores each input from its `defaultValue`. With only the stored settings there, a refusal
 * rewound every field — four edits typed, one invalid, four lost, and a field holding `240` then
 * marked as an invalid value.
 *
 * `state.values` is present only on a refusal, so the fallback needs no condition. `reason` reaches
 * this too, with `""` stored, so it clears after a save and survives a refusal: a refusal is the
 * middle of a change rather than the end of one. (§4.2d has it clearing in both cases; this is the
 * one departure.)
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
  const form = useRef<HTMLFormElement>(null);

  const fields = refusedFields(state);
  const problem = (name: string): string | null => problemAt(fields, name);
  // The first field a refusal names is 442px above the sentence by the button, measured — further
  // once several are named at once.
  useFocusFirstRefusal(fields, form);
  const shown = (name: keyof SubmittedSettings, stored: string): string =>
    shownValue(state, name, stored);

  return (
    <form ref={form} action={formAction} onKeyDown={guardEnter} className="flex flex-col gap-6">
      <Section heading={de.settings.amountsHeading}>
        <div className={GRID}>
          <NumberField
            name="quotaN"
            label={de.settings.fields.quotaN}
            span="lg:col-span-3"
            value={shown("quotaN", String(settings.quotaN))}
            problem={problem("quotaN")}
          />
          <EuroField
            name="pricePerGrownUp"
            label={de.settings.fields.pricePerGrownUp}
            span="lg:col-span-3"
            value={shown("pricePerGrownUp", formatEuroAmount(settings.pricePerGrownUp))}
            problem={problem("pricePerGrownUp")}
          />
          <EuroField
            name="pricePerChild"
            label={de.settings.fields.pricePerChild}
            span="lg:col-span-3"
            value={shown("pricePerChild", formatEuroAmount(settings.pricePerChild))}
            problem={problem("pricePerChild")}
          />
          <EuroField
            name="priceCap"
            label={de.settings.fields.priceCap}
            span="lg:col-span-3"
            // Empty is a configuration here, not an unfilled field — see {@link capValue}.
            value={shown("priceCap", capValue(settings.priceCap))}
            problem={problem("priceCap")}
            // The one field whose *empty* state means something, so the sentence saying what has to
            // reach it. A sibling with `aria-describedby` rather than a `<span>` inside the label,
            // which would be concatenated into the accessible name (§3.7).
            describedBy="prices-hint"
          />
        </div>
        <p id="prices-hint" className="max-w-prose text-sm text-muted-foreground">
          {de.settings.prices.hint}
        </p>
      </Section>

      {/* Between the amounts and the rhythm, where it belongs by subject: it is a *what a household
          gets* setting. Its own card rather than a field in the one above, because a repeating table
          with add and remove controls has no slot in a twelve-column subgrid (§3.3). */}
      <Section heading={de.settings.eggs.heading}>
        <EggRuleTable rule={settings.eggRule} problem={problem} />
      </Section>

      <Section heading={de.settings.rhythmHeading}>
        <div className={GRID}>
          <Field
            name="weekAnchorIsoWeek"
            label={de.settings.fields.weekAnchorIsoWeek}
            span="lg:col-span-3"
            problem={problem("weekAnchorIsoWeek")}
          >
            <Input
              className={`${CONTROL_HEIGHT} tabular-nums`}
              type="text"
              name="weekAnchorIsoWeek"
              id="weekAnchorIsoWeek"
              defaultValue={shown("weekAnchorIsoWeek", settings.weekAnchor.isoWeek)}
              {...marking("weekAnchorIsoWeek", "weekAnchorIsoWeek", problem("weekAnchorIsoWeek"))}
            />
          </Field>
          <Field
            name="weekAnchorColour"
            label={de.settings.fields.weekAnchorColour}
            span="lg:col-span-3"
            problem={problem("weekAnchorColour")}
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
              {...marking("weekAnchorColour", "weekAnchorColour", problem("weekAnchorColour"))}
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
            problem={problem("distributionWeekday")}
          >
            <select
              className={SELECT}
              name="distributionWeekday"
              id="distributionWeekday"
              defaultValue={shown("distributionWeekday", String(settings.distributionWeekday))}
              {...marking(
                "distributionWeekday",
                "distributionWeekday",
                problem("distributionWeekday"),
              )}
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
          <Field name="reason" label={de.settings.reason} span="lg:col-span-12" problem={null}>
            <div className="flex flex-col gap-1.5">
              <Input
                className={CONTROL_HEIGHT}
                type="text"
                name="reason"
                id="reason"
                // `""` as the stored value, so this clears after a save and survives a refusal —
                // {@link shownValue} says why.
                defaultValue={shown("reason", "")}
                // A sibling, not a nested `<span>`, which would put a 91-character sentence into the
                // field's accessible name (§3.7).
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
            // A refused save is amber, not red: nothing is broken. `state.tier` is decided from the
            // typed error on the server, never re-read from this sentence (`notice-tier.ts`).
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
