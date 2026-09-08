"use client";

/**
 * The egg rule on the settings screen (`tasks/prd-us-28-egg-allowance.md` §US-28.7) — a card of its
 * own rather than a ninth field in „Mengen und Preise“, whose twelve-column subgrid exists to keep
 * single fields on one baseline (`docs/guideline/ui_styling_guide.md` §3.3).
 *
 * It holds no rule: which staircases are legal is `createEggRule`'s, and re-checking any of it here
 * would be a second answer the save could disagree with.
 */

import { useState } from "react";
import { Plus, X } from "lucide-react";
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
 * How one control of the rule is named on the wire — the spelling the form, the schema and the domain
 * share. `createEggRule` throws with the index of the row **as it was typed**, and `actions.ts` puts
 * a dropped blank row's positions back, so both ends mean the row on screen.
 */
function eggPath(index: number, part: EggPart): string {
  return `eggRule.${index}.${part}`;
}

/**
 * One cell of the table: the control, and the mark under it when the field was refused.
 *
 * The names are said once in the column headings, but a heading names a column and not a cell — so
 * each input keeps its full name as `aria-label`, the same string a refusal points at from the
 * summary. Top-aligned for the household table's reason: a mark makes one cell taller.
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
  // part is readable in a snapshot and unique on a page carrying one of these tables.
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
  // Controlled rows in `useState`, the household editor's mechanism and for its reason: React resets
  // an uncontrolled form when the action resolves, and a refused save must not rewind what was typed.
  //
  // Being React state, they need **no** echo through `SubmittedSettings`, unlike the eight
  // uncontrolled fields around them — `values` exists to put back what a reset would delete.
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
        // No rows is a legitimate setting, and a table with a heading and nothing under it cannot be
        // told from one that failed to render.
        <p data-testid="egg-rule-empty" className="max-w-prose text-sm text-muted-foreground">
          {words.empty}
        </p>
      ) : (
        // Threshold order **as stored**, never re-sorted while somebody is typing into them: that
        // would move the row under the cursor. The domain sorts and the reloaded screen shows it.
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
              // Addressed by position: a half-typed row has no threshold to key on.
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
                  {/* The label moves to `aria-label` rather than going: this column's `<TableHead>`
                      is empty by design, so the label is the control's only name (§9). `X` and not
                      `Trash` — at the moment of the click this drops a row from an unsaved form,
                      and on this table it is not a deletion in any sense until the settings save. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={words.removeRow}
                    data-testid={`remove-egg-row-${index}`}
                    onClick={() => setRows(rows.filter((_row, position) => position !== index))}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div>
        {/* Solitary rather than repeated, so it keeps its words — what makes „Zeile entfernen" noise
            is that it stacks down the column, and there is only ever one of these. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="add-egg-row"
          onClick={() => setRows([...rows, EMPTY_ROW])}
        >
          <Plus aria-hidden="true" data-icon="inline-start" />
          {words.addRow}
        </Button>
      </div>
    </div>
  );
}
