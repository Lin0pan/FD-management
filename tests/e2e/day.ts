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
 * So the fill **waits for React to own the field** and is then retried until it sticks.
 *
 * The wait is what closes the window; the retry is what is left over. Retrying alone cannot close
 * it, and that is worth stating because it is what this helper used to do: the check confirms the
 * value is there *now*, and hydration is free to wipe it a moment later — the assertion has already
 * passed and moved on. Measured on a loaded runner: nine fields filled, the value verified on each,
 * and the first four blank by the time the form was read back. The retry only ever helped when
 * hydration happened to land *between* two of its attempts.
 *
 * Use it for any controlled field filled soon after `goto`. A plain `fill()` is fine once the page
 * has been interacted with, and fine for an uncontrolled field, which has no state to be re-rendered
 * from.
 */
export async function fillSticky(field: Locator, value: string): Promise<void> {
  await hydrated(field);
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

/**
 * Wait until React has taken the control over, so that typing into it reaches state.
 *
 * React marks every DOM node it owns with a `__reactFiber$…` property as it hydrates or mounts it,
 * which is the only honest signal available from outside: it says *this node's events now reach a
 * component*, which is exactly the precondition a fill needs. Anything else within reach — the load
 * event, a network idle, a fixed wait — answers a different question and is either too early or a
 * guess dressed as a wait.
 *
 * Not a hydration flag of our own in `src/`, which would be a test-only attribute on a production
 * screen, and one more thing to keep true.
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
