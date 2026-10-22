import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Overviews } from "@/application/overviews/read-overviews";
import { LISTS } from "./lists";

/**
 * A count that opens its list — the Übersichten entry and the „Zu erledigen" row alike, so the two
 * ways into one list look like one thing (US-38). Not a `Stat`: a `Stat` is inert, and a tile that
 * looks like one but navigates teaches DF a rule and then breaks it (`ui_styling_guide.md` §4).
 * A card's surface, so it stands off the grey page; the chevron is what says it opens (§12).
 */
export function ListLink({
  list,
  count,
  linkTestId,
  valueTestId,
}: {
  list: keyof Overviews;
  count: number;
  linkTestId: string;
  /** On the bare number, never on the row — the testid must not come to contain its own label. */
  valueTestId: string;
}): React.ReactElement {
  const { href, name } = LISTS[list];
  return (
    <Link
      href={href}
      data-testid={linkTestId}
      className="flex min-h-14 max-w-xl items-center gap-4 rounded-[10px] border bg-card px-4 py-2 shadow-xs transition-colors hover:bg-muted"
    >
      <span data-testid={valueTestId} className="text-2xl font-semibold tabular-nums">
        {count}
      </span>
      <span className="text-base">{name(count)}</span>
      <ChevronRight aria-hidden="true" className="ml-auto size-4 shrink-0" />
    </Link>
  );
}
