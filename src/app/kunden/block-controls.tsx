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

import { useActionState, useState } from "react";
import type { CustomerStatus } from "@/domain/customer/customer";
import { de } from "@/i18n/de";
import { blockCustomerAction, unblockCustomerAction } from "./block-actions";
import { initialBlockState } from "./block-state";

function Rejection({ message }: { message: string }): React.ReactElement {
  return (
    <p
      role="status"
      data-testid="block-error"
      className="max-w-prose rounded border border-red-500/40 bg-red-500/10 px-3 py-2"
    >
      {message}
    </p>
  );
}

/** "Sperren": a disclosure holding the required reason field; the save button waits for a reason. */
function BlockForm({ customerId }: { customerId: number }): React.ReactElement {
  const [state, action, pending] = useActionState(blockCustomerAction, initialBlockState);
  const [reason, setReason] = useState("");
  const empty = reason.trim() === "";

  return (
    <details className="rounded border border-red-500/40">
      <summary data-testid="block-open" className="cursor-pointer px-4 py-2 font-medium">
        {de.customers.block.action}
      </summary>
      <form action={action} className="flex flex-col gap-3 px-4 pb-4">
        <input type="hidden" name="customerId" value={customerId} />
        <label className="flex flex-col gap-1">
          <span className="text-sm text-foreground/70">{de.customers.block.reasonLabel}</span>
          <textarea
            name="reason"
            rows={4}
            required
            data-testid="block-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded border border-foreground/20 bg-transparent px-3 py-2"
          />
          <span className="text-xs text-foreground/60">{de.customers.block.reasonHint}</span>
        </label>
        <div>
          <button
            type="submit"
            disabled={empty || pending}
            data-testid="block-submit"
            className="rounded bg-red-700 px-6 py-3 font-semibold text-white disabled:opacity-60"
          >
            {pending ? de.customers.block.submitting : de.customers.block.submit}
          </button>
        </div>
        {state.status === "error" ? <Rejection message={state.message} /> : null}
      </form>
    </details>
  );
}

/** "Sperre aufheben": a confirmation step that shows the reason being lifted before it is cleared. */
function UnblockForm({
  customerId,
  reason,
}: {
  customerId: number;
  reason: string;
}): React.ReactElement {
  const [state, action, pending] = useActionState(unblockCustomerAction, initialBlockState);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="customerId" value={customerId} />
      <details className="rounded border border-foreground/20">
        <summary data-testid="unblock-open" className="cursor-pointer px-4 py-2 font-medium">
          {de.customers.block.unblock}
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className="max-w-prose">{de.customers.block.unblockConfirm(reason)}</p>
          <button
            type="submit"
            disabled={pending}
            data-testid="unblock-submit"
            className="self-start rounded bg-foreground px-6 py-3 font-semibold text-background disabled:opacity-60"
          >
            {pending ? de.customers.block.unblocking : de.customers.block.unblockSubmit}
          </button>
        </div>
      </details>
      {state.status === "error" ? <Rejection message={state.message} /> : null}
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
  if (status === "ACTIVE") {
    return <BlockForm customerId={customerId} />;
  }
  if (status === "BLOCKED") {
    return <UnblockForm customerId={customerId} reason={blockReason ?? ""} />;
  }
  return null;
}
