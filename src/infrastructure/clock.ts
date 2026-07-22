import type { Clock } from "@/application/ports";

/**
 * The real, system-backed clock adapter.
 *
 * Domain and application code never call `new Date()` directly — they receive a {@link Clock} so
 * that time-dependent rules (13th-birthday reclassification, certificate expiry, week-colour
 * alternation, stamping a settings change) can be driven by a fake clock in tests. This is the only place
 * the wall clock is read; a settable fake lives alongside the domain tests in a later session.
 */
export const systemClock: Clock = {
  now: () => new Date(),
};
