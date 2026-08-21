import { expect, type Locator } from "@playwright/test";
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

/**
 * Fill a **controlled** field and make sure the value stayed there.
 *
 * Between the server's HTML arriving and the component hydrating there is a window in which
 * `fill()` writes straight to the DOM and no React state hears about it. Hydration then re-renders
 * the field from state and the typed value disappears.
 *
 * What follows is worse than an empty box, and is why this is worth a helper. These fields are
 * `required`, so the browser **silently** declines to submit the form: no request is made, no answer
 * comes back, and the spec fails five seconds later on an error element that was never going to
 * appear — "element(s) not found", nowhere near the actual mistake. It took a loaded CI runner to
 * open the window wide enough to hit, and a page snapshot to see that one field of two had emptied
 * itself while the other kept its value.
 *
 * So the fill is retried until it sticks, which is what a person would do on watching a box empty.
 * `toPass` re-runs the whole block, so a wipe costs one more `fill` rather than the run; on an
 * already-hydrated page it passes first time and costs nothing.
 *
 * Use it for any controlled field filled soon after `goto`. A plain `fill()` is fine once the page
 * has been interacted with, and fine for an uncontrolled field, which has no state to be re-rendered
 * from.
 */
export async function fillSticky(field: Locator, value: string): Promise<void> {
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

/** {@link fillSticky} for a day field, taking the fixture's ISO day and typing it as DF would. */
export async function fillDay(field: Locator, isoDay: string): Promise<void> {
  await fillSticky(field, typedDay(isoDay));
}
