import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Overviews } from "@/application/overviews/read-overviews";
import { LISTS } from "./lists";

/**
 * A count that opens its list — the Übersichten entry and the „Zu erledigen" row alike, so the two
 * ways into one list look like one thing (US-38). Not a `Stat`: a `Stat` is inert, and a tile that
 * looks like one but navigates teaches DF a rule and then breaks it (`ui_styling_guide.md` §4).
 * Borderless because it only navigates (§6); the chevron is what says it opens (§12).
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
  const { href, label } = LISTS[list];
  return (
    <Link
      href={href}
      data-testid={linkTestId}
      className="flex min-h-12 max-w-xl items-center gap-4 rounded-lg bg-muted/50 px-4 py-2 transition-colors outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span data-testid={valueTestId} className="text-2xl font-semibold tabular-nums">
        {count}
      </span>
      <span className="text-base">{label}</span>
      <ChevronRight aria-hidden="true" className="ml-auto size-4 shrink-0" />
    </Link>
  );
}
