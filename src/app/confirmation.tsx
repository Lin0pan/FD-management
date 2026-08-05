/**
 * What the application says when something the staff member asked for has happened.
 *
 * One definition, because a meaning gets one colour (`accents.ts`): this was two byte-identical
 * private components in `/ausgabe`, and the registration confirmation would have been the third
 * copy — which is exactly how two screens come to paint the same fact two different shades.
 *
 * `role="status"` overrides the `role="alert"` the shadcn `Alert` hardcodes: a confirmation is not
 * an alarm, and a screen reader should hear it when it gets to it rather than be interrupted.
 * `text-foreground` overrides `AlertDescription`'s muted default — the sentence is the message here,
 * not a note under one.
 *
 * No `"use client"` and no hooks, so the record's server component and the counter's client
 * components can both render it — the same deliberate choice `stat.tsx` and `shell.ts` make.
 */

import { Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CONFIRMATION_ACCENT } from "./accents";

export function Confirmation({
  text,
  testId,
}: {
  text: string;
  /** Goes on the sentence, so a spec asserts the words rather than the box around them. */
  testId: string;
}): React.ReactElement {
  return (
    <Alert role="status" className={CONFIRMATION_ACCENT}>
      <Check className="text-green-700" />
      <AlertDescription data-testid={testId} className="max-w-prose text-foreground">
        {text}
      </AlertDescription>
    </Alert>
  );
}
