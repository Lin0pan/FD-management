/**
 * Ports — the repository and service interfaces the application layer depends on.
 *
 * Per the TDD approach (docs/fd_dev_setup_overview.md) these interfaces **emerge** from
 * application-layer test needs rather than being designed up front; `infrastructure/` supplies the
 * adapters and the tests supply hand-written fakes. The file stays type-only, so it carries no
 * untested runtime code.
 */

import type { SettingsVersion } from "@/domain/policy/settings";

/** Injectable time source. Every time-dependent domain rule reads "now" through this port. */
export interface Clock {
  now(): Date;
}

/**
 * The immutable policy versions, each stamped with the instant it took over. There is no `update`
 * and no `delete` by design: history is append-only because a past distribution's price can only be
 * recovered from the version that was in force then (docs/tech_stack_architecture_sketch.md §5.1).
 */
export interface SettingsRepository {
  listVersions(): Promise<SettingsVersion[]>;
  append(version: SettingsVersion): Promise<void>;
}

/** How many customers currently hold a slot — the reality the quota `N` may not fall below. */
export interface CustomerCounter {
  countActive(): Promise<number>;
}

/**
 * One append-only audit record: *what* changed, *when* and *why* — never *who*. FD has ruled out
 * login, so the system cannot tell its staff apart and the log deliberately has no actor field
 * (docs/tech_stack_architecture_sketch.md §5.2).
 */
export interface AuditEntry {
  /** A stable, machine-readable event name such as `settings.updated`. */
  readonly what: string;
  /** The names of the fields this change touched. */
  readonly changedFields: ReadonlyArray<string>;
  readonly when: Date;
  /** The reason a human gave for the change, or `""` where none was required. */
  readonly why: string;
}

/** The append-only audit log. Entries are never amended or removed. */
export interface AuditLog {
  append(entry: AuditEntry): Promise<void>;
}
