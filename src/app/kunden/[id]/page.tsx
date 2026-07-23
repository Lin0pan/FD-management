/**
 * The customer's card view — where a registration lands.
 *
 * Everything on screen that could be worked out already has been: `readCustomer` derives the
 * household counts from the birthdates and the card number from the slot and the card index. This
 * page only lays them out (tasks/prd-us-01-register-customer.md §US-01.6).
 */

import Link from "next/link";
import { readCustomer, type CustomerCardView } from "@/application/customers/read-customer";
import { DomainError } from "@/domain/errors";
import { de } from "@/i18n/de";
import { customerDeps } from "../deps";

/** The card shows data the registration form writes, so it must never be served from a cache. */
export const dynamic = "force-dynamic";

/** Dates are shown to staff the German way; nobody here should have to read an ISO timestamp. */
function germanDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

function Field({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <p className="rounded border border-foreground/15 px-3 py-2">
      <span className="text-sm text-foreground/70">{label}: </span>
      <span className="font-medium">{value}</span>
    </p>
  );
}

function NotFound(): React.ReactElement {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-3xl font-semibold">{de.customers.card.heading}</h1>
      <p className="max-w-prose">{de.customers.errors.notFound}</p>
      <Link href="/" className="underline underline-offset-4">
        {de.customers.card.backToHome}
      </Link>
    </main>
  );
}

function CustomerCard({ view }: { view: CustomerCardView }): React.ReactElement {
  const { customer, composition, cardNumber } = view;
  const { details } = customer;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{de.customers.card.heading}</h1>
        <p className="text-xl">
          {details.firstName} {details.lastName}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label={de.customers.fields.customerNumber} value={String(customer.customerNumber)} />
        <p className="rounded border border-foreground/15 px-3 py-2">
          <span className="text-sm text-foreground/70">{de.customers.fields.cardNumber}: </span>
          <span data-testid="card-number" className="font-medium tabular-nums">
            {cardNumber}
          </span>
        </p>
        <p className="rounded border border-foreground/15 px-3 py-2">
          <span className="text-sm text-foreground/70">{de.customers.fields.status}: </span>
          <span data-testid="customer-status" className="font-medium">
            {de.customers.status[customer.status]}
          </span>
        </p>
        <Field label={de.customers.fields.group} value={de.customers.groups[customer.group]} />
        <Field label={de.customers.card.registered} value={germanDate(customer.card.issuedAt)} />
        <Field label={de.customers.fields.birthDate} value={germanDate(details.birthDate)} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">{de.customers.new.addressHeading}</h2>
        <p>
          {details.address.street} {details.address.houseNumber}
        </p>
        <p>
          {details.address.zip} {details.address.city}
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{de.customers.card.householdHeading}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <p className="rounded border border-foreground/15 px-3 py-2">
            <span className="text-sm text-foreground/70">{de.customers.derived.grownUps}: </span>
            <span data-testid="grown-ups" className="font-semibold tabular-nums">
              {composition.grownUps}
            </span>
          </p>
          <p className="rounded border border-foreground/15 px-3 py-2">
            <span className="text-sm text-foreground/70">{de.customers.derived.children}: </span>
            <span data-testid="children" className="font-semibold tabular-nums">
              {composition.children}
            </span>
          </p>
        </div>
        <ul className="flex flex-col gap-1">
          {details.householdMembers.map((member, index) => (
            // Two members can share a name and a birthdate, so the position is the only key there is.
            <li key={index} data-testid="household-member" className="text-foreground/80">
              {member.firstName} {member.lastName} — {germanDate(member.birthDate)}
            </li>
          ))}
        </ul>
        <p className="text-xs text-foreground/60">{de.customers.derived.hint}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">{de.customers.card.certificateHeading}</h2>
        <p>
          {details.certificate.type} — {de.customers.card.validUntil}{" "}
          {germanDate(details.certificate.validUntil)}
        </p>
      </section>

      {details.notes === "" ? null : (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">{de.customers.fields.notes}</h2>
          <p className="max-w-prose text-foreground/80">{details.notes}</p>
        </section>
      )}

      <Link href="/" className="underline underline-offset-4">
        {de.customers.card.backToHome}
      </Link>
    </main>
  );
}

export default async function CustomerCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  // A URL is typed by hand as easily as it is clicked, so a non-numeric id is the same answer as an
  // id nobody holds: there is no such customer.
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return <NotFound />;
  }

  // Only the read is guarded: a `try` around the JSX would catch nothing anyway, because React
  // renders the component after this function has already returned.
  let view: CustomerCardView;
  try {
    view = await readCustomer(customerDeps, numericId);
  } catch (error: unknown) {
    if (error instanceof DomainError && error.code === "CustomerNotFound") {
      return <NotFound />;
    }
    throw error;
  }

  return <CustomerCard view={view} />;
}
