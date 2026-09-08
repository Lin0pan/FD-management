import { readFileSync } from "node:fs";
import type { Clock } from "@/application/ports";

/**
 * The file the end-to-end suite pins "now" with. Read from the environment once, at module load, so a
 * deployment cannot acquire a fixed clock while it runs.
 */
const FIXED_NOW_FILE = process.env.FD_FIXED_NOW_FILE;

/**
 * The instant that file names, or `null`. Read on every call rather than cached — that is the point:
 * a spec rewrites the file to move today from one distribution week to the next without restarting
 * the server. An unusable file falls back to the wall clock; a half-written one must not take a
 * screen down.
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
 * The real, system-backed clock adapter — the only place in the codebase the wall clock is read.
 *
 * End-to-end tests cannot pass a fake, since they drive the built app from the outside, so this
 * carries the seam they need: with `FD_FIXED_NOW_FILE` set, "now" is the ISO instant that file holds
 * (`tests/e2e/distribution.spec.ts`). Composition roots keep naming `systemClock`, so there is still
 * exactly one answer to "what time is it".
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
