/**
 * What a refused field is, and the two answers every form needs about one: *is this field marked*,
 * and *what does the marked control carry* (`docs/guideline/ui_styling_guide.md` §7).
 *
 * **No directive**, so both halves of the round trip can import it: a `"use server"` action names
 * {@link FieldRefusal}, a client component reads {@link problemAt} and {@link marking}. Nothing here
 * reaches the DOM, which is what keeps it out of `field-mark.tsx`'s `"use client"` island.
 *
 * Nothing here decides anything: *which* fields a refusal names is the action's, translated from a
 * Zod path or a typed domain error.
 */

import { de } from "@/i18n/de";
import type { NoticeTier } from "./notice-tier";

/**
 * One field a refusal names, and what is wrong with it.
 *
 * The **form's** path, not the domain's — `street`, not `address.street` — because what the browser
 * can mark is an input; translating between them is the action's job. Household rows keep the
 * spelling both sides share.
 */
export interface FieldRefusal {
  readonly path: string;
  /**
   * The few words under the control. Short on purpose: the field is directly above, so this says what
   * is wrong and not which field — that is the summary's job, read by the button.
   */
  readonly problem: string;
}

/**
 * A refusal as a screen reports it. The three travel together because they are one answer:
 * assembling them separately is how the sentence and the mark come to disagree.
 */
export interface FormRefusal {
  readonly message: string;
  readonly tier: NoticeTier;
  readonly fields?: ReadonlyArray<FieldRefusal>;
}

/**
 * The refused fields as one answer — or `lastWord` at the `error` tier where the refusal named
 * nothing anybody can see (§7).
 *
 * The summary **names the fields** and the marks carry the problems, never the other way round: with
 * three money boxes or a day per household member, a summary saying only what was wrong would name
 * none of them, and the staff member by the button would not know how far up to look.
 *
 * `lastWord` is the caller's because the screens disagree about it — an intake that could not be
 * saved, a change, an applicant.
 */
export function summarise(
  fields: ReadonlyArray<FieldRefusal>,
  lastWord: string,
  label: (path: string) => string | null,
): FormRefusal {
  if (fields.length === 0) {
    return { message: lastWord, tier: "error" };
  }

  const labels = fields.map((field) => label(field.path) ?? field.path);
  const message =
    fields.length === 1
      ? de.forms.fieldProblem(labels[0], fields[0].problem)
      : de.forms.severalFieldProblems(labels);

  return { message, tier: "refusal", fields };
}

/**
 * The words to show under one field, or `null` while the last submission said nothing about it.
 *
 * Matched on the path the action named, never on the sentence: a field read back out of German
 * would unmark itself the first time a label was reworded, with nothing failing anywhere.
 */
export function problemAt(
  fields: ReadonlyArray<FieldRefusal> | undefined,
  path: string,
): string | null {
  return fields?.find((field) => field.path === path)?.problem ?? null;
}

/**
 * What a refused control carries: the mark's id, the invalid state, and the path the action named.
 *
 * `data-field` is on the control so a form can find the first refused field without rebuilding an id
 * from a path — a household's inputs share a `name` and the record's editors generate ids with
 * `useId`, so the path is the only name both sides of the round trip agree on. Always present,
 * refused or not, so {@link useFocusFirstRefusal}'s query is the same on every render.
 */
export function marking(
  path: string,
  id: string,
  problem: string | null,
): {
  "data-field": string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
} {
  return {
    "data-field": path,
    ...(problem === null ? {} : { "aria-invalid": true, "aria-describedby": `${id}-error` }),
  };
}

/** The three parts of a household row, and the `name` each of their inputs carries. */
export const MEMBER_INPUT = {
  firstName: "memberFirstName",
  lastName: "memberLastName",
  birthDate: "memberBirthDate",
} as const;

export type MemberPart = keyof typeof MEMBER_INPUT;

/**
 * How a household field is named on the wire — the spelling the domain, the schema and both household
 * tables share. Stated here rather than beside either table: a second spelling is how a refusal comes
 * to mark the right row on one screen and no row on the other, with nothing failing.
 */
export function memberPath(index: number, part: MemberPart): string {
  return `householdMembers.${index}.${part}`;
}
