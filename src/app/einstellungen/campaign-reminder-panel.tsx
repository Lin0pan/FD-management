"use client";

/**
 * The campaign reminder on the settings screen (US-40): created with a name, renamed, read as
 * „x von y abgehakt", deleted. Its own forms, outside the policy form — nothing here appends a
 * `SettingsVersion`. No rules: which names are legal and what switching off deletes are the use
 * cases'.
 */

import { useActionState, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CAMPAIGN_REMINDER_NAME_MAX_LENGTH } from "@/domain/campaign/campaignReminder";
import { de } from "@/i18n/de";
import {
  endCampaignReminderAction,
  renameCampaignReminderAction,
  startCampaignReminderAction,
} from "./actions";
import {
  type CampaignReminderActionState,
  initialCampaignReminderActionState,
} from "./campaign-reminder-state";
import { ControlSummary } from "../disclosure";
import { FieldRejection, useFocusFirstRefusal } from "../field-mark";
import { marking, problemAt } from "../field-refusal";
import { Notice } from "../notice";

/** The reminder switched on, as the page read it. */
export interface ActiveCampaignReminder {
  readonly id: number;
  readonly name: string;
  /** The day it was switched on, already formatted. */
  readonly since: string;
  readonly received: number;
  readonly total: number;
}

const NAME_ID = "campaign-reminder-name";

/** The name box, shared by both states. Controlled, so a refusal keeps what was typed (§7). */
function NameField({
  value,
  onChange,
  state,
}: {
  value: string;
  onChange: (value: string) => void;
  state: CampaignReminderActionState;
}): React.ReactElement {
  const problem = problemAt(state.status === "error" ? state.fields : undefined, "name");
  return (
    <div className="flex w-full max-w-sm flex-col gap-1">
      <label
        htmlFor={NAME_ID}
        className={
          problem === null ? "text-sm font-medium" : "text-sm font-medium text-destructive"
        }
      >
        {de.settings.campaignReminder.name}
      </label>
      <Input
        id={NAME_ID}
        name="name"
        data-testid="campaign-reminder-name"
        maxLength={CAMPAIGN_REMINDER_NAME_MAX_LENGTH}
        placeholder={de.settings.campaignReminder.namePlaceholder}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...marking("name", NAME_ID, problem)}
      />
      {problem === null ? null : (
        <FieldRejection id={NAME_ID} problem={problem} testId="campaign-reminder-field-error" />
      )}
    </div>
  );
}

function StateNotice({
  state,
  testId,
}: {
  state: CampaignReminderActionState;
  testId: string;
}): React.ReactElement | null {
  if (state.status === "idle" || state.message === undefined) {
    return null;
  }
  return (
    <Notice
      tone={state.status === "error" ? (state.tier ?? "error") : "success"}
      text={state.message}
      testId={state.status === "error" ? `${testId}-error` : `${testId}-saved`}
    />
  );
}

function Inactive(): React.ReactElement {
  const [state, action, pending] = useActionState(
    startCampaignReminderAction,
    initialCampaignReminderActionState,
  );
  const [name, setName] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useFocusFirstRefusal(state.status === "error" ? state.fields : undefined, form);

  return (
    <form ref={form} action={action} className="flex flex-col items-start gap-4">
      <NameField value={name} onChange={setName} state={state} />
      <StateNotice state={state} testId="campaign-reminder" />
      <Button type="submit" disabled={pending} data-testid="campaign-reminder-start">
        {pending ? de.settings.campaignReminder.starting : de.settings.campaignReminder.start}
      </Button>
    </form>
  );
}

function Active({ reminder }: { reminder: ActiveCampaignReminder }): React.ReactElement {
  const words = de.settings.campaignReminder;
  const [renameState, rename, renaming] = useActionState(
    renameCampaignReminderAction,
    initialCampaignReminderActionState,
  );
  const [endState, end, ending] = useActionState(
    endCampaignReminderAction,
    initialCampaignReminderActionState,
  );
  const form = useRef<HTMLFormElement>(null);
  useFocusFirstRefusal(renameState.status === "error" ? renameState.fields : undefined, form);

  // Resynced on the stored name rather than keyed on it, so a rename's „Umbenannt." survives the
  // revalidation that hands the new name back (`ui_styling_guide.md` §6).
  const [name, setName] = useState(reminder.name);
  const [storedName, setStoredName] = useState(reminder.name);
  if (storedName !== reminder.name) {
    setStoredName(reminder.name);
    setName(reminder.name);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-sm">
        <span data-testid="campaign-reminder-progress" className="font-medium tabular-nums">
          {words.progress(reminder.received, reminder.total)}
        </span>
        <span data-testid="campaign-reminder-since" className="text-muted-foreground">
          {words.since(reminder.since)}
        </span>
      </div>

      <form ref={form} action={rename} className="flex flex-col items-start gap-4">
        <input type="hidden" name="reminderId" value={reminder.id} />
        <NameField value={name} onChange={setName} state={renameState} />
        <StateNotice state={renameState} testId="campaign-reminder" />
        <Button
          type="submit"
          variant="outline"
          disabled={renaming}
          data-testid="campaign-reminder-rename"
        >
          {renaming ? words.renaming : words.rename}
        </Button>
      </form>

      {/* The archive control's shape without its reason field: switching off needs no why, and the
          sentence inside names the one-way door — every tick is deleted (ADR-023). */}
      <details className="group border-t pt-6">
        <ControlSummary testId="campaign-reminder-end-open">{words.end}</ControlSummary>
        <form action={end} className="mt-3 flex flex-col items-start gap-3">
          <input type="hidden" name="reminderId" value={reminder.id} />
          <Alert variant="destructive">
            <AlertDescription data-testid="campaign-reminder-end-warning" className="max-w-prose">
              {words.endWarning(reminder.name, reminder.received)}
            </AlertDescription>
          </Alert>
          <Button
            type="submit"
            variant="destructive"
            disabled={ending}
            data-testid="campaign-reminder-end"
          >
            {ending ? words.ending : words.endConfirm}
          </Button>
          <StateNotice state={endState} testId="campaign-reminder-end" />
        </form>
      </details>
    </div>
  );
}

export function CampaignReminderPanel({
  reminder,
}: {
  reminder: ActiveCampaignReminder | null;
}): React.ReactElement {
  return (
    // No `CardTitle`: the section heading in `page.tsx` names this block (§2, §9).
    <Card>
      <CardContent>
        {/* Keyed on the reminder, so switching one off and the next on starts from empty forms
            rather than the last one's answers. */}
        {reminder === null ? <Inactive /> : <Active key={reminder.id} reminder={reminder} />}
      </CardContent>
    </Card>
  );
}
