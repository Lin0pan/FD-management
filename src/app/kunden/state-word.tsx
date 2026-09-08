/**
 * How a customer's state is marked, shared by the customer list and the record — one table rather
 * than one per screen, because a meaning gets one colour application-wide
 * (`docs/guideline/ui_styling_guide.md` §5).
 */

import { Badge } from "@/components/ui/badge";
import type { CustomerStatus } from "@/domain/customer/customer";

/** What a state word wears, when it wears anything: a badge variant, a tint, or both. */
export interface Chrome {
  readonly variant?: "destructive" | "outline";
  readonly className?: string;
}

/**
 * The chrome for a status — `null` for the one that is simply normal. Nine records in ten are
 * „aktiv“, and a pill on each is texture rather than emphasis, so what is left is a mark per
 * exception. **The word is never what is dropped** (US-03.4).
 */
export const STATUS_CHROME: Record<CustomerStatus, Chrome | null> = {
  ACTIVE: null,
  BLOCKED: { variant: "destructive" },
  ARCHIVED: { variant: "outline" },
};

/**
 * A state word, badged only where the state is an exception. The testid sits on the `<span>` holding
 * the word in both branches, so a spec reads the word rather than today's chrome.
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
