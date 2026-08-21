import { formatCalendarDay } from "@/domain/calendarDay";

/**
 * A day as DF type it into a field.
 *
 * The specs keep their fixtures in the database's format — `1985-02-11` seeds a row and reads back
 * from one — but the screens no longer take that format: a day field is typed `TT.MM.JJJJ` and its
 * order is ours rather than the operating system's (ADR-013). Rather than carry each date twice,
 * once per format, a spec keeps the one value and puts it through here on its way into a box.
 *
 * Which also means the format lives in exactly one place. If the way DF write a day ever changes,
 * this function and `formatCalendarDay` change; no spec does.
 */
export function typedDay(isoDay: string): string {
  return formatCalendarDay(new Date(`${isoDay}T00:00:00.000Z`));
}
