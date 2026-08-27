import { expect, type Locator } from "@playwright/test";

/**
 * Assertions about what a screen actually *shows*, as opposed to what it renders.
 *
 * Every other assertion in this suite reads the DOM, and the DOM is not the screen. A row can be
 * present, populated, correct and `toBeVisible()` — Playwright's visibility is a non-empty box and a
 * `visibility`/`display` that do not hide it — while an opaque element is painted on top of it. That
 * is not a hypothetical: `/kunden` shipped with a sticky table header offset 48px into a scrollport
 * whose scroll top was 0, which pushes a sticky box *down* rather than leaving it alone. The header
 * covered the first row of the register at every window narrower than 1280px. Fifteen specs asserted
 * that row's contents and all fifteen passed, because the row was there — DF simply could not see it,
 * and reported a customer missing from the list.
 *
 * So the check here is the browser's own: hit-test the middle of the element and ask what would be
 * clicked. Nothing else in the suite can see a covered element.
 */

/**
 * The width the two device descriptors give every other spec — and, not by accident, the width the
 * concept names as DF's target. It is exactly the `xl` breakpoint, which is the one width at which
 * the bug above could not happen: a suite pinned to a breakpoint tests one side of it.
 */
export const GATE_WIDTH = 1280;

/**
 * A window narrower than the `xl` breakpoint, in the same shape DF's is.
 *
 * DF do not work maximised, Safari's page zoom is remembered per site, and a classic scrollbar takes
 * its width out of the viewport a media query is answered against — so "below 1280" is an ordinary
 * Tuesday rather than an edge case, and any layout that switches at a breakpoint has a second side
 * that somebody has to look at. 1100×800 is a plausible Safari window on a 1440-wide MacBook.
 */
export const BELOW_BREAKPOINT = { width: 1100, height: 800 } as const;

/**
 * What is painted over the centre of `target`, or `null` when the answer is `target` itself.
 *
 * The centre point is the same point Playwright would click, so a non-null answer here is also an
 * element the staff member cannot click. Returns a description rather than a boolean, because the
 * name of the thing on top is the whole diagnosis: `THEAD ▸ TH "Kundennummer"` says "the sticky
 * header is over the first row" and a `false` says nothing at all.
 *
 * @throws if the element's centre lies outside the viewport, where the browser cannot hit-test at
 *   all — scroll it into view first, and be aware that scrolling is what moves a sticky element.
 */
export async function coveringElement(target: Locator): Promise<string | null> {
  return target.evaluate((element: Element) => {
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
      throw new Error(`The centre of the element is outside the viewport (${x}, ${y}).`);
    }
    const hit = document.elementFromPoint(x, y);
    if (hit === null) {
      return "nothing at all — the point is not painted";
    }
    // A cell inside the row is the row: the question is whether something *else* is on top.
    if (element.contains(hit)) {
      return null;
    }
    const owner = hit.closest("thead, header, nav, dialog, [role='dialog']") ?? hit;
    const text = (hit.textContent ?? "").trim().slice(0, 40);
    return `${owner.tagName} ▸ ${hit.tagName}${text === "" ? "" : ` "${text}"`}`;
  });
}

/**
 * Fail unless `target` is the thing on screen where `target` is.
 *
 * `what` names the element in the failure message — the message is read by somebody who cannot see
 * the screen it describes, so "die erste Zeile der Liste" earns its place.
 */
export async function expectNothingCovers(target: Locator, what: string): Promise<void> {
  expect(await coveringElement(target), `${what} is covered on screen`).toBeNull();
}
