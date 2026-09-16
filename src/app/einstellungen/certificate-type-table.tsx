"use client";

/**
 * The Nachweis-Art vocabulary on the settings screen (US-33.4) — its own card and its own `<form>`,
 * outside the policy form: the list is not a policy version (ADR-019), so saving it must not append a
 * `SettingsVersion`.
 *
 * It holds no rule: which lists are legal is `createCertificateTypeList`'s. Re-checking a duplicate or
 * a length here would be a second answer the save could disagree with.
 */

import { useActionState, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { de } from "@/i18n/de";
import { saveCertificateTypes } from "./actions";
import { initialSaveCertificateTypesState } from "./save-certificate-types-state";
import { guardEnter } from "../enter-guard";
import { FieldRejection, useFocusFirstRefusal } from "../field-mark";
import { marking, problemAt } from "../field-refusal";
import { Notice } from "../notice";

/** The `name` every row's input carries — one field per row, unlike the egg rule's two. */
const INPUT_NAME = "certificateTypeLabel";

/**
 * How a row is named on the wire — the spelling `createCertificateTypeList`'s thrown index and
 * `actions.ts`'s dropped-row bookkeeping both share.
 */
function certificateTypePath(index: number): string {
  return `certificateTypes.${index}.label`;
}

/** One cell: the control, and the mark under it when the row was refused. */
function CertificateTypeCell({
  index,
  value,
  onChange,
  problem,
}: {
  index: number;
  value: string;
  onChange: (value: string) => void;
  problem: string | null;
}): React.ReactElement {
  // Not `useId`: the mark's `aria-describedby` has to name an element, and a stable id per row is
  // readable in a snapshot.
  const id = `${INPUT_NAME}-${index}`;

  return (
    <TableCell className="align-top">
      <div className="flex flex-col gap-1">
        <Input
          className="h-9"
          name={INPUT_NAME}
          id={id}
          aria-label={de.settings.certificateTypes.fieldLabel(index + 1)}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...marking(certificateTypePath(index), id, problem)}
        />
        {problem === null ? null : (
          <FieldRejection id={id} problem={problem} testId="settings-field-error" />
        )}
      </div>
    </TableCell>
  );
}

export function CertificateTypeTable({
  types,
}: {
  /** The configured labels, already sorted by folded spelling — `createCertificateTypeList`'s. */
  types: ReadonlyArray<string>;
}): React.ReactElement {
  const [state, formAction, pending] = useActionState(
    saveCertificateTypes,
    initialSaveCertificateTypesState,
  );
  const form = useRef<HTMLFormElement>(null);

  // Controlled rows in `useState`, `EggRuleTable`'s mechanism and for its reason: React resets an
  // uncontrolled form when the action resolves, and a refused save must not rewind what was typed.
  const [rows, setRows] = useState<ReadonlyArray<string>>(types);

  const fields = state.status === "error" ? state.fields : undefined;
  const problem = (path: string): string | null => problemAt(fields, path);
  useFocusFirstRefusal(fields, form);

  const words = de.settings.certificateTypes;

  function updateRow(index: number, value: string): void {
    setRows(rows.map((row, position) => (position === index ? value : row)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{words.heading}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form ref={form} action={formAction} onKeyDown={guardEnter} className="flex flex-col gap-4">
          {rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{words.column}</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  // Addressed by position: a half-typed row has no label to key on.
                  <TableRow
                    key={index}
                    data-testid="certificate-type-row"
                    className="hover:bg-transparent"
                  >
                    <CertificateTypeCell
                      index={index}
                      value={row}
                      onChange={(value) => updateRow(index, value)}
                      problem={problem(certificateTypePath(index))}
                    />
                    <TableCell className="align-top">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={words.removeRow}
                        data-testid={`remove-certificate-type-row-${index}`}
                        onClick={() => setRows(rows.filter((_row, position) => position !== index))}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="add-certificate-type-row"
              onClick={() => setRows([...rows, ""])}
            >
              <Plus aria-hidden="true" data-icon="inline-start" />
              {words.addRow}
            </Button>
          </div>

          <p className="max-w-prose text-sm text-muted-foreground">{words.hint}</p>

          {state.status !== "idle" && state.message !== undefined ? (
            <Notice
              tone={state.status === "error" ? (state.tier ?? "error") : "success"}
              text={state.message}
              testId={
                state.status === "error" ? "certificate-types-error" : "certificate-types-saved"
              }
            />
          ) : null}

          <div>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? words.saving : words.save}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
