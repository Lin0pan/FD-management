/**
 * How a customer's state is marked, shared by the customer list and the customer record.
 *
 * It is one table rather than one per screen because a meaning gets one colour across the whole
 * application (`docs/ui_styling_guide.md` §5): before this, `/kunden` gave a blocked household a
 * `destructive` badge and the record gave it a plain grey box, which is one fact painted two ways —
 * and the quieter one was on the screen you go to in order to find out what happened.
 *
 * No `"use client"`: nothing here is interactive, so both the list and the server-rendered record
 * may use it.
 */

import { Badge } from "@/components/ui/badge";
import type { CustomerStatus } from "@/domain/customer/customer";

/** What a state word wears, when it wears anything: a badge variant, a tint, or both. */
export interface Chrome {
  readonly variant?: "destructive" | "outline";
  readonly className?: string;
}

/**
 * The chrome for a status — `null` for the one that is simply normal.
 *
 * Nine records in ten are "aktiv", and a pill on each of them is texture rather than emphasis: it
 * says only "this row is normal". So the default state prints no chrome at all, and what is left is
 * a mark per exception.
 *
 * The word is never what is dropped: it stands in both cases, badge or no badge, because a colour is
 * a distinction only some of the staff can make (US-03.4) — and because the specs assert it.
 */
export const STATUS_CHROME: Record<CustomerStatus, Chrome | null> = {
  ACTIVE: null,
  BLOCKED: { variant: "destructive" },
  ARCHIVED: { variant: "outline" },
};

/**
 * A state word, badged only where the state is an exception.
 *
 * The testid sits on the `<span>` holding the word in both branches — never on the badge — so that
 * what a spec reads is the word itself whether or not there is chrome around it today.
 */
export function StateWord({
  word,
  testId,
  chrome,
}: {
  word: string;
  testId: string;
  chrome: Chrome | null;
}): React.ReactElement {
  const label = (
    <span data-testid={testId} className={chrome === null ? "text-muted-foreground" : undefined}>
      {word}
    </span>
  );
  return chrome === null ? (
    label
  ) : (
    <Badge variant={chrome.variant} className={chrome.className}>
      {label}
    </Badge>
  );
}
