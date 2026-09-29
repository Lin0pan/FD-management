/**
 * The Übersichten tab (US-38.2): every list DF look something up in, one click away, with its size
 * on it. An overview is pulled rather than pushed, so an entry at 0 is shown — „none due" is an answer.
 * Which of these lists is also a to-do on Start is `listToDos`'s decision, not this page's.
 */

import { readOverviews } from "@/application/overviews/read-overviews";
import { de } from "@/i18n/de";
import { SHELL } from "../shell";
import { overviewDeps } from "./deps";
import { ListLink } from "./list-link";

/** A birthday overtakes a card at midnight with nothing written, so a cached count would go stale. */
export const dynamic = "force-dynamic";

function Area({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{heading}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

export default async function OverviewsPage(): Promise<React.ReactElement> {
  const overviews = await readOverviews(overviewDeps);
  const areas = de.overviews.areas;

  return (
    <main className={SHELL}>
      <h1 className="text-3xl font-semibold tracking-tight">{de.nav.overviews}</h1>

      <Area heading={areas.customers}>
        <ListLink
          list="cardsDue"
          count={overviews.cardsDue}
          linkTestId="overview-cards-due-link"
          valueTestId="overview-cards-due"
        />
      </Area>

      <Area heading={areas.distribution}>
        <ListLink
          list="pastSessions"
          count={overviews.pastSessions}
          linkTestId="overview-past-sessions-link"
          valueTestId="overview-past-sessions"
        />
      </Area>
    </main>
  );
}
