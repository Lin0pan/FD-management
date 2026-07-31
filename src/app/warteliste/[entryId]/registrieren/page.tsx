/**
 * Registering an applicant off the waiting list (tasks/prd-us-12-waiting-list.md §US-12.4).
 *
 * The page is a read and nothing more: `promoteFromWaitingList` says which slot has come free, fills
 * a registration form in from the entry and reports whether the certificate outlived the wait. The
 * applicant stays on the list until the form is actually saved — a registration can fail on its last
 * field, and somebody removed a moment earlier would have lost the place they waited months for.
 *
 * Every field is editable, including the pre-filled ones. What arrives here is what the applicant
 * said months ago; what is saved is what the person in front of staff confirms today.
 */

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { proposeRegistration } from "@/application/customers/propose-registration";
import { promoteFromWaitingList } from "@/application/waiting-list/promote-from-waiting-list";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { NoFreeCustomerNumber, WaitingListEntryNotFound } from "@/domain/errors";
import { DomainError } from "@/domain/errors";
import { de } from "@/i18n/de";
import { germanDate } from "@/i18n/format";
import type { PrefillDraft } from "@/app/kunden/neu/archive-search-state";
import { isoDay, toPrefillDraft } from "@/app/kunden/neu/registration-input";
import { waitingListDeps } from "../../deps";
import { PromotionScreen } from "./promotion-screen";
import { SHELL } from "../../../shell";

/**
 * Which number is free and whether the certificate has lapsed are both answers about *today*, and
 * both change without anything being written.
 */
export const dynamic = "force-dynamic";

function Frame({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <main className={SHELL}>
      {/* The back-link stays — it names the list this applicant came from, which the four-item bar
          cannot say — but it belongs beside the heading rather than stranded below the form. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{de.waitingList.promote.heading}</h1>
        <Button variant="ghost" asChild>
          <Link href="/warteliste">
            <ArrowLeft aria-hidden="true" />
            {de.waitingList.promote.backToList}
          </Link>
        </Button>
      </div>
      {children}
    </main>
  );
}

export default async function PromoteApplicantPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}): Promise<React.ReactElement> {
  const { entryId } = await params;
  if (!/^\d+$/.test(entryId)) {
    notFound();
  }

  let promotion;
  try {
    promotion = await promoteFromWaitingList(waitingListDeps, { entryId: Number(entryId) });
  } catch (error: unknown) {
    // An applicant who is no longer waiting is a stale link, not an error worth a page of its own.
    if (error instanceof WaitingListEntryNotFound) {
      notFound();
    }
    // The register filled up between the banner and the click. Nothing was written, and the
    // applicant keeps their place — so the page says so and sends staff back to the list.
    if (error instanceof NoFreeCustomerNumber) {
      return (
        <Frame>
          <Alert role="status">
            <AlertDescription data-testid="promotion-no-free-number" className="max-w-prose">
              {de.waitingList.errors.noFreeCustomerNumber}
            </AlertDescription>
          </Alert>
        </Frame>
      );
    }
    if (error instanceof DomainError && error.code === "NoSettingsInForce") {
      return (
        <Frame>
          <Alert role="status">
            <AlertDescription className="max-w-prose">
              {de.settings.errors.noSettings}
            </AlertDescription>
          </Alert>
        </Frame>
      );
    }
    throw error;
  }

  const proposal = await proposeRegistration(waitingListDeps);

  // The certificate and the contact note are the two things a waiting-list draft carries that an
  // archived one deliberately does not — both were written while the applicant waited, and both
  // stay editable (US-12.2).
  const draft: PrefillDraft = {
    ...toPrefillDraft(promotion.draft),
    certificateType: promotion.draft.certificate.type,
    certificateValidUntil: isoDay(promotion.draft.certificate.validUntil),
    notes: promotion.draft.notes,
  };
  const applicant = `${promotion.draft.firstName} ${promotion.draft.lastName}`;

  return (
    <Frame>
      <p data-testid="promotion-intro" className="max-w-prose text-muted-foreground">
        {de.waitingList.promote.intro(applicant, promotion.customerNumber)}
      </p>
      <PromotionScreen
        proposal={proposal}
        draft={draft}
        entryId={promotion.entryId}
        certificateExpired={promotion.certificateExpired}
        certificateValidUntil={germanDate(promotion.draft.certificate.validUntil)}
      />
    </Frame>
  );
}
