import { readFileSync } from "node:fs";
import type { Clock } from "@/application/ports";

/**
 * The file the end-to-end suite pins "now" with, named by `FD_FIXED_NOW_FILE`.
 *
 * Unset in every real deployment, so {@link systemClock} is the wall clock unless a test says
 * otherwise. It is read from the environment once, at module load: a deployment cannot acquire a
 * fixed clock while it runs.
 */
const FIXED_NOW_FILE = process.env.FD_FIXED_NOW_FILE;

/**
 * The instant that file names, or `null` if it is missing or unreadable as a date.
 *
 * Read on every call rather than cached, because that is the point: a Playwright spec rewrites the
 * file to move the app's today from one distribution week to the next without restarting the
 * server. A file that says nothing usable falls back to the wall clock instead of failing — a
 * half-written file must not take a screen down.
 */
function pinnedNow(file: string): Date | null {
  try {
    const instant = new Date(readFileSync(file, "utf8").trim());
    return Number.isNaN(instant.getTime()) ? null : instant;
  } catch {
    return null;
  }
}

/**
 * The real, system-backed clock adapter.
 *
 * Domain and application code never call `new Date()` directly — they receive a {@link Clock} so
 * that time-dependent rules (13th-birthday reclassification, certificate expiry, week-colour
 * alternation, stamping a settings change) can be driven by a fake clock in tests. This is the only
 * place the wall clock is read; unit tests pass a hand-written fake instead.
 *
 * End-to-end tests cannot pass a fake — they drive the built app from the outside — so this adapter
 * carries the one seam they need: with `FD_FIXED_NOW_FILE` set, "now" is whatever ISO instant that
 * file holds (see `tests/e2e/distribution.spec.ts`). Composition roots keep naming `systemClock`;
 * the override lives here so there is still exactly one place in the codebase that answers "what
 * time is it".
 */
export const systemClock: Clock = {
  now: () => {
    if (FIXED_NOW_FILE !== undefined) {
      const pinned = pinnedNow(FIXED_NOW_FILE);
      if (pinned !== null) {
        return pinned;
      }
    }
    return new Date();
  },
};
