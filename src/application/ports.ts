/**
 * Ports — the repository and service interfaces the application layer depends on.
 *
 * Placeholder for the walking skeleton. Per the TDD approach
 * (docs/fd_dev_setup_overview.md), these interfaces should **emerge** from application-layer test
 * needs rather than being designed up front, and the `infrastructure/` adapters implement them.
 * Kept type-only for now so it carries no untested runtime code.
 */

/** Injectable time source. Every time-dependent domain rule reads "now" through this port. */
export interface Clock {
  now(): Date;
}
