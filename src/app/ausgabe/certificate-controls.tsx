"use client";

/**
 * The counter's certificate actions — logging today's reminder and recording a renewed certificate,
 * both without leaving the screen (tasks/prd-us-06-certificate-reminder.md §US-06.4).
 *
 * A client component for the same reason `ServeControls` is one: `useActionState` reports the
 * server's answer — the new count, or the refusal — back beside the button that asked. It holds no
 * rules: whether there is anything to remind about and whether today's reminder already exists are
 * decided behind `logReminder`; the disabled button here is a courtesy that repeats what the store
 * already knows via `reminderLoggedToday`, not the guard (FR-5).
 *
 * The section renders only while the certificate is expired — plus one extra render after a renewal
 * is saved, when the component (still mounted, because the page always renders it for a resolved
 * customer) shows the confirmation naming the reset count of 0 while the revalidated page around it
 * already shows the certificate as valid again.
 *
 * The renewal's two fields are **controlled**, so a refusal leaves what was typed where it is: a
 * `gültig bis` in the past is refused because it is a typo — most likely a wrong year — and the whole
 * point is to correct four characters rather than retype the certificate's type beside it. Nothing
 * clears them, and nothing needs to: the form is inside `expired`, and a successful renewal makes the
 * certificate valid, so it unmounts with the state it held (`docs/ui_redesign_einstellungen.md`
 * §4.2d, the same finding on a different screen).
 */

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { de } from "@/i18n/de";
import { logReminder, recordRenewal } from "./actions";
import { initialReminderState, initialRenewalState } from "./serve-state";
import { Confirmation, Notice } from "../notice";
import { useNoticeSlot } from "../notice-board";

export function CertificateControls({
  customerId,
  expired,
  reminderLoggedToday,
}: {
  customerId: number;
  /** Whether the verdict found the certificate expired — the only state with anything to act on. */
  expired: boolean;
  /** Whether today's reminder is already on file, so the action stays disabled across re-lookups. */
  reminderLoggedToday: boolean;
}): React.ReactElement | null {
  const [reminderState, remind, reminding] = useActionState(logReminder, initialReminderState);
  const [renewalState, renew, renewing] = useActionState(recordRenewal, initialRenewalState);
  const [type, setType] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const showingReminder = useNoticeSlot(
    "reminder",
    reminderState.status === "idle" ? null : reminderState,
  );
  const showingRenewal = useNoticeSlot(
    "renewal",
    renewalState.status === "idle" ? null : renewalState,
  );

  const words = de.distribution.certificate;
  const renewalSaved = renewalState.status === "saved";

  // After a successful renewal the revalidated page reports the certificate valid again; staying
  // mounted for that render keeps the confirmation — with its reset count of 0 — on screen.
  if (!expired && !renewalSaved) {
    return null;
  }

  // Disabled for the rest of the day: the store says a reminder exists (survives any re-lookup), or
  // this very submission just logged one and the revalidated page has not streamed back in yet.
  const alreadyLogged = reminderLoggedToday || reminderState.status === "logged";

  return (
    <Card data-testid="certificate-controls">
      <CardHeader>
        <CardTitle className="text-lg">
          <h2>{words.heading}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {showingRenewal && renewalSaved ? (
          <Confirmation text={words.renewal.saved} testId="renewal-confirmation" />
        ) : null}

        {expired ? (
          <>
            {/* Still a real form around the button: the reminder is a write, and the e2e submits it
                through `closest("form").requestSubmit()`. */}
            <form action={remind} className="flex flex-col gap-3">
              <input type="hidden" name="customerId" value={customerId} />
              <div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={alreadyLogged || reminding}
                  data-testid="reminder-button"
                  className="h-12 bg-amber-500 px-6 text-lg font-semibold text-black hover:bg-amber-600"
                >
                  {alreadyLogged ? words.reminder.loggedToday : words.reminder.submit}
                </Button>
              </div>
              {showingReminder && reminderState.status === "logged" ? (
                <Confirmation
                  text={words.reminder.confirmed(reminderState.count)}
                  testId="reminder-confirmation"
                />
              ) : null}
              {showingReminder && reminderState.status === "error" ? (
                <Notice
                  tone={reminderState.tier}
                  text={reminderState.message}
                  testId="reminder-error"
                />
              ) : null}
            </form>

            <form action={renew} className="flex flex-col gap-3 border-t pt-6">
              <input type="hidden" name="customerId" value={customerId} />
              <h3 className="font-heading text-base font-medium">{words.renewal.heading}</h3>
              <p className="max-w-prose text-sm text-muted-foreground">{words.renewal.hint}</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="renewal-type">{de.customers.fields.certificateType}</Label>
                  <Input
                    type="text"
                    id="renewal-type"
                    name="type"
                    required
                    value={type}
                    onChange={(event) => setType(event.target.value)}
                    data-testid="renewal-type"
                    className="h-9 w-64"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="renewal-valid-until">
                    {de.customers.fields.certificateValidUntil}
                  </Label>
                  <Input
                    type="date"
                    id="renewal-valid-until"
                    name="validUntil"
                    required
                    value={validUntil}
                    onChange={(event) => setValidUntil(event.target.value)}
                    data-testid="renewal-valid-until"
                    className="h-9 w-44"
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={renewing}
                  data-testid="renewal-save"
                  className="h-9"
                >
                  {words.renewal.submit}
                </Button>
              </div>
              {showingRenewal && renewalState.status === "error" ? (
                <Notice
                  tone={renewalState.tier}
                  text={renewalState.message}
                  testId="renewal-error"
                />
              ) : null}
            </form>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
