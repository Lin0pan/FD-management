"use client";

/**
 * The egg rule on the settings screen (tasks/prd-us-28-egg-allowance.md §US-28.7) — the staircase of
 * thresholds DF hand eggs out by, added to and taken apart by staff rather than by a developer.
 *
 * A card of its own rather than a ninth field in „Mengen und Preise“: a repeating table with add and
 * remove controls does not belong in that card's twelve-column subgrid, whose whole job is keeping
 * single fields on one baseline (`docs/guideline/ui_styling_guide.md` §3.3).
 *
 * It holds no rule. Which orders are legal — no two rows at the same threshold, every step awarding
 * strictly more than the one below — is `createEggRule`'s, and re-checking any of it here would be a
 * second answer that the save could disagree with. What is here is a list of typed strings and the
 * marks a refusal put on them.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EggRule } from "@/domain/policy/eggs";
import { de } from "@/i18n/de";
import { FieldRejection } from "../field-mark";
import { marking } from "../field-refusal";

/** One row of the rule as the form holds it: the raw strings, exactly as they were typed. */
interface EggRow {
  readonly minPersons: string;
  readonly eggs: string;
}

const EMPTY_ROW: EggRow = { minPersons: "", eggs: "" };

/** The two parts of a row, and the `name` each of their inputs carries. */
const EGG_INPUT = {
  minPersons: "eggThreshold",
  eggs: "eggCount",
} as const;

type EggPart = keyof typeof EGG_INPUT;

/**
 * How one control of the rule is named on the wire — the spelling the form, the schema and the
 * domain share, so a refusal marks the row it was raised about.
 *
 * `createEggRule` throws `eggRule.<index>.minPersons` with the index of the row **as it was typed**,
 * and `actions.ts` puts a dropped blank row's positions back before the path reaches the browser.
 * Both ends therefore mean the same row: the one on screen.
 */
function eggPath(index: number, part: EggPart): string {
  return `eggRule.${index}.${part}`;
}

/**
 * One cell of the table: the control, and the mark under it when that field was refused.
 *
 * Two fields repeating per row is tabular data, so the field names are said once in the column
 * headings — but a column heading names a column and not a cell, so each input keeps its full name
 * as `aria-label` and nothing a screen reader hears is lost. That name is the dictionary's, the same
 * string a refusal points at from the summary by the button.
 *
 * The cells are top-aligned, for the household table's reason: a mark makes one cell taller than its
 * neighbour, and without it the two controls of a refused row would sit at different heights.
 */
function EggCell({
  index,
  part,
  value,
  onChange,
  problem,
}: {
  index: number;
  part: EggPart;
  value: string;
  onChange: (value: string) => void;
  problem: string | null;
}): React.ReactElement {
  const name = EGG_INPUT[part];
  // Not `useId`: the mark's `aria-describedby` has to name an element, and a stable id per row and
  // part is both readable in a snapshot and unique on a page carrying one of these tables.
  const id = `${name}-${index}`;

  return (
    <TableCell className="align-top">
      <div className="flex flex-col gap-1">
        <Input
          className="h-9 tabular-nums"
          type="number"
          inputMode="numeric"
          min={0}
          name={name}
          id={id}
          aria-label={de.settings.eggs.fieldLabel(index + 1, part)}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...marking(eggPath(index, part), id, problem)}
        />
        {problem === null ? null : (
          <FieldRejection id={id} problem={problem} testId="settings-field-error" />
        )}
      </div>
    </TableCell>
  );
}

export function EggRuleTable({
  rule,
  problem,
}: {
  /** The rule in force, already in threshold order — `createEggRule` sorted it. */
  rule: EggRule;
  /** The words the last submission put under one control, by the path it named it with. */
  problem: (path: string) => string | null;
}): React.ReactElement {
  // Controlled rows in `useState`, the household editor's mechanism and for its reason:
  // `useActionState` resets an uncontrolled form when the action resolves — refusal as well as
  // success — and a refused save must not silently rewind the rows that were typed.
  //
  // Because they are React state and survive that reset, they need **no** echo through
  // `SubmittedSettings`, unlike the eight uncontrolled fields around them. The asymmetry is the
  // point rather than an oversight: `values` exists to put back what a reset would otherwise
  // delete, and nothing here is reset.
  const [rows, setRows] = useState<ReadonlyArray<EggRow>>(() =>
    rule.map((row) => ({ minPersons: String(row.minPersons), eggs: String(row.eggs) })),
  );

  const words = de.settings.eggs;

  function updateRow(index: number, patch: Partial<EggRow>): void {
    setRows(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 ? (
        // No rows is a legitimate setting — nobody receives eggs — and a table with a heading and
        // nothing under it cannot be told apart from one that failed to render. So it says so.
        <p data-testid="egg-rule-empty" className="max-w-prose text-sm text-muted-foreground">
          {words.empty}
        </p>
      ) : (
        // The rows are shown in threshold order **as stored**, and are never re-sorted while
        // somebody is typing into them — that would move the row under the cursor. The domain
        // sorts, the save settles the order, and the reloaded screen shows the sorted result.
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{words.thresholdColumn}</TableHead>
              <TableHead>{words.eggsColumn}</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              // Addressed by position: a half-typed row has no threshold yet, so there is no
              // identity of its own to key on.
              <TableRow key={index} data-testid="egg-rule-row" className="hover:bg-transparent">
                <EggCell
                  index={index}
                  part="minPersons"
                  value={row.minPersons}
                  onChange={(minPersons) => updateRow(index, { minPersons })}
                  problem={problem(eggPath(index, "minPersons"))}
                />
                <EggCell
                  index={index}
                  part="eggs"
                  value={row.eggs}
                  onChange={(eggs) => updateRow(index, { eggs })}
                  problem={problem(eggPath(index, "eggs"))}
                />
                <TableCell className="align-top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid={`remove-egg-row-${index}`}
                    onClick={() => setRows(rows.filter((_row, position) => position !== index))}
                  >
                    {words.removeRow}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="add-egg-row"
          onClick={() => setRows([...rows, EMPTY_ROW])}
        >
          {words.addRow}
        </Button>
      </div>
    </div>
  );
}
