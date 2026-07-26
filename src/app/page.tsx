import Link from "next/link";
import { countCardsDueForReissue } from "@/application/customers/cards-due-for-reissue";
import { de } from "@/i18n/de";
import { customerDeps } from "./kunden/deps";

/**
 * The badge counts a list that changes at midnight without anything being written — a 13th birthday
 * is a read-time derivation (US-13, PRD §5) — so a cached home screen would show yesterday's number.
 */
export const dynamic = "force-dynamic";

export default async function Home(): Promise<React.ReactElement> {
  const cardsDue = await countCardsDueForReissue(customerDeps);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold">{de.home.heading}</h1>
      <p className="max-w-prose text-balance text-foreground/70">{de.home.subheading}</p>
      <Link href="/ausgabe" className="underline underline-offset-4">
        {de.home.distributionLink}
      </Link>
      <Link href="/kunden/neu" className="underline underline-offset-4">
        {de.home.newCustomerLink}
      </Link>
      {/* The badge is deliberately the same grey as everything else on this screen: it is a to-do
          count, and a home screen that looks alarmed about outdated cards is how staff learn to
          ignore the list (PRD §6). It is shown at zero too — "nothing to do" is an answer. */}
      <Link href="/karten-neuausstellung" className="flex items-center gap-2">
        <span className="underline underline-offset-4">{de.home.cardsDueLink}</span>
        <span
          data-testid="cards-due-badge"
          className="rounded-full bg-foreground/10 px-3 py-1 text-sm tabular-nums"
        >
          {de.home.cardsDueBadge(cardsDue)}
        </span>
      </Link>
      <Link href="/einstellungen" className="underline underline-offset-4">
        {de.home.settingsLink}
      </Link>
    </main>
  );
}
