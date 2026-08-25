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
import { FieldRejection, useFocusFirstRefusal } from "../field-mark";
import { marking, problemAt, type FieldRefusal } from "../field-refusal";
import { Notice } from "../notice";
import { selectClass } from "../select";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const COLOURS = ["RED", "BLUE"] as const;

/**
 * The field grid: twelve columns at `lg`, two at `sm`, one below — the same one `/kunden/neu` uses.
 *
 * Every field on this screen was 408px wide because all of them shared one `sm:grid-cols-2`, so a
 * box holding `1` promised as much room as one holding a sentence (§3.3). Below `lg` the spans stop
 * applying and each field takes one of two columns, which still puts a quota beside a price at
 * 800px.
 */
const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12";

/**
 * A field's two rows — the label and the control — laid on the grid's own tracks.
 *
 * Without this the row is ragged, because a German label is as long as it is and a narrow column
 * wraps it: measured at 1440, `Höchstzahl der Kunden (N)` took two lines in its slot while the
 * shorter label beside it took one, so the inputs of the first card started ten pixels apart. That
 * is the rag `docs/guideline/ui_styling_guide.md` §3 exists to prevent, and it turns up on every form
 * where the twelve columns are actually spent.
 *
 * `grid-rows-subgrid` is the fix rather than a `min-h-` guess: each field spans two of the parent's
 * rows and inherits them, so the label row is as tall as the tallest label in that row and every
 * control lands on one baseline — at any label length, in any language, without a magic number.
 * The alternative, bottom-aligning the controls with `mt-auto`, leaves a one-line label floating
 * 46px above its own box.
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
 * One field of the form, in a slot of the twelve-column grid.
 *
 * `<label htmlFor>` + `id` rather than the old nested `<label><span>`, which worked only by nesting
 * and left the accessibility snapshot with unnamed textboxes. The ids are the field names: four of
 * them are load-bearing (§7) and there is one form on this page, so there is nothing for `useId`
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
        // One grid row, two elements: the mark rides under the control rather than beside it, so
        // the subgrid still sees a single row and the labels above stay on one baseline.
        //
        // The mark carries the refusal's **own** words — „Keine ganze Zahl.“, „Kein gültiger
        // Betrag.“ — where it used to carry one generic „Ungültiger Wert.“ while the summary
        // carried the specific sentence. That was the two facts the wrong way round: with three
        // money boxes on this screen, „Kein gültiger Betrag.“ by the button named none of them,
        // and the mark that did know which box it sat under said nothing worth reading.
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
  // A rejected field's mark and its hint are both read out, in that order, and neither replaces the
  // other: the mark says the value is wrong, the hint says what the field means. `marking` writes
  // the mark's id, so the hint is prepended to whatever it produced rather than replacing it.
  const marks = marking(name, name, problem);
  const described = [describedBy, marks["aria-describedby"]]
    .filter((id): id is string => id !== undefined)
    .join(" ");

  return (
    <Field name={name} label={label} span={span} problem={problem}>
      <Input
        className={`${CONTROL_HEIGHT} tabular-nums`}
        // Stays text, not `type=number`: a German decimal comma is what staff type, and a number
        // input either refuses `2,50` or silently normalises it to a dot.
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
 * What the Maximalpreis field shows for a stored cap: the amount, or nothing at all.
 *
 * The `null` branch comes **before** the formatting, because `formatEuroAmount(0)` is `0,00` — a
 * cap of nothing, meaning every household collects for free. Losing this branch would print that
 * for *no cap* and the next save would store it, turning a removed limit into a free distribution
 * with nothing on screen to say so.
 */
function capValue(cap: Cents | null): string {
  return cap === null ? "" : formatEuroAmount(cap);
}

/**
 * What a field shows: what was typed if the last save was refused, otherwise what is stored.
 *
 * React resets an uncontrolled form once its action resolves — refusal as well as success — and the
 * reset restores each input from its `defaultValue`. With the stored settings as the only
 * `defaultValue`, a refusal rewound every field
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
  const form = useRef<HTMLFormElement>(null);

  const fields = refusedFields(state);
  const problem = (name: string): string | null => problemAt(fields, name);
  // New here: a refusal used to be stated by the button and left to be found. The first field it
  // names is 442px above that sentence, measured — further once several are named at once.
  useFocusFirstRefusal(fields, form);
  const shown = (name: keyof SubmittedSettings, stored: string): string =>
    shownValue(state, name, stored);

  return (
    <form ref={form} action={formAction} className="flex flex-col gap-6">
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
            // The one field on the screen whose *empty* state means something, so the sentence
            // saying what that is has to reach it. A sibling paragraph with `aria-describedby`
            // rather than a `<span>` inside the label: nested, it is concatenated into the
            // accessible name and announced as part of it (§3.7).
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
