"use client";

/**
 * The afternoon's own three controls (`tasks/prd-us-34-distribution-session.md` §US-34.7): start one,
 * end one, throw an empty one away. A client component for `useActionState`; no rules here — which
 * controls are on screen is decided by the state the page read.
 *
 * Ending and discarding are the same two-step disclosure as the block and archive controls
 * (`docs/guideline/ui_styling_guide.md` §6): at the counter the queue is waiting and nothing may
 * have to be dismissed before the next customer is served, so neither is a `Dialog`.
 */

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionSummary } from "@/domain/distribution/session";
import { de } from "@/i18n/de";
import { ControlSummary } from "../disclosure";
import { Notice } from "../notice";
import { useNoticeSlot } from "../notice-board";
import { discardSessionAction, endSessionAction, startSessionAction } from "./session-actions";
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
 * „Ausgabe beenden" and, while the afternoon still holds nothing, „Ausgabe verwerfen".
 *
 * The end confirmation names what is being closed — the households served and what was taken — and
 * says nothing about who did not turn up: that is the normal case, not a warning. The discard
 * confirmation states the one thing the screen cannot show, that nothing is written down about it.
 */
export function RunningSessionControls({
  summary,
  canDiscard,
}: {
  summary: SessionSummary;
  canDiscard: boolean;
}): React.ReactElement {
  const [endState, end, ending] = useActionState(endSessionAction, initialSessionState);
  const [discardState, discard, discarding] = useActionState(
    discardSessionAction,
    initialSessionState,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <form action={end}>
          <details className="group">
            <ControlSummary testId="session-end-open">
              {de.distribution.session.end.open}
            </ControlSummary>
            <div className="mt-3 flex flex-col items-start gap-3">
              <Alert>
                <AlertDescription data-testid="session-end-confirm" className="max-w-prose">
                  {de.distribution.session.end.confirm(summary.households, summary.totalPaidCents)}
                </AlertDescription>
              </Alert>
              <Button type="submit" disabled={ending} data-testid="session-end-submit">
                {ending
                  ? de.distribution.session.end.submitting
                  : de.distribution.session.end.submit}
              </Button>
            </div>
          </details>
        </form>

        {canDiscard ? (
          <form action={discard}>
            <details className="group">
              <ControlSummary testId="session-discard-open">
                {de.distribution.session.discard.open}
              </ControlSummary>
              <div className="mt-3 flex flex-col items-start gap-3">
                <Alert>
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
              </div>
            </details>
          </form>
        ) : null}
      </div>
      <SessionNotice id="session-end" state={endState} />
      <SessionNotice id="session-discard" state={discardState} />
    </div>
  );
}
