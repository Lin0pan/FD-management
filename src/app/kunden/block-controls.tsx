"use client";

/**
 * The block and unblock controls (`tasks/prd-us-08-block-unblock-customer.md` §US-08.4), the same
 * component on the record and the counter — so blocking cannot mean two different things depending on
 * where it was started. The counter offers them because that is where the reason turns up (US-16.5).
 *
 * A client component for `useActionState` and because the save control stays disabled until a reason
 * has been typed — a block's reason is its only record (FR-1). No rules here.
 *
 * Which control it shows is a property of the status, not a click.
 */

import { useActionState, useId, useState } from "react";
import { Ban } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerStatus } from "@/domain/customer/customer";
import { de } from "@/i18n/de";
import { blockCustomerAction, unblockCustomerAction } from "./block-actions";
import { initialBlockState } from "./block-state";
import { ControlSummary } from "../disclosure";
import { Confirmation, Notice } from "../notice";
import { useNoticeSlot } from "../notice-board";

/** "Sperren": a disclosure holding the required reason field; the save button waits for a reason. */
function BlockForm({
  customerId,
  action,
  pending,
}: {
  customerId: number;
  action: (formData: FormData) => void;
  pending: boolean;
}): React.ReactElement {
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const empty = reason.trim() === "";

  return (
    <details className="group">
      <ControlSummary testId="block-open">
        <Ban aria-hidden="true" data-icon="inline-start" />
        {de.customers.block.action}
      </ControlSummary>
      <form action={action} className="mt-3 flex flex-col items-start gap-3">
        <input type="hidden" name="customerId" value={customerId} />
        <div className="flex w-full max-w-prose flex-col gap-1">
          <label htmlFor={reasonId} className="text-sm font-medium">
            {de.customers.block.reasonLabel}
          </label>
          <Textarea
            id={reasonId}
            name="reason"
            rows={4}
            required
            data-testid="block-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        {/* `destructive` is a soft tint, not the solid `bg-red-700` this replaced — which was the
            only solid red in the application and shouted louder than the archive above it. */}
        <Button
          type="submit"
          variant="destructive"
          disabled={empty || pending}
          data-testid="block-submit"
        >
          {pending ? de.customers.block.submitting : de.customers.block.submit}
        </Button>
      </form>
    </details>
  );
}

/** "Sperre aufheben": a confirmation step that shows the reason being lifted before it is cleared. */
function UnblockForm({
  customerId,
  reason,
  action,
  pending,
}: {
  customerId: number;
  reason: string;
  action: (formData: FormData) => void;
  pending: boolean;
}): React.ReactElement {
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="customerId" value={customerId} />
      <details className="group">
        <ControlSummary testId="unblock-open">
          <Ban aria-hidden="true" data-icon="inline-start" />
          {de.customers.block.unblock}
        </ControlSummary>
        {/* Neutral, not destructive: lifting a block is consequential but it takes nothing away. */}
        <div className="mt-3 flex flex-col items-start gap-3">
          <Alert>
            <AlertDescription className="max-w-prose">
              {de.customers.block.unblockConfirm(reason)}
            </AlertDescription>
          </Alert>
          <Button type="submit" disabled={pending} data-testid="unblock-submit">
            {pending ? de.customers.block.unblocking : de.customers.block.unblockSubmit}
          </Button>
        </div>
      </details>
    </form>
  );
}

export function BlockControls({
  customerId,
  status,
  blockReason,
}: {
  customerId: number;
  status: CustomerStatus;
  blockReason: string | null;
}): React.ReactElement | null {
  // Held here rather than inside the form that submits them, because a block is exactly the write
  // that takes its own form off the screen: „Sperren“ is replaced by „Sperre aufheben“, so a
  // confirmation living in the block form would unmount in the render that produced it.
  const [blockState, block, blocking] = useActionState(blockCustomerAction, initialBlockState);
  const [unblockState, unblock, unblocking] = useActionState(
    unblockCustomerAction,
    initialBlockState,
  );

  const active = status === "ACTIVE";
  // The form on screen is the only one that can be refused, and the *other* action is the one whose
  // success put the customer in this status — so a `saved` is always the other one's, and the visible
  // form's own answer, when it has one, is newer and wins.
  const onScreen = active ? blockState : unblockState;
  const whatHappened = active ? unblockState : blockState;
  const answer = onScreen.status === "idle" ? whatHappened : onScreen;
  const showing = useNoticeSlot("block", answer.status === "idle" ? null : answer);

  if (status === "ARCHIVED") {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {active ? (
        <BlockForm customerId={customerId} action={block} pending={blocking} />
      ) : (
        <UnblockForm
          customerId={customerId}
          reason={blockReason ?? ""}
          action={unblock}
          pending={unblocking}
        />
      )}
      {showing && answer.status === "saved" ? (
        <Confirmation
          text={active ? de.customers.block.unblocked : de.customers.block.blocked}
          testId="block-saved"
        />
      ) : null}
      {showing && answer.status === "error" ? (
        <Notice tone={answer.tier} text={answer.message} testId="block-error" />
      ) : null}
    </div>
  );
}
