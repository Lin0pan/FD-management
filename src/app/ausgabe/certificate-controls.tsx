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
 */

import { useActionState } from "react";
import { de } from "@/i18n/de";
import { logReminder, recordRenewal } from "./actions";
import { initialReminderState, initialRenewalState } from "./serve-state";

function Confirmation({ text, testId }: { text: string; testId: string }): React.ReactElement {
  return (
    <p
      role="status"
      data-testid={testId}
      className="max-w-prose rounded border border-green-600/40 bg-green-600/10 px-3 py-2"
    >
      {text}
    </p>
  );
}

function Rejection({ message, testId }: { message: string; testId: string }): React.ReactElement {
  return (
    <p
      role="status"
      data-testid={testId}
      className="max-w-prose rounded border border-red-500/40 bg-red-500/10 px-3 py-2"
    >
      {message}
    </p>
  );
}

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
    <section data-testid="certificate-controls" className="flex flex-col gap-4">
      {renewalSaved ? (
        <Confirmation text={words.renewal.saved} testId="renewal-confirmation" />
      ) : null}

      {expired ? (
        <>
          <form action={remind} className="flex flex-col gap-2">
            <input type="hidden" name="customerId" value={customerId} />
            <div>
              <button
                type="submit"
                disabled={alreadyLogged || reminding}
                data-testid="reminder-button"
                className="rounded bg-amber-500 px-6 py-3 text-lg font-semibold text-black disabled:opacity-60"
              >
                {alreadyLogged ? words.reminder.loggedToday : words.reminder.submit}
              </button>
            </div>
            {reminderState.status === "logged" ? (
              <Confirmation
                text={words.reminder.confirmed(reminderState.count)}
                testId="reminder-confirmation"
              />
            ) : null}
            {reminderState.status === "error" ? (
              <Rejection message={reminderState.message} testId="reminder-error" />
            ) : null}
          </form>

          <form action={renew} className="flex flex-col gap-3">
            <input type="hidden" name="customerId" value={customerId} />
            <h3 className="text-lg font-semibold">{words.renewal.heading}</h3>
            <p className="max-w-prose text-foreground/70">{words.renewal.hint}</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-foreground/70">
                  {de.customers.fields.certificateType}
                </span>
                <input
                  type="text"
                  name="type"
                  required
                  data-testid="renewal-type"
                  className="rounded border border-foreground/20 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-foreground/70">
                  {de.customers.fields.certificateValidUntil}
                </span>
                <input
                  type="date"
                  name="validUntil"
                  required
                  data-testid="renewal-valid-until"
                  className="rounded border border-foreground/20 px-3 py-2"
                />
              </label>
              <button
                type="submit"
                disabled={renewing}
                data-testid="renewal-save"
                className="rounded border border-foreground/20 px-4 py-2 font-medium disabled:opacity-60"
              >
                {words.renewal.submit}
              </button>
            </div>
            {renewalState.status === "error" ? (
              <Rejection message={renewalState.message} testId="renewal-error" />
            ) : null}
          </form>
        </>
      ) : null}
    </section>
  );
}
