"use client";

/**
 * The one control that asks for the Art des Nachweises (US-33.5) — a native `<select>` carrying the
 * configured types plus "Sonstiges", which reveals a free-text field rather than closing the list.
 * Used by all four screens that ask the question, so they cannot drift into four behaviours.
 *
 * Native for `select.ts`'s reason: Radix's select submits nothing inside a form and neither
 * `selectOption` nor `toHaveValue` reaches it.
 *
 * **Prefill never silently substitutes.** An incoming value that folds to a configured type selects
 * that option and shows the *configured* spelling; anything else selects "Sonstiges" with the
 * incoming value standing in the free-text field, unchanged. A type DF removed still arrives intact
 * — the fold match is `foldName`'s, the same comparison the vocabulary itself uses for a duplicate.
 *
 * The two wire names are fixed: `certificateType` (the select, so every existing refusal path
 * naming it still points at a control) and `certificateTypeOther` (the free text, unmounted — not
 * merely hidden — while a configured type is chosen, so its typed text is never submitted).
 */

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { foldName } from "@/domain/customer/nameSearch";
import type { CertificateTypeList } from "@/domain/policy/certificateTypes";
import { de } from "@/i18n/de";
import { CERTIFICATE_TYPE_OTHER } from "./certificate-type-resolver";
import { FieldRejection } from "./field-mark";
import { marking } from "./field-refusal";
import { selectClass } from "./select";

/**
 * What the control starts showing. `incoming` is `undefined` on a form with nothing to prefill (the
 * counter's renewal, first consumer) and an empty configured list folds nothing, so both collapse
 * into the same case as no match: "Sonstiges", open, carrying whatever came in — which is exactly
 * today's plain text input's behaviour.
 */
function initialSelection(
  types: CertificateTypeList,
  incoming: string | undefined,
): { selected: string; other: string } {
  const value = incoming ?? "";
  const match = value === "" ? undefined : types.find((type) => foldName(type) === foldName(value));
  return match === undefined
    ? { selected: CERTIFICATE_TYPE_OTHER, other: value }
    : { selected: match, other: "" };
}

export function CertificateTypeField({
  types,
  height,
  id,
  initialValue,
  typeProblem,
  otherProblem,
  errorTestId,
}: {
  types: CertificateTypeList;
  height: "h-8" | "h-9";
  /** The select's id and `data-testid` both — `RenewalFields`' own convention. */
  id: string;
  /** The value to prefill from, or `undefined` on a form with nothing to prefill. */
  initialValue?: string;
  /** The last refusal's problem for `certificateType`, or `null`. */
  typeProblem: string | null;
  /** The last refusal's problem for `certificateTypeOther`, or `null`. */
  otherProblem: string | null;
  /** The screen's one `…-error` testid, shared with every other field on the same form. */
  errorTestId: string;
}): React.ReactElement {
  const [initial] = useState(() => initialSelection(types, initialValue));
  const [selected, setSelected] = useState(initial.selected);
  const [other, setOther] = useState(initial.other);
  const otherRef = useRef<HTMLInputElement>(null);
  const otherId = `${id}-other`;
  const showingOther = selected === CERTIFICATE_TYPE_OTHER;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className={typeProblem === null ? undefined : "text-destructive"}>
          {de.customers.fields.certificateType}
        </Label>
        <select
          id={id}
          name="certificateType"
          value={selected}
          onChange={(event) => {
            const next = event.target.value;
            setSelected(next);
            if (next === CERTIFICATE_TYPE_OTHER) {
              // The field itself hasn't rendered yet on this pass — it mounts from `showingOther`
              // turning true, which happens after this handler returns.
              requestAnimationFrame(() => otherRef.current?.focus());
            }
          }}
          className={selectClass(height)}
          data-testid={id}
          {...marking("certificateType", id, typeProblem)}
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
          <option value={CERTIFICATE_TYPE_OTHER}>
            {de.customers.fields.certificateTypeOtherOption}
          </option>
        </select>
        {typeProblem === null ? null : (
          <FieldRejection id={id} problem={typeProblem} testId={errorTestId} />
        )}
      </div>
      {showingOther ? (
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor={otherId}
            className={otherProblem === null ? undefined : "text-destructive"}
          >
            {de.customers.fields.certificateTypeOther}
          </Label>
          <Input
            ref={otherRef}
            type="text"
            id={otherId}
            name="certificateTypeOther"
            required
            value={other}
            onChange={(event) => setOther(event.target.value)}
            data-testid={otherId}
            className={height}
            {...marking("certificateTypeOther", otherId, otherProblem)}
          />
          {otherProblem === null ? null : (
            <FieldRejection id={otherId} problem={otherProblem} testId={errorTestId} />
          )}
        </div>
      ) : null}
    </div>
  );
}
