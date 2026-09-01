/**
 * The registration screen.
 *
 * Reads the proposal — the next free number, the suggested group and the day to judge birthdates
 * against — and hands it to the screen. It decides nothing: `proposeRegistration` works out what to
 * show and `registerCustomer` works out what to save
 * (tasks/prd-us-01-register-customer.md §US-01.6).
 *
 * The archive search that may fill the form lives inside `RegistrationScreen`, because the search
 * and the form share one piece of state — which archived household, if any, was picked
 * (tasks/prd-us-11-reuse-archived-record.md §US-11.4).
 *
 * It also reads the waiting list, for one purpose: this is the screen on which the next customer
 * number is actually handed out, so it is the screen on which somebody who has been waiting for that
 * number has to be named (tasks/prd-us-18-waiting-list-signals.md §US-18.3). The banner states a
 * fact and gates nothing — a walk-in may still be registered, because who is served is DF's decision
 * and not the software's.
 */

import { proposeRegistration } from "@/application/customers/propose-registration";
import { listWaiting } from "@/application/waiting-list/list-waiting";
import { DomainError } from "@/domain/errors";
import { de } from "@/i18n/de";
import { customerDeps } from "../deps";
import { waitingListDeps } from "../../warteliste/deps";
import { FreeSlotBanner } from "../../warteliste/free-slot-banner";
import { RegistrationScreen } from "./registration-screen";
import { SHELL } from "../../shell";

/**
 * Every registration changes the next free number and both group sizes, so a proposal cached at
 * build time would offer a number that is already gone.
 */
export const dynamic = "force-dynamic";

export default async function NewCustomerPage(): Promise<React.ReactElement> {
  let proposal;
  let places;
  try {
    // Concurrently: neither read depends on the other, and the form is what the staff member is
    // waiting for.
    [proposal, places] = await Promise.all([
      proposeRegistration(customerDeps),
      listWaiting(waitingListDeps),
    ]);
  } catch (error: unknown) {
    // An unseeded database has no quota, so there is no register to propose a slot in. That is a
    // setup failure, not a rejected registration — say so rather than showing an empty form that
    // could never be saved.
    if (error instanceof DomainError && error.code === "NoSettingsInForce") {
      return (
        <main className={SHELL}>
          <h1 className="text-3xl font-semibold tracking-tight">{de.customers.new.heading}</h1>
          <p className="max-w-prose">{de.settings.errors.noSettings}</p>
        </main>
      );
    }
    throw error;
  }

  const [head] = places;

  return (
    <main className={SHELL}>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{de.customers.new.heading}</h1>
      </header>

      {/* Above the form, so it is read before the first field is typed: the number this screen is
          about to hand out is the number somebody has been waiting for, and a walk-in should not
          jump the queue silently. Nothing to say with an empty list, and nothing to offer when the
          register is full — the form says that itself. The head of the queue is `listWaiting`'s
          first place and nobody else, the same reading /warteliste makes, so the two screens can
          never name two different applicants. */}
      {head !== undefined && proposal.customerNumber !== null ? (
        <FreeSlotBanner head={head} customerNumber={proposal.customerNumber} showListLink />
      ) : null}

      <RegistrationScreen proposal={proposal} />
    </main>
  );
}
