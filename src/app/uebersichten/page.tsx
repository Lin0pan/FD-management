/**
 * The Übersichten tab (US-38.2): every list DF look something up in, one click away, with its size
 * on it. An overview is pulled rather than pushed, so a tile at 0 is shown — „none due" is an answer.
 * Which of these lists is also a to-do on Start is `listToDos`'s decision, not this page's.
 */

import Link from "next/link";
import { readOverviews, type Overviews } from "@/application/overviews/read-overviews";
import { de } from "@/i18n/de";
import { SHELL } from "../shell";
import { Stat } from "../stat";
import { overviewDeps } from "./deps";
import { LISTS } from "./lists";

/** A birthday overtakes a card at midnight with nothing written, so a cached count would go stale. */
export const dynamic = "force-dynamic";

/** One link per tile, so its accessible name carries both the list's name and its size. */
function Tile({
  list,
  count,
  testId,
}: {
  list: keyof Overviews;
  count: number;
  testId: string;
}): React.ReactElement {
  const { href, label } = LISTS[list];
  return (
    <Link
      href={href}
      data-testid={`${testId}-link`}
      className="group rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Stat
        label={label}
        value={String(count)}
        testId={testId}
        className="min-w-56 transition-colors group-hover:bg-muted group-focus-visible:bg-muted"
      />
    </Link>
  );
}

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
      <div className="flex flex-wrap gap-3">{children}</div>
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
        <Tile list="cardsDue" count={overviews.cardsDue} testId="overview-cards-due" />
      </Area>

      <Area heading={areas.distribution}>
        <Tile list="pastSessions" count={overviews.pastSessions} testId="overview-past-sessions" />
      </Area>
    </main>
  );
}
