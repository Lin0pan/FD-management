/**
 * Which section of the navigation bar a path belongs to (US-17.1).
 *
 * This lives in its own module, apart from `nav.tsx`, for one reason: it is the only part of the
 * shell that decides anything, and a decision inside a client component is a decision that can only
 * be checked by rendering it. Here it is a pure function over a string, covered by
 * `active-section.test.ts`.
 *
 * The table below is also what the bar renders, so the four items and the routes they claim cannot
 * drift apart: an item that appears in the bar necessarily marks itself when you are standing on it.
 */

/** The four areas of the application, in the order the bar shows them. */
export type NavSection = "start" | "distribution" | "customers" | "settings";

export interface NavItem {
  readonly section: NavSection;
  /** Where the item leads — always the section's own root. */
  readonly href: string;
  /**
   * Every route root the section owns, `href` included. Only the customer hub owns more than one:
   * the waiting list and the reissue list are things staff do *with customers*, they have no item
   * of their own in the bar, and standing on one of them with no section marked reads as a broken
   * bar rather than as a screen outside the four areas.
   */
  readonly routes: ReadonlyArray<string>;
}

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { section: "start", href: "/", routes: ["/"] },
  { section: "distribution", href: "/ausgabe", routes: ["/ausgabe"] },
  {
    section: "customers",
    href: "/kunden",
    routes: ["/kunden", "/warteliste", "/karten-neuausstellung"],
  },
  { section: "settings", href: "/einstellungen", routes: ["/einstellungen"] },
];

/**
 * A section owns a route and everything below it — `/kunden` therefore covers `/kunden/42/karte`
 * without the table naming it.
 *
 * The sub-route test appends the separator rather than comparing the bare prefix, which does two
 * things at once: `/kundenkarten` is not swallowed by `/kunden`, and the root route `/` matches
 * only itself instead of every path in the application (nothing starts with `//`).
 */
function owns(route: string, pathname: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * The section the given path belongs to, or `null` for a path no item claims — an error screen or a
 * route added later without a home in the bar. The bar then simply marks nothing, which is honest:
 * marking a section the reader is not in would be worse than marking none.
 */
export function activeSection(pathname: string): NavSection | null {
  const item = NAV_ITEMS.find((candidate) =>
    candidate.routes.some((route) => owns(route, pathname)),
  );
  return item?.section ?? null;
}
