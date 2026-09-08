import { expect, type Locator } from "@playwright/test";
import { formatCalendarDay } from "@/domain/calendarDay";

/**
 * A day as DF type it into a field. The specs keep their fixtures in the database's format, but a day
 * field is typed `TT.MM.JJJJ` (ADR-013) — so rather than carry each date twice, a spec keeps one
 * value and puts it through here on its way into a box.
 */
export function typedDay(isoDay: string): string {
  return formatCalendarDay(new Date(`${isoDay}T00:00:00.000Z`));
}

/**
 * Fill a **controlled** field and make sure the value stayed there.
 *
 * Between the server's HTML arriving and the component hydrating there is a window in which `fill()`
 * writes straight to the DOM and no React state hears about it; hydration then re-renders the field
 * and the typed value disappears.
 *
 * **The failure is worse than an empty box**: these fields are `required`, so the browser *silently*
 * declines to submit, and the spec fails five seconds later on an error element that was never going
 * to appear — nowhere near the actual mistake.
 *
 * So the fill **waits for React to own the field** and is then retried until it sticks. The wait is
 * what closes the window; retrying alone cannot, because the check confirms the value is there *now*
 * and hydration is free to wipe it a moment later.
 *
 * Use it for any controlled field filled soon after `goto`. A plain `fill()` is fine once the page has
 * been interacted with, and fine for an uncontrolled field.
 */
export async function fillSticky(field: Locator, value: string): Promise<void> {
  await hydrated(field);
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

/**
 * Wait until React has taken the control over, so typing into it reaches state.
 *
 * The `__reactFiber$…` property React marks its nodes with is the only honest signal from outside: it
 * says *this node's events now reach a component*, which is exactly the precondition. The load event,
 * a network idle or a fixed wait each answer a different question.
 *
 * Not a hydration flag of our own in `src/`, which would be a test-only attribute on a production
 * screen.
 */
export async function hydrated(field: Locator): Promise<void> {
  await expect(async () => {
    const owned = await field.evaluate((element): boolean =>
      Object.keys(element).some((key) => key.startsWith("__react")),
    );
    expect(owned).toBe(true);
  }).toPass({ timeout: 15_000 });
}

/** {@link fillSticky} for a day field, taking the fixture's ISO day and typing it as DF would. */
export async function fillDay(field: Locator, isoDay: string): Promise<void> {
  await fillSticky(field, typedDay(isoDay));
}
