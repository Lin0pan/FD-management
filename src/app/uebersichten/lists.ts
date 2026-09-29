import type { Overviews } from "@/application/overviews/read-overviews";
import { de } from "@/i18n/de";

/**
 * Where each list lives and what it is called — read by its Übersichten entry and by any „Zu
 * erledigen" row leading to it, so the two entry points cannot drift apart (US-38). Keyed by the
 * `Overviews` figures, so a new one fails the build until it has a place here.
 */
export const LISTS: Record<
  keyof Overviews,
  {
    readonly href: string;
    /** The list's heading, inflected for the count it follows. */
    readonly name: (count: number) => string;
  }
> = {
  cardsDue: { href: "/karten-neuausstellung", name: de.cardsDue.countedName },
  pastSessions: { href: "/ausgabetermine", name: de.distribution.pastSessions.countedName },
};
