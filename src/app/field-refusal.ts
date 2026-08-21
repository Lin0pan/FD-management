/**
 * What a refused field is, and the two answers every form needs about one: *is this field marked*,
 * and *what does the marked control carry* (`docs/guideline/ui_styling_guide.md` §7).
 *
 * A plain module with no directive, so both halves of the round trip can import it: a `"use server"`
 * action needs {@link FieldRefusal} to say what it refused, and a client component needs
 * {@link problemAt} and {@link marking} to show it. Types are erased, and the two functions are pure
 * — nothing here reaches the DOM, which is what keeps the file out of `field-mark.tsx`'s `"use
 * client"` island.
 *
 * It exists because the mechanism was written twice before it was written once. `/kunden/neu` and
 * `/einstellungen` each grew their own — one carrying a list of fields with their own sentences, the
 * other a single field with a generic one — and the second copy is what let three further screens
 * ship with no marks at all, because there was nothing to reuse and no obvious place to look.
 *
 * Nothing here decides anything. *Which* fields a refusal names is the action's, translated from a
 * Zod path or a typed domain error; this only carries the answer across and puts it on an element.
 */

import { de } from "@/i18n/de";
import type { NoticeTier } from "./notice-tier";

/**
 * One field a refusal names, and what is wrong with it.
 *
 * The **form's** path, not the domain's: the domain says `address.street` and
 * `certificate.validUntil`, an HTML form calls those `street` and `certificateValidUntil`, and what
 * the browser can mark is an input. Translating one into the other is the action's job
 * (`kunden/neu/registration-input.ts`, `einstellungen/actions.ts`), exactly as it already is for the
 * sentence. Household rows keep the spelling both sides share — `householdMembers.1.birthDate`.
 */
export interface FieldRefusal {
  readonly path: string;
  /**
   * The few words shown under the control. Short on purpose: the field it belongs to is directly
   * above it, so it says what is wrong and not which field — that is the summary's job, which is
   * read by the button, far from the field it names.
   */
  readonly problem: string;
}

/**
 * A refusal as a screen reports it: the sentence by the button, the tier it is said in, and the
 * fields to mark.
 *
 * The three travel together because they are one answer to one refusal. Assembling them separately
 * is how the sentence and the mark come to disagree about which field failed.
 */
export interface FormRefusal {
  readonly message: string;
  readonly tier: NoticeTier;
  readonly fields?: ReadonlyArray<FieldRefusal>;
}

/**
 * The refused fields as one answer — or `lastWord` at the `error` tier where the refusal turned out
 * to name nothing anybody can see.
 *
 * `label` is the screen's own dictionary, and returning `null` from it is the test for *is this
 * field on screen?*. A path with no label is a field nobody can see, so it is a tampered hidden
 * input rather than a mistyped value — an error, not a refusal (§7). Callers filter on that before
 * they get here; this one only needs the words.
 *
 * `lastWord` is the caller's because the screens disagree about it: the registration says the intake
 * could not be saved, the record says the change could not be, the waiting list says the applicant
 * could not be added.
 *
 * The summary **names the fields** and the marks carry the problems, never the other way round. With
 * three money boxes on the settings screen or a day per household member on the registration, a
 * summary that said only what was wrong would name none of them, and the staff member reading it by
 * the button would not know how far up to look or how many times.
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
 * Matched on the path the action named, never on the sentence: a tier read back out of German is a
 * tier that changes when somebody fixes a comma (`notice-tier.ts`), and a *field* read back out of
 * one is worse — it would unmark a field the first time a label was reworded, with nothing failing
 * anywhere. Both screens that had a mechanism of their own started that way, and both had already
 * stopped by the time this was extracted.
 */
export function problemAt(
  fields: ReadonlyArray<FieldRefusal> | undefined,
  path: string,
): string | null {
  return fields?.find((field) => field.path === path)?.problem ?? null;
}

/**
 * What a refused control carries: the mark's id to be described by, the invalid state, and the path
 * the action named it with.
 *
 * `data-field` is that path — `street`, `householdMembers.1.birthDate` — and it is on the control so
 * that a form can find the first refused field again without rebuilding an id from a path. A
 * household's three inputs share a `name` and are told apart by `id`, and the record's editors
 * generate their ids with `useId` because two forms on one screen both hold a `firstName`; a path is
 * the only name both sides of the round trip agree on.
 *
 * It is always present, refused or not, so {@link useFocusFirstRefusal}'s query is the same on every
 * render.
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
 * How a household field is named on the wire — the spelling the domain, the schema and both
 * household tables share.
 *
 * Here rather than beside either table because there are two of them — the registration's and the
 * record's — reading the same three repeated inputs through the same `householdRows`. A second
 * spelling of this path is how a refusal starts marking the right row on one screen and no row on
 * the other, and nothing would fail.
 */
export function memberPath(index: number, part: MemberPart): string {
  return `householdMembers.${index}.${part}`;
}
