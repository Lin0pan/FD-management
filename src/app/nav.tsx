"use client";

/**
 * The navigation bar every screen wears (US-17.1).
 *
 * It is a client component for exactly one reason — `usePathname`, to know which section is being
 * looked at. It reads nothing else: a data read here would be a read in the root layout, which
 * would make every route in the application dynamic (PRD §7). The cards-due count therefore stays
 * on the hub page, which is `force-dynamic` already, and the bar carries no numbers.
 *
 * Plain links, no JavaScript needed to follow them, and first in the tab order because the bar is
 * the first thing on every screen.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { de } from "@/i18n/de";
import { activeSection, NAV_ITEMS } from "./active-section";

/**
 * A tab, sized and focus-ringed like the `Button` primitive so the bar belongs to the same set of
 * controls as the screens below it — but taller than the `radix-nova` default (`h-8`), because this
 * is read and hit standing up at the counter, not from an office chair.
 */
const ITEM =
  "inline-flex h-12 items-center rounded-t-md border-b-2 px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The current section is marked three ways at once — a bottom rule, a tint and bold text — because
 * DF works from one shared screen under whatever light the hall has that day. Colour alone would be
 * a distinction only some of the staff can make (US-03.4).
 */
const ACTIVE = "border-foreground bg-muted font-semibold text-foreground";
const INACTIVE =
  "border-transparent font-medium text-muted-foreground hover:bg-muted hover:text-foreground";

export function Nav(): React.ReactElement {
  const current = activeSection(usePathname());

  return (
    // Sticky, because the two longest screens are the customer list and a record: the bar is what
    // gets you out of them, and scrolling back up to reach it is the thing a bar is meant to spare
    // you. Translucent so content reads as passing *under* it rather than being cut off.
    <nav
      aria-label={de.nav.label}
      data-testid="main-nav"
      className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75"
    >
      {/* Same container as the page below it (`max-w-6xl`), but inset by the page's padding *minus*
          a tab's own `px-3`: that puts the first tab's label on the same vertical line as the `h1`,
          rather than 12px to the right of it, while the tint still extends past the text.

          Wraps onto a second line when the window is narrow; it is a block above the page, so it
          can never push the content sideways. `-mb-px` pulls the active tab's rule onto the bar's
          own bottom border, so the two read as one line instead of stacking into a double rule. */}
      <ul className="mx-auto -mb-px flex w-full max-w-6xl flex-wrap gap-1 px-3 md:px-5">
        {NAV_ITEMS.map((item) => {
          const active = item.section === current;
          return (
            <li key={item.section}>
              <Link
                href={item.href}
                data-testid={`nav-${item.section}`}
                aria-current={active ? "page" : undefined}
                className={`${ITEM} ${active ? ACTIVE : INACTIVE}`}
              >
                {de.nav[item.section]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
