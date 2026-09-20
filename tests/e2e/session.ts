import { expect, type Browser, type Page } from "@playwright/test";
import type { GroupOption } from "@/app/ausgabe/session-options";
import { hydrated } from "./day";

/**
 * Starting and ending the afternoon a spec records its hand-outs in
 * (`tasks/prd-us-34-distribution-session.md` §US-34.10).
 *
 * **Through the real controls, never through Prisma.** A row written behind the screen would leave
 * every spec here green while „Ausgabe starten" was broken, which is the one thing this suite is for
 * — the rule these helpers set up is the rule the screen is the front of. `seedEndedSession` in
 * `seeding.ts` is the deliberate exception and says so: it makes a *past* afternoon for a seeded
 * hand-out to hang on, which no screen can produce.
 *
 * The register is shared and ordered, so **a session a spec starts is one it has to end**: a running
 * one is state the file sorting after it would inherit, and the second `startSession` would be
 * refused by the database rather than by anything the next spec meant to test.
 */

/**
 * Start an afternoon serving `groups`, as a staff member does: pick the radio, press the button.
 *
 * A session the previous attempt left running is ended first. CI runs with `retries: 2` and these
 * blocks are `mode: "serial"`, so a retry replays `beforeAll` against the register the failed
 * attempt left behind — the same reason `releaseNumbers` exists, and without this the retry would
 * die on „Es läuft bereits eine Ausgabe" nowhere near the hiccup that caused it.
 */
export async function startSession(page: Page, groups: GroupOption): Promise<void> {
  await page.goto("/ausgabe");
  if ((await page.getByTestId("session-header").count()) > 0) {
    await endSession(page);
  }

  // The form is a `useActionState` one, so pressing the button before React owns it submits nothing
  // at all — the window `day.ts` explains, and the radio is inside the same form.
  await hydrated(page.getByTestId("session-start-submit"));
  await page.locator(`#session-groups-${groups}`).check();
  await page.getByTestId("session-start-submit").click();

  await expect(page.getByTestId("session-header")).toBeVisible();
}

/**
 * End the running afternoon through its two-step confirmation, leaving the screen on the start form.
 *
 * @throws if no afternoon is running — a spec that thinks it started one and did not has a fault
 * worth reporting here rather than three assertions later.
 */
export async function endSession(page: Page): Promise<void> {
  await page.goto("/ausgabe");
  await expect(page.getByTestId("session-header")).toBeVisible();

  await page.getByTestId("session-end-open").click();
  await page.getByTestId("session-end-submit").click();

  await expect(page.getByTestId("session-start-submit")).toBeVisible();
}

/**
 * The fixtures a hook needs to open a page of its own.
 *
 * `beforeAll` and `afterAll` refuse the `page` fixture outright — it is created per test — so a hook
 * that has to drive the screen builds its own from `browser`. `baseURL` has to come with it: a page
 * made this way inherits nothing from the project's `use` block, and a relative `goto` would have
 * no server to resolve against.
 */
export interface HookFixtures {
  readonly browser: Browser;
  readonly baseURL: string | undefined;
}

/** {@link startSession} from a `beforeAll`, on a page of the hook's own. */
export async function startSessionInHook(
  { browser, baseURL }: HookFixtures,
  groups: GroupOption,
): Promise<void> {
  const page = await browser.newPage({ baseURL });
  try {
    await startSession(page, groups);
  } finally {
    await page.close();
  }
}

/**
 * End whatever this spec left running, from an `afterAll`.
 *
 * **Silent when nothing runs**, unlike {@link endSession}: `afterAll` runs even when the block failed
 * before it ever started one, and a teardown that throws there buries the failure that matters under
 * its own.
 */
export async function endSessionInHook({ browser, baseURL }: HookFixtures): Promise<void> {
  const page = await browser.newPage({ baseURL });
  try {
    await page.goto("/ausgabe");
    if ((await page.getByTestId("session-header").count()) > 0) {
      await endSession(page);
    }
  } finally {
    await page.close();
  }
}
