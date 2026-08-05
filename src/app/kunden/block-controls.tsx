"use client";

/**
 * The block and unblock controls (tasks/prd-us-08-block-unblock-customer.md §US-08.4), shared by the
 * customer record and the counter — the same component on both screens, like `ArchiveControls`, so
 * blocking cannot mean two different things depending on where it was started.
 *
 * The counter offers them because that is where the reason to pause a household turns up: the block
 * is decided in front of the person it concerns, and US-08.4 shipped both controls on the record
 * only, leaving whoever decided at the counter with no route off that screen
 * (tasks/prd-us-16-maintain-customer-record.md §US-16.5).
 *
 * A client component because two things need the browser: `useActionState` reports a rejection back
 * beside the button, and the block's save control stays disabled until a reason has been typed (the
 * reason is a block's only record, so an empty one must be impossible to submit — FR-1). It holds no
 * rules: whether a customer may be blocked or a block lifted is decided behind the two use cases; this
 * file only lays out the forms and repeats the server's answer.
 *
 * Which control it shows is a property of the status, not a click: an active customer gets "Sperren",
 * a blocked one gets the current reason and "Sperre aufheben", and an archived one gets neither —
 * there is no transition out of archived.
 */

import { useActionState, useId, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerStatus } from "@/domain/customer/customer";
import { de } from "@/i18n/de";
import { cn } from "@/lib/utils";
import { blockCustomerAction, unblockCustomerAction } from "./block-actions";
import { initialBlockState } from "./block-state";
import { Confirmation, Notice } from "../notice";
import { useNoticeSlot } from "../notice-board";

/**
 * The `<summary>` recipe shared by the two disclosures here and by `ArchiveControls`: closed, a
 * control must not read as a collapsed section spanning the row (`/karten-neuausstellung`).
 */
const SUMMARY = "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden";

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
    <details>
      <summary
        data-testid="block-open"
        className={cn(buttonVariants({ variant: "outline" }), SUMMARY)}
      >
        {de.customers.block.action}
      </summary>
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
          <span className="text-xs text-muted-foreground">{de.customers.block.reasonHint}</span>
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
      <details>
        <summary
          data-testid="unblock-open"
          className={cn(buttonVariants({ variant: "outline" }), SUMMARY)}
        >
          {de.customers.block.unblock}
        </summary>
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
  // Both `useActionState`s are held here rather than inside the form that submits them, because a
  // block is exactly the write that takes its own form off the screen: the record revalidates with
  // the new status and "Sperren" is replaced by "Sperre aufheben", so a confirmation living in the
  // block form would unmount in the same render that produced it. This component survives the swap,
  // which is what lets either answer be read where the button was.
  const [blockState, block, blocking] = useActionState(blockCustomerAction, initialBlockState);
  const [unblockState, unblock, unblocking] = useActionState(
    unblockCustomerAction,
    initialBlockState,
  );

  const active = status === "ACTIVE";
  // Which of the two states says what. The form on screen is the only one that can be refused, and
  // the *other* action is the one whose success put the customer in this status — an active customer
  // in front of "Sperren" is one an unblock just released. So a `saved` is always the other one's,
  // and the visible form's own answer, when it has one, is newer than that and wins.
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
