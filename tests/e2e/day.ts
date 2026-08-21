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
 * Put a day into a field and make sure it stayed there.
 *
 * Every day field is a **controlled** React input, so there is a window between the server's HTML
 * arriving and the component hydrating in which `fill()` writes straight to the DOM and no React
 * state hears about it. Hydration then re-renders the field from state and the typed value
 * disappears. What follows is worse than an empty box: the field is `required`, so the browser
 * silently refuses to submit the form, no request is made, and the spec fails several assertions
 * later on an error element that was never going to appear — which is exactly how this was found, on
 * a loaded CI runner where the gap is wide enough to hit.
 *
 * So the fill is retried until the value sticks, which is what a person would do on seeing a box
 * empty itself. `toPass` re-runs the whole block, so a wipe costs one more `fill` rather than the
 * run. On an already-hydrated page — every local run — it passes first time and costs nothing.
 */
export async function fillDay(field: Locator, isoDay: string): Promise<void> {
  const value = typedDay(isoDay);
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}
