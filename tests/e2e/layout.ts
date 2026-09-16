import { expect, type Locator } from "@playwright/test";

/**
 * Assertions about what a screen actually *shows*, as opposed to what it renders.
 *
 * Every other assertion in this suite reads the DOM, and the DOM is not the screen: a row can be
 * present, correct and `toBeVisible()` while an opaque element is painted on top of it. Not
 * hypothetical — `/kunden` shipped a sticky header covering the register's first row at every window
 * narrower than 1280px, and fifteen specs asserting that row's contents all passed.
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
 * What is painted over the centre of `target`, or `null` when the answer is `target` itself. The
 * centre is the point Playwright would click, so a non-null answer is also an element staff cannot
 * click. It returns a *description* rather than a boolean, the name of the thing on top being the
 * whole diagnosis.
 *
 * @throws if the element's centre lies outside the viewport, where the browser cannot hit-test —
 *   scroll it into view first, and be aware that scrolling is what moves a sticky element.
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

/**
 * Fail unless `target` fits inside its own box — nothing of it reachable only by scrolling sideways.
 *
 * The one width DF gave us was a long name, and it never scrolled the *window*: the register's
 * container absorbed it below `xl` and the table simply grew out of its card above. So this is
 * pointed at whichever box is meant to be the boundary — `html` for the page, the table's container
 * for a table — rather than at the page alone.
 */
export async function expectNoHorizontalOverflow(target: Locator, what: string): Promise<void> {
  const overflow = await target.evaluate(
    (element: Element) => element.scrollWidth - element.clientWidth,
  );
  // A pixel of slack: a fractional layout rounds one way in Chromium and the other in WebKit.
  expect(overflow, `${what} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
}

/**
 * Fail unless `target` is genuinely cut off — its content wider than the box painting it.
 *
 * The other half of {@link expectNoHorizontalOverflow}, and not redundant with it: a ceiling set
 * wide enough to cut nothing would satisfy the overflow check for ever while the ellipsis that
 * earned it had quietly stopped appearing.
 */
export async function expectTruncated(target: Locator, what: string): Promise<void> {
  const hidden = await target.evaluate(
    (element: Element) => element.scrollWidth - element.clientWidth,
  );
  expect(hidden, `${what} is not cut off`).toBeGreaterThan(0);
}

/**
 * Fail unless `inner` lies within the horizontal bounds of `outer`.
 *
 * Neither `toBeVisible()` nor a hit-test can see this one: an element that has grown out of its card
 * is still visible, still clickable and still correct in the DOM — it is only in the wrong place, and
 * the boxes are the only record of that. Horizontal only, because vertical growth is what a page is
 * for.
 */
export async function expectWithin(inner: Locator, outer: Locator, what: string): Promise<void> {
  const [innerBox, outerBox] = await Promise.all([inner.boundingBox(), outer.boundingBox()]);
  expect(innerBox, `${what} has no box`).not.toBeNull();
  expect(outerBox, `the box ${what} must fit into has no box`).not.toBeNull();
  const left = (innerBox?.x ?? 0) - (outerBox?.x ?? 0);
  const right =
    (outerBox?.x ?? 0) + (outerBox?.width ?? 0) - ((innerBox?.x ?? 0) + (innerBox?.width ?? 0));
  expect(Math.min(left, right), `${what} sticks out sideways`).toBeGreaterThanOrEqual(-1);
}
