"use client";

/**
 * The mask's row 4 (US-41.6, US-06.4). The action states live in `CertificateProvider`, above the
 * status slot their answers go to; the reminder chip repeats `reminderLoggedInSession`, it is not
 * the guard (FR-5).
 */

import { Check, ChevronDown } from "lucide-react";
import { createContext, useActionState, useContext, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import type { CertificateState } from "@/domain/customer/certificate";
import type { CertificateTypeList } from "@/domain/policy/certificateTypes";
import { de } from "@/i18n/de";
import { cn } from "@/lib/utils";
import { CONFIRMATION_ACCENT } from "../accents";
import { CertificateTypeField } from "../certificate-type-field";
import { FieldRejection, useFocusFirstRefusal } from "../field-mark";
import { marking, problemAt } from "../field-refusal";
import { CERTIFICATE_CHROME } from "../kunden/customer-cells";
import { StateWord } from "../kunden/state-word";
import { Confirmation, Notice } from "../notice";
import { useNoticeSlot } from "../notice-board";
import { logReminder, recordRenewal } from "./actions";
import { initialReminderState, initialRenewalState } from "./serve-state";
import type { ReminderState, RenewalState } from "./serve-state";
import { SLOT_NOTICE } from "./slot-notice";

interface CertificateContext {
  readonly reminderState: ReminderState;
  readonly remind: (formData: FormData) => void;
  readonly reminding: boolean;
  readonly renewalState: RenewalState;
  readonly renew: (formData: FormData) => void;
  readonly renewing: boolean;
  readonly renewalOpen: boolean;
  readonly toggleRenewal: () => void;
  /** The fields the last refusal *since the form opened* named — an older one marks nothing. */
  readonly renewalFields: RenewalRefusal;
  readonly showingReminder: boolean;
  readonly showingRenewal: boolean;
}

type RenewalRefusal = Extract<RenewalState, { status: "error" }>["fields"];

const Context = createContext<CertificateContext | null>(null);

function useCertificate(): CertificateContext {
  const context = useContext(Context);
  if (context === null) {
    throw new TypeError("the counter's certificate row rendered outside CertificateProvider");
  }
  return context;
}

/**
 * Holds the reminder's and the renewal's action states. **Keyed by the page on the customer**, so an
 * answer about one household cannot survive into the next lookup; within one customer the state rides
 * out revalidation, which is what keeps „Nachweis gespeichert“ up once the certificate reads valid.
 */
export function CertificateProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [reminderState, remind, reminding] = useActionState(logReminder, initialReminderState);
  const [renewalState, renew, renewing] = useActionState(recordRenewal, initialRenewalState);
  const [renewalOpen, setRenewalOpen] = useState(false);
  const [answered, setAnswered] = useState(renewalState);
  const [atOpening, setAtOpening] = useState(renewalState);

  // A saved renewal closes the form (adjusting state during render, not in an effect).
  if (renewalState !== answered) {
    setAnswered(renewalState);
    if (renewalState.status === "saved") {
      setRenewalOpen(false);
    }
  }

  const toggleRenewal = (): void => {
    setAtOpening(renewalState);
    setRenewalOpen(!renewalOpen);
  };
  const renewalFields =
    renewalState !== atOpening && renewalState.status === "error" ? renewalState.fields : undefined;

  const showingReminder = useNoticeSlot(
    "reminder",
    reminderState.status === "idle" ? null : reminderState,
  );
  const showingRenewal = useNoticeSlot(
    "renewal",
    renewalState.status === "idle" ? null : renewalState,
  );

  return (
    <Context.Provider
      value={{
        reminderState,
        remind,
        reminding,
        renewalState,
        renew,
        renewing,
        renewalOpen,
        toggleRenewal,
        renewalFields,
        showingReminder,
        showingRenewal,
      }}
    >
      {children}
    </Context.Provider>
  );
}

/**
 * The reminder's or the renewal's answer for the status slot, or `null`. A logged reminder is not
 * among them — its button turns into a chip in place. `null` outside the provider, where there is no
 * household to answer about.
 */
export function useCertificateAnswer(): React.ReactElement | null {
  const context = useContext(Context);
  if (context === null) {
    return null;
  }
  const { reminderState, renewalState, showingReminder, showingRenewal } = context;
  if (showingRenewal && renewalState.status === "saved") {
    return (
      <Confirmation
        text={de.distribution.certificate.renewal.saved}
        testId="renewal-confirmation"
        className={SLOT_NOTICE}
      />
    );
  }
  if (showingRenewal && renewalState.status === "error") {
    return (
      <Notice
        tone={renewalState.tier}
        text={renewalState.message}
        testId="renewal-error"
        className={SLOT_NOTICE}
      />
    );
  }
  if (showingReminder && reminderState.status === "error") {
    return (
      <Notice
        tone={reminderState.tier}
        text={reminderState.message}
        testId="reminder-error"
        className={SLOT_NOTICE}
      />
    );
  }
  return null;
}

/** A label over a value, the row's one shape. */
function Fact({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** The renewal form's id, which „Neuer Nachweis“ controls. One mask on the page, so one form. */
const RENEWAL_FORM_ID = "counter-renewal-form";

const VALUE = "text-base font-medium tabular-nums";
const SMALL_BUTTON = "h-7 text-[13px]";

/** Everything row 4 shows, already in German where the server formats it (Berlin, not the browser). */
export interface CertificateRowProps {
  readonly customerId: number;
  /** „12.10.2026“, „heute, 15:42 Uhr“ or „noch keine“. */
  readonly lastHandout: string;
  readonly consecutiveNoShows: number;
  readonly certificateType: string;
  readonly certificateValidUntil: string;
  readonly certificateState: CertificateState;
  /**
   * `certificateExpired`, and deliberately not the verdict kind: an already-served household answers
   * ALREADY_SERVED, which outranks the expired one — reading the actions off the verdict would hide
   * them on the very re-lookup a correction starts with (US-32).
   */
  readonly expired: boolean;
  readonly reminderCount: number;
  readonly reminderLoggedInSession: boolean;
  /** The configured Nachweis-Arten (US-33.5). */
  readonly certificateTypes: CertificateTypeList;
}

export function CertificateRow(props: CertificateRowProps): React.ReactElement {
  const { renewalOpen } = useCertificate();
  const words = de.distribution.counter.mask;
  const chrome = CERTIFICATE_CHROME[props.certificateState];
  const open = props.expired && renewalOpen;

  return (
    // 2/3/3/4 rather than four equal quarters: the reminder's two buttons and the renewal's four
    // controls do not fit a quarter at 1440 px, and a date is the narrowest fact in the row.
    <div className="grid grid-cols-1 items-start gap-x-6 gap-y-3 border-t pt-3.5 md:grid-cols-12">
      <Fact label={words.lastHandout} className="md:col-span-2">
        <span data-testid="counter-last-handout" className={VALUE}>
          {props.lastHandout}
        </span>
        {/* The second archiving trigger (US-10.4): a number and nothing more — no threshold, no
            warning (PRD §5). */}
        {props.consecutiveNoShows === 0 ? null : (
          <span data-testid="counter-no-shows" className="text-xs text-muted-foreground">
            {words.noShows(props.consecutiveNoShows)}
          </span>
        )}
      </Fact>
      {open ? (
        <RenewalForm customerId={props.customerId} certificateTypes={props.certificateTypes} />
      ) : (
        <>
          <Fact label={de.distribution.certificate.heading} className="md:col-span-3">
            <span data-testid="counter-certificate-type" className={cn(VALUE, "break-words")}>
              {props.certificateType}
            </span>
          </Fact>
          <Fact label={de.customers.fields.certificateValidUntil} className="md:col-span-3">
            <span className="flex flex-wrap items-center gap-2">
              <span data-testid="counter-certificate-valid-until" className={VALUE}>
                {props.certificateValidUntil}
              </span>
              {/* The Kundenliste's tints; a valid certificate wears nothing. */}
              {chrome === null ? null : (
                <StateWord
                  word={de.customerList.certificateStates[props.certificateState]}
                  testId="counter-certificate-state"
                  chrome={chrome}
                />
              )}
            </span>
          </Fact>
        </>
      )}
      <Fact label={de.distribution.counter.details.reminderCount} className="md:col-span-4">
        <span className="flex flex-wrap items-center gap-2">
          <span data-testid="counter-reminder-count" className={VALUE}>
            {props.reminderCount}
          </span>
          {props.expired ? (
            <ReminderActions
              customerId={props.customerId}
              loggedInSession={props.reminderLoggedInSession}
            />
          ) : null}
        </span>
      </Fact>
    </div>
  );
}

/** „Erinnerung erfassen“ — a chip once spent — and the toggle that opens the renewal. */
function ReminderActions({
  customerId,
  loggedInSession,
}: {
  customerId: number;
  loggedInSession: boolean;
}): React.ReactElement {
  const { reminderState, remind, reminding, renewalOpen, toggleRenewal } = useCertificate();
  const words = de.distribution.certificate;
  // Spent for the rest of the session: the store says so, or this submission just logged it and the
  // revalidated page has not streamed back yet.
  const logged = loggedInSession || reminderState.status === "logged";

  return (
    <>
      {/* A form around the chip too: a tab opened before the reminder was logged still submits it,
          and `reminders.spec.ts` proves the server refuses that through `requestSubmit()`. */}
      <form action={remind}>
        <input type="hidden" name="customerId" value={customerId} />
        {logged ? (
          <span
            data-testid="reminder-confirmation"
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[13px] font-medium",
              CONFIRMATION_ACCENT,
            )}
          >
            <Check aria-hidden="true" className="size-3.5" />
            {words.reminder.logged}
          </span>
        ) : (
          <Button
            type="submit"
            variant="outline"
            disabled={reminding}
            data-testid="reminder-button"
            className={SMALL_BUTTON}
          >
            {words.reminder.submit}
          </Button>
        )}
      </form>
      <Button
        type="button"
        variant="outline"
        aria-expanded={renewalOpen}
        aria-controls={RENEWAL_FORM_ID}
        onClick={toggleRenewal}
        data-testid="renewal-open"
        className={cn(SMALL_BUTTON, "group")}
      >
        {words.renewal.open}
        {/* `FoldChevron`'s glyph on a `<button aria-expanded>`, as `ConfirmToggle` wears it. */}
        <ChevronDown
          aria-hidden="true"
          data-icon="inline-end"
          className="size-3.5 shrink-0 transition-transform group-aria-expanded:rotate-180"
        />
      </Button>
    </>
  );
}

/**
 * The renewal, in place of the type and the date (`Z1`). The date is **controlled**, so a refusal
 * leaves what was typed where it is — a past `gültig bis` is a typo, and the point is to correct four
 * characters. Nothing clears it: the form unmounts with the state it held.
 */
function RenewalForm({
  customerId,
  certificateTypes,
}: {
  customerId: number;
  certificateTypes: CertificateTypeList;
}): React.ReactElement {
  const { renew, renewing, renewalFields: fields, toggleRenewal } = useCertificate();
  const [validUntil, setValidUntil] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const words = de.distribution.certificate.renewal;

  useFocusFirstRefusal(fields, form);
  const typeProblem = problemAt(fields, "certificateType");
  const otherProblem = problemAt(fields, "certificateTypeOther");
  const validUntilProblem = problemAt(fields, "certificateValidUntil");

  return (
    <form
      ref={form}
      id={RENEWAL_FORM_ID}
      action={renew}
      aria-label={words.heading}
      data-testid="renewal-form"
      className="flex flex-col gap-1.5 md:col-span-6"
    >
      <input type="hidden" name="customerId" value={customerId} />
      {/* Two lines on purpose: at 1440 px the four controls overrun six columns by a few pixels, and a
          date's refusal widens its column — wrapping would decide the layout per state. The hint
          rides beside the date: a third line pushes `Z1` with „Sonstiges“ open past 800 px (FR-9).
          `items-start`, so a mark rides under its own field rather than pushing the row apart. */}
      <div className="flex items-start gap-3">
        <CertificateTypeField
          types={certificateTypes}
          height="h-8"
          id="renewal-type"
          className="w-52"
          typeProblem={typeProblem}
          otherProblem={otherProblem}
          errorTestId="counter-field-error"
        />
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="renewal-valid-until"
            className={validUntilProblem === null ? undefined : "text-destructive"}
          >
            {words.validUntil}
          </Label>
          <DateInput
            id="renewal-valid-until"
            name="certificateValidUntil"
            required
            placeholder={de.day.placeholder}
            value={validUntil}
            onChange={setValidUntil}
            data-testid="renewal-valid-until"
            className="h-8 w-32"
            {...marking("certificateValidUntil", "renewal-valid-until", validUntilProblem)}
          />
          {validUntilProblem === null ? null : (
            <FieldRejection
              id="renewal-valid-until"
              problem={validUntilProblem}
              testId="counter-field-error"
            />
          )}
        </div>
        <p className="mt-5 min-w-0 flex-1 text-xs text-muted-foreground">{words.hint}</p>
      </div>
      <div className="mt-1 flex gap-2">
        <Button type="submit" disabled={renewing} data-testid="renewal-save" className="h-8">
          {words.submit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={toggleRenewal}
          data-testid="renewal-cancel"
          className="h-8"
        >
          {words.cancel}
        </Button>
      </div>
    </form>
  );
}
