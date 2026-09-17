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
 * **Nothing to prefill leaves the question unanswered**, not answered with "Sonstiges": the feature
 * exists to stop one notice being typed four ways, and a free-text box standing open by default is
 * an invitation to type a word the list already holds. So the control starts on an unchosen option
 * and `required` makes the browser ask. An *empty* configured list is the exception — there is
 * nothing to choose, so it starts on "Sonstiges" with the box open, which is exactly the plain text
 * input this control replaced.
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

/** The unchosen option's value — blank, which is the one answer the domain refuses. */
const UNCHOSEN = "";

/**
 * What the control starts showing: the configured option an incoming value folds to, else
 * "Sonstiges" carrying that value — and, with nothing incoming at all, the unchosen option, unless
 * there is nothing configured to choose from.
 */
function initialSelection(
  types: CertificateTypeList,
  incoming: string | undefined,
): { selected: string; other: string } {
  const value = incoming ?? "";
  const match = value === "" ? undefined : types.find((type) => foldName(type) === foldName(value));
  if (match !== undefined) {
    return { selected: match, other: "" };
  }
  if (value === "" && types.length > 0) {
    return { selected: UNCHOSEN, other: "" };
  }
  return { selected: CERTIFICATE_TYPE_OTHER, other: value };
}

/**
 * One option of the select, marked `defaultSelected` when it is the chosen one.
 *
 * That attribute is what keeps the choice standing through a save or a refusal: a native reset reads
 * the `selected` **attribute**, which React never sets for a controlled select, so with none marked
 * the browser rewinds to the first option. `number-control.tsx`'s radio states the argument in full.
 */
function TypeOption({
  value,
  label,
  selected,
}: {
  value: string;
  label: string;
  selected: string;
}): React.ReactElement {
  return (
    <option
      value={value}
      ref={(node) => {
        if (node !== null) {
          node.defaultSelected = value === selected;
        }
      }}
    >
      {label}
    </option>
  );
}

export function CertificateTypeField({
  types,
  height,
  id,
  className,
  initialValue,
  typeProblem,
  otherProblem,
  errorTestId,
}: {
  types: CertificateTypeList;
  /** The height of the boxes beside it on this screen — `h-9` only at the counter. */
  height: "h-8" | "h-9";
  /** The select's id and `data-testid` both — `RenewalFields`' own convention. */
  id: string;
  /**
   * Where the control sits on the screen around it: a grid span, or a width cap in a wrapped row —
   * the select is `w-full` and its content is DF's to type, so a row that does not cap it can be
   * pushed apart by one long Nachweis-Art.
   */
  className?: string;
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
    <div className={`flex flex-col gap-3${className === undefined ? "" : ` ${className}`}`}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className={typeProblem === null ? undefined : "text-destructive"}>
          {de.customers.fields.certificateType}
        </Label>
        <select
          id={id}
          name="certificateType"
          required
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
          {types.length > 0 ? (
            <TypeOption
              value={UNCHOSEN}
              label={de.customers.fields.certificateTypeUnchosen}
              selected={selected}
            />
          ) : null}
          {types.map((type) => (
            <TypeOption key={type} value={type} label={type} selected={selected} />
          ))}
          <TypeOption
            value={CERTIFICATE_TYPE_OTHER}
            label={de.customers.fields.certificateTypeOtherOption}
            selected={selected}
          />
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
