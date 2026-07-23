/**
 * The registration screen.
 *
 * Reads the proposal — the next free number, the suggested group and the day to judge birthdates
 * against — and hands it to the form. It decides nothing: `proposeRegistration` works out what to
 * show and `registerCustomer` works out what to save
 * (tasks/prd-us-01-register-customer.md §US-01.6).
 */

import { proposeRegistration } from "@/application/customers/propose-registration";
import { DomainError } from "@/domain/errors";
import { de } from "@/i18n/de";
import { customerDeps } from "../deps";
import { RegistrationForm } from "./registration-form";

/**
 * Every registration changes the next free number and both group sizes, so a proposal cached at
 * build time would offer a number that is already gone.
 */
export const dynamic = "force-dynamic";

export default async function NewCustomerPage(): Promise<React.ReactElement> {
  let proposal;
  try {
    proposal = await proposeRegistration(customerDeps);
  } catch (error: unknown) {
    // An unseeded database has no quota, so there is no register to propose a slot in. That is a
    // setup failure, not a rejected registration — say so rather than showing an empty form that
    // could never be saved.
    if (error instanceof DomainError && error.code === "NoSettingsInForce") {
      return (
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
          <h1 className="text-3xl font-semibold">{de.customers.new.heading}</h1>
          <p className="max-w-prose">{de.settings.errors.noSettings}</p>
        </main>
      );
    }
    throw error;
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{de.customers.new.heading}</h1>
        <p className="max-w-prose text-foreground/70">{de.customers.new.intro}</p>
      </header>
      <RegistrationForm proposal={proposal} />
    </main>
  );
}
