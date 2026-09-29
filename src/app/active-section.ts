/**
 * Which section of the navigation bar a path belongs to (US-17.1). Its own module apart from
 * `nav.tsx`, because it is the only part of the shell that decides anything and a decision inside a
 * client component can only be checked by rendering it.
 *
 * The table below is also what the bar renders, so the items and the routes they claim cannot drift
 * apart.
 */

/** The areas of the application, in the order the bar shows them. */
export type NavSection = "start" | "distribution" | "customers" | "overviews" | "settings";

export interface NavItem {
  readonly section: NavSection;
  /** Where the item leads — always the section's own root. */
  readonly href: string;
  /**
   * Every route root the section owns, `href` included. A page belongs to exactly one section, and a
   * link to it from another screen is a shortcut, not a second home (US-38).
   */
  readonly routes: ReadonlyArray<string>;
}

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { section: "start", href: "/", routes: ["/"] },
  { section: "distribution", href: "/ausgabe", routes: ["/ausgabe"] },
  { section: "customers", href: "/kunden", routes: ["/kunden", "/warteliste"] },
  {
    section: "overviews",
    // A route's URL and the tab that marks it are independent: `/ausgabetermine` and
    // `/karten-neuausstellung` are not under `/uebersichten` (US-38).
    href: "/uebersichten",
    routes: ["/uebersichten", "/ausgabetermine", "/karten-neuausstellung"],
  },
  { section: "settings", href: "/einstellungen", routes: ["/einstellungen"] },
];

/**
 * A section owns a route and everything below it. The sub-route test appends the separator rather
 * than comparing the bare prefix, which does two things at once: `/kundenkarten` is not swallowed by
 * `/kunden`, and `/` matches only itself rather than every path (nothing starts with `//`).
 */
function owns(route: string, pathname: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * The section the given path belongs to, or `null` for a path no item claims. The bar then marks
 * nothing, which is honest — marking a section the reader is not in would be worse.
 */
export function activeSection(pathname: string): NavSection | null {
  const item = NAV_ITEMS.find((candidate) =>
    candidate.routes.some((route) => owns(route, pathname)),
  );
  return item?.section ?? null;
}
