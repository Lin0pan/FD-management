"use client";

/**
 * The afternoon's own four controls (`tasks/prd-us-34-distribution-session.md` §§US-34.7, US-34.8):
 * start one, end one, throw an empty one away, open the last one up again. A client component for
 * `useActionState`; no rules here — which controls are on screen is decided by the state the page
 * read.
 *
 * Ending, discarding and reopening are two-step folds like the block and archive controls
 * (`docs/guideline/ui_styling_guide.md` §6): at the counter the queue is waiting and nothing may
 * have to be dismissed before the next customer is served, so none of them is a `Dialog`.
 */

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { SessionSummary } from "@/domain/distribution/session";
import { de } from "@/i18n/de";
import { ControlSummary, ControlToggle } from "../disclosure";
import { Notice } from "../notice";
import { useNoticeSlot } from "../notice-board";
import {
  discardSessionAction,
  endSessionAction,
  reopenSessionAction,
  startSessionAction,
} from "./session-actions";
import { GROUP_OPTIONS_IN_ORDER, type GroupOption } from "./session-options";
import { initialSessionState, type SessionActionState } from "./session-state";

/** The refusal beside the control that was refused, or nothing — a success replaces the screen. */
function SessionNotice({
  id,
  state,
}: {
  id: string;
  state: SessionActionState;
}): React.ReactElement | null {
  const showing = useNoticeSlot(id, state.status === "idle" ? null : state);
  if (!showing || state.status !== "error") {
    return null;
  }
  return <Notice tone={state.tier} text={state.message} testId={`${id}-error`} />;
}

/**
 * „Ausgabe starten": the group choice and the button, and nothing else. Deviating from the proposal
 * asks for nothing — no reason, no confirmation, and no sentence saying that it is allowed (FR-2).
 *
 * The radios are **not tinted** the way the intake's group choice is: a tint for „Rot und Blau" would
 * have to be invented, and the colour of an afternoon belongs to the header that states it once it
 * runs.
 */
export function StartSessionForm({
  proposed,
}: {
  proposed: GroupOption | null;
}): React.ReactElement {
  const [state, start, pending] = useActionState(startSessionAction, initialSessionState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          <h2>{de.distribution.session.start.heading}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form action={start} className="flex flex-col items-start gap-4">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">
              {de.distribution.session.start.groupsLabel}
            </legend>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {GROUP_OPTIONS_IN_ORDER.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name="groups"
                    id={`session-groups-${option}`}
                    value={option}
                    defaultChecked={option === proposed}
                    className="accent-current"
                  />
                  <span>{de.distribution.session.start.options[option]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" size="lg" disabled={pending} data-testid="session-start-submit">
            {pending
              ? de.distribution.session.start.submitting
              : de.distribution.session.start.submit}
          </Button>
        </form>
        <SessionNotice id="session-start" state={state} />
      </CardContent>
    </Card>
  );
}

/**
 * The counter's header line (US-41.3): what the page states about the afternoon — `children` — and,
 * at the far end, „Ausgabetermine", „Ausgabe beenden" and, while the afternoon still holds nothing,
 * „Ausgabe verwerfen".
 *
 * Toggle buttons rather than `<details>`, the one deliberate exception to `ui_styling_guide.md`
 * §6: a `<details>` draws its content inside its own box, and these confirmations have to open
 * below the whole row rather than wedge into it. Still nothing to dismiss — the same button folds
 * it away.
 *
 * The end confirmation names what is being closed — the households served and what was taken — and
 * says nothing about who did not turn up: that is the normal case, not a warning. The discard
 * confirmation states the one thing the screen cannot show, that nothing is written down about it.
 */
export function RunningSessionControls({
  summary,
  canDiscard,
  children,
}: {
  summary: SessionSummary;
  canDiscard: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const [endState, end, ending] = useActionState(endSessionAction, initialSessionState);
  const [discardState, discard, discarding] = useActionState(
    discardSessionAction,
    initialSessionState,
  );
  const [open, setOpen] = useState<"end" | "discard" | null>(null);
  const endId = useId();
  const discardId = useId();
  const toggle = (which: "end" | "discard"): void => setOpen(open === which ? null : which);

  return (
    <div data-testid="session-header" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {children}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* A shortcut to the afternoons already held, whose home is Übersichten (US-38.3), named
              as that screen names itself. Borderless: it navigates, and it must not read as a third
              thing to do to the afternoon under way. */}
          <Button variant="ghost" asChild>
            <Link href="/ausgabetermine" data-testid="session-past-link">
              {de.distribution.pastSessions.heading}
            </Link>
          </Button>
          <ControlToggle
            testId="session-end-open"
            controls={endId}
            expanded={open === "end"}
            onToggle={() => toggle("end")}
          >
            {de.distribution.session.end.open}
          </ControlToggle>
          {canDiscard ? (
            <ControlToggle
              testId="session-discard-open"
              controls={discardId}
              expanded={open === "discard"}
              onToggle={() => toggle("discard")}
            >
              {de.distribution.session.discard.open}
            </ControlToggle>
          ) : null}
        </div>
      </div>

      {open === "end" ? (
        <form id={endId} action={end} className="flex flex-col items-end gap-3">
          <Alert className="w-fit">
            <AlertDescription data-testid="session-end-confirm" className="max-w-prose">
              {de.distribution.session.end.confirm(summary.households, summary.totalPaidCents)}
            </AlertDescription>
          </Alert>
          <Button type="submit" disabled={ending} data-testid="session-end-submit">
            {ending ? de.distribution.session.end.submitting : de.distribution.session.end.submit}
          </Button>
        </form>
      ) : null}

      {canDiscard && open === "discard" ? (
        <form id={discardId} action={discard} className="flex flex-col items-end gap-3">
          <Alert className="w-fit">
            <AlertDescription data-testid="session-discard-confirm" className="max-w-prose">
              {de.distribution.session.discard.confirm}
            </AlertDescription>
          </Alert>
          <Button
            type="submit"
            variant="destructive"
            disabled={discarding}
            data-testid="session-discard-submit"
          >
            {discarding
              ? de.distribution.session.discard.submitting
              : de.distribution.session.discard.submit}
          </Button>
        </form>
      ) : null}

      <SessionNotice id="session-end" state={endState} />
      <SessionNotice id="session-discard" state={discardState} />
    </div>
  );
}

/**
 * „Ausgabe wieder öffnen" — the way back into the afternoon that ended last (US-34.8), and the only
 * screen it is reached from.
 *
 * The reason **is** the record, as it is for a block and an archival, so the save stays disabled
 * until one has been typed — the same shape and the same argument as `archive-controls.tsx`. The
 * session is carried in a hidden field rather than resolved by the action: what is reopened is the
 * afternoon this screen was showing.
 */
export function ReopenSessionControls({ sessionId }: { sessionId: number }): React.ReactElement {
  const [state, action, pending] = useActionState(reopenSessionAction, initialSessionState);
  const [reason, setReason] = useState("");
  const reasonId = useId();

  return (
    <details className="group">
      <ControlSummary testId="session-reopen-open">
        {de.distribution.session.reopen.open}
      </ControlSummary>
      <form action={action} className="mt-3 flex flex-col items-start gap-3">
        <input type="hidden" name="sessionId" value={sessionId} />
        <Alert>
          <AlertDescription data-testid="session-reopen-confirm" className="max-w-prose">
            {de.distribution.session.reopen.confirm}
          </AlertDescription>
        </Alert>
        <div className="flex w-full max-w-prose flex-col gap-1">
          <label htmlFor={reasonId} className="text-sm font-medium">
            {de.distribution.session.reopen.reasonLabel}
          </label>
          <Textarea
            id={reasonId}
            name="reason"
            rows={3}
            required
            data-testid="session-reopen-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={reason.trim() === "" || pending}
          data-testid="session-reopen-submit"
        >
          {pending
            ? de.distribution.session.reopen.submitting
            : de.distribution.session.reopen.submit}
        </Button>
        <SessionNotice id="session-reopen" state={state} />
      </form>
    </details>
  );
}
