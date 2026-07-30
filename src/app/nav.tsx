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
 * The current section is marked three ways at once — a bottom rule, a tint and bold text — because
 * FD works from one shared screen under whatever light the hall has that day. Colour alone would be
 * a distinction only some of the staff can make (US-03.4).
 */
const ACTIVE = "border-foreground bg-foreground/5 font-semibold";
const INACTIVE = "border-transparent text-foreground/70 hover:bg-foreground/5";

export function Nav(): React.ReactElement {
  const current = activeSection(usePathname());

  return (
    <nav
      aria-label={de.nav.label}
      data-testid="main-nav"
      className="border-b border-foreground/15 bg-background"
    >
      {/* Wraps onto a second line when the window is narrow; it is a block above the page, so it
          can never push the content sideways. */}
      <ul className="mx-auto flex w-full max-w-6xl flex-wrap gap-1 px-4 py-2">
        {NAV_ITEMS.map((item) => {
          const active = item.section === current;
          return (
            <li key={item.section}>
              <Link
                href={item.href}
                data-testid={`nav-${item.section}`}
                aria-current={active ? "page" : undefined}
                className={`inline-block rounded-t border-b-2 px-3 py-2 ${active ? ACTIVE : INACTIVE}`}
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
