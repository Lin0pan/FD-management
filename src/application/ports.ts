/**
 * Ports — the repository and service interfaces the application layer depends on.
 *
 * Per the TDD approach (docs/fd_dev_setup_overview.md) these interfaces **emerge** from
 * application-layer test needs rather than being designed up front; `infrastructure/` supplies the
 * adapters and the tests supply hand-written fakes. The file stays type-only, so it carries no
 * untested runtime code.
 */

import type { IssuedCard } from "@/domain/card/card";
import type { NewCustomer, RegisteredCustomer } from "@/domain/customer/customer";
import type { GroupCounts } from "@/domain/customer/group";
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
 * The customer register.
 *
 * `create` is **one transaction**: the customer, their household members, the certificate and the
 * first card are written together or not at all, so a failure can leave neither a half-built
 * household nor a consumed customer number (tasks/prd-us-01-register-customer.md §US-01.4). The
 * adapter — not the caller — is the final authority on whether the chosen number was still free when
 * the write landed, and reports a lost race as `CustomerNumberTaken`.
 */
export interface CustomerRepository {
  /** The numbers held by customers who still occupy a slot; archived rows release theirs. */
  takenActiveNumbers(): Promise<ReadonlyArray<number>>;
  /** How many active customers each balancing group holds. */
  groupCounts(): Promise<GroupCounts>;
  /**
   * The customer with this surrogate id, or `null` if the id belongs to nobody. Archived customers
   * are returned like any other — their data stays queryable (US-10, US-11).
   */
  findById(id: number): Promise<RegisteredCustomer | null>;
  /**
   * Persist a new customer with everything that belongs to them.
   *
   * @throws {CustomerNumberTaken} if another registration took the number first.
   */
  create(customer: NewCustomer): Promise<RegisteredCustomer>;
}

/**
 * The cards a customer has been issued.
 *
 * The repository stores cards; it does not decide which one is valid. `currentCard` answers with the
 * highest index on record, and that card *is* the valid one (FR-4) — there is no flag to set and
 * none to clear when a replacement is issued. The adapter — not the caller — is the final authority
 * on whether an index was still free when the write landed, because the database holds the
 * `@@unique([customerId, index])` constraint that decides it.
 */
export interface CardRepository {
  /** The customer's highest-indexed card, or `null` if they hold none yet. */
  currentCard(customerId: number): Promise<IssuedCard | null>;
  /** Write one card for a customer, and hand it back as it was stored. */
  issue(customerId: number, card: IssuedCard): Promise<IssuedCard>;
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
