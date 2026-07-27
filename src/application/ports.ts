/**
 * Ports — the repository and service interfaces the application layer depends on.
 *
 * Per the TDD approach (docs/fd_dev_setup_overview.md) these interfaces **emerge** from
 * application-layer test needs rather than being designed up front; `infrastructure/` supplies the
 * adapters and the tests supply hand-written fakes. The file stays type-only, so it carries no
 * untested runtime code.
 */

import type { IssuedCard } from "@/domain/card/card";
import type {
  CustomerStatus,
  NeedsCertificate,
  NewCustomer,
  RegisteredCustomer,
} from "@/domain/customer/customer";
import type { GroupCounts } from "@/domain/customer/group";
import type {
  DistributionRecord,
  NewDistributionRecord,
} from "@/domain/distribution/distributionRecord";
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
 * A customer known to have left the register — a {@link RegisteredCustomer} whose archive reason and
 * date are narrowed to non-null.
 *
 * The pair is non-null *exactly* while the status is `ARCHIVED`, but nothing in the type system says
 * so, and the archive search would otherwise hand its callers two fields they must either re-check or
 * assert away. The adapter loads only archived rows, so it is the one place that can make the
 * narrowing honestly — and a row that arrives without its reason is a hand-edited database, which it
 * refuses rather than displays.
 */
export interface ArchivedCustomer extends RegisteredCustomer {
  readonly archiveReason: string;
  readonly archivedAt: Date;
}

/**
 * What staff typed into the archive search (US-11.1). Every criterion is optional on its own; that at
 * least one of them is given is the use case's rule, not the repository's.
 *
 * The names arrive **unfolded**, as typed. Folding them for comparison is the adapter's job, because
 * only the adapter knows they are stored folded — see `src/domain/customer/nameSearch.ts`.
 */
export interface ArchiveSearchQuery {
  readonly lastName?: string;
  readonly firstName?: string;
  readonly birthDate?: Date;
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
   * The customer a customer *number* resolves to — the slot's current holder for the counter lookup
   * (US-04.2). A number is a slot another household may hold once this one is archived, so the answer
   * is the **active** holder when there is one, and otherwise the **most recently archived** holder,
   * so a lookup of a freed-and-not-yet-reissued number still names who last had it rather than
   * nothing. `null` only when no customer has ever held the number.
   *
   * The card, household and certificate are loaded with the row — the counter reads them all without
   * a second query (US-04.3).
   */
  findByCustomerNumber(customerNumber: number): Promise<RegisteredCustomer | null>;
  /**
   * Every customer in one status, **lowest customer number first**, each with the household and the
   * current card the record carries. Ordering is the adapter's job because the database can do it.
   *
   * The status is asked for rather than assumed: "which households does this concern" is a decision
   * of the use case, and a method that quietly meant one particular status would hide it (US-13.2
   * wants active households only). At FD's ~240 customers a whole-register read is one query of a
   * few hundred rows, which is why no narrower query exists — see `listCardsDueForReissue` for why
   * the filtering it feeds cannot be pushed into SQL at all.
   */
  listWithStatus(status: CustomerStatus): Promise<ReadonlyArray<RegisteredCustomer>>;
  /**
   * The **archived** customers matching every criterion given, most recently archived first, at most
   * `limit` of them (US-11.1).
   *
   * Only archived rows are ever returned: this search exists to re-register someone who has left, and
   * an active household turning up in it would invite a second registration of a customer who already
   * holds a slot (FR-6). Names match on a prefix of the folded value, so `mueller` finds `Müller` and
   * `Muell` finds them both — the fold is `foldName`'s and the index is on the folded column, so the
   * comparison the database makes is the same one the domain defines.
   *
   * `limit` is the caller's, because "how many results are too many to read" is a decision of the
   * screen rather than of the store; a caller that wants to know whether there were more asks for one
   * beyond what it will show.
   */
  searchArchived(
    query: ArchiveSearchQuery,
    limit: number,
  ): Promise<ReadonlyArray<ArchivedCustomer>>;
  /**
   * Persist a new customer with everything that belongs to them.
   *
   * @throws {CustomerNumberTaken} if another registration took the number first.
   */
  create(customer: NewCustomer): Promise<RegisteredCustomer>;
  /**
   * Move a customer to a new status, storing `blockReason` with it in one transaction so the two
   * can never disagree: the trimmed reason for a move to `BLOCKED`, and `null` for any other status
   * (lifting a block clears it). The customer number, the cards and the distribution records are
   * left untouched — a status change is not a re-registration and frees nothing but the slot an
   * archive releases (US-08, US-10).
   */
  setStatus(id: number, status: CustomerStatus, blockReason: string | null): Promise<void>;
  /**
   * Archive a customer: the status, the trimmed reason and the instant it happened go out in **one
   * write**, so an archived row can never be left without the why that justified it. Any block
   * reason is cleared in the same statement — a household that is gone from the register is no
   * longer a paused one, and `blockReason` is non-null exactly while the status is `BLOCKED`.
   *
   * Nothing else is touched. The customer number stays on the row for the historical record, and the
   * slot is freed purely by the status: the partial unique index exempts archived rows, so the next
   * registration may take the number while the archived household keeps showing which one it held
   * (tasks/prd-us-10-archive-customer.md §7). Cards, certificates, distribution records, reminder
   * logs and notes are all left where they are — nothing about a customer is ever hard-deleted.
   */
  archive(id: number, reason: string, archivedAt: Date): Promise<void>;
}

/**
 * How many cards a customer has been through, and how many of those a loss caused (US-09.2).
 *
 * The two are counted apart because they answer different questions. `cardsIssued` says how many
 * numbers the household has held; `reissuesForLoss` is the only one staff weigh when they judge
 * whether someone loses cards unusually often, and a card replaced because a birthday overtook its
 * printed counts (US-13) is the software's doing rather than the household's — counting it as a loss
 * would put a decision in front of staff on the strength of a number that was never about them
 * (tasks/prd-us-09-reissue-card-after-loss.md §FR-5).
 */
export interface CardIssueCounts {
  /** The index of the card the customer holds; 0 for a customer holding none. */
  readonly cardsIssued: number;
  /** How many of the cards on file were issued because the previous one was lost. */
  readonly reissuesForLoss: number;
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
  /**
   * Every card the customer has ever been issued, **highest index first** — so the first element is
   * the one they hold and the rest are the numbers it replaced. Ordering is the adapter's job
   * because the database can do it in the query; a caller sorting it again would be a second, silent
   * statement of which card is current.
   */
  listCards(customerId: number): Promise<ReadonlyArray<IssuedCard>>;
  /**
   * Both of {@link CardIssueCounts} in **one aggregate query**. The run is deliberately not loaded
   * to be counted by the caller (US-09.2): the database can count, and application code that filtered
   * the run by reason would be a second, quietly diverging statement of what counts as a loss.
   */
  issueCounts(customerId: number): Promise<CardIssueCounts>;
  /** Write one card for a customer, and hand it back as it was stored. */
  issue(customerId: number, card: IssuedCard): Promise<IssuedCard>;
}

/**
 * The distribution records — the append-many history of hand-outs (US-05).
 *
 * The store keeps records; it does not decide the once-per-day rule. That lives in the domain
 * (`attendance.canRecord`) and, as a backstop the use case cannot bypass, in the database's unique
 * day-key constraint (US-05.3): the adapter — not the caller — is the final authority on whether a
 * record for the day already existed when the write landed, and reports a lost race as
 * {@link AlreadyServedToday}. Records outlive customer status changes and are never cascade-deleted;
 * only a same-day correction removes one.
 */
export interface DistributionRecordRepository {
  /** Every record ever written for the customer — the raw material the duplicate check reads. */
  listForCustomer(customerId: number): Promise<ReadonlyArray<DistributionRecord>>;
  /** The record with this surrogate id, or `null` if the id belongs to none. */
  findById(recordId: number): Promise<DistributionRecord | null>;
  /**
   * Write one hand-out and hand it back as stored, with its assigned id.
   *
   * @throws {AlreadyServedToday} if a record for the customer's day already existed when this landed.
   */
  create(record: NewDistributionRecord): Promise<DistributionRecord>;
  /** Amend the paid flag of a record made today, and return it as stored. */
  setPaid(recordId: number, paid: boolean): Promise<DistributionRecord>;
  /** Remove a record made today — the one deletion the history permits (US-05, FR-7). */
  remove(recordId: number): Promise<void>;
}

/**
 * One logged certificate reminder — a day of the documented trail an expired certificate starts at
 * the counter (US-06). `resultingCount` repeats the customer's count as it stood after this entry,
 * so the trail is readable on its own without replaying it.
 */
export interface ReminderLogEntry {
  /**
   * The Berlin calendar day the reminder was given, as the `YYYY-MM-DD` key `berlinDayKey` writes —
   * the same notion of "the same day" the attendance rule uses, because both happen at the counter
   * at a local moment (US-05.3 for the precedent).
   */
  readonly loggedOn: string;
  /** The customer's reminder count after this entry. */
  readonly resultingCount: number;
}

/**
 * The reminder trail (US-06). Entries are appended, never amended: a reminder that was given stays
 * given, and the one legitimate reset — a renewed certificate — resets the *count*, not the log.
 *
 * `record` is **one transaction**: the log entry and the customer's new `reminderCount` are written
 * together or not at all, so the count can never disagree with the trail. The adapter — not the
 * caller — is the final authority on at most one reminder per customer per day, because the database
 * holds the unique `(customerId, loggedOn)` constraint that decides it (US-06.3), and reports a lost
 * race as `ReminderAlreadyLoggedToday`.
 */
export interface ReminderLogRepository {
  /** The reminder logged for the customer on the given Berlin day, or `null` when there is none. */
  findOnDay(customerId: number, loggedOn: string): Promise<ReminderLogEntry | null>;
  /**
   * Write the entry and set the customer's `reminderCount` to its `resultingCount`, transactionally.
   *
   * @throws {ReminderAlreadyLoggedToday} if a reminder for that customer and day landed first.
   */
  record(customerId: number, entry: ReminderLogEntry): Promise<void>;
}

/**
 * The certificates a customer has presented over time.
 *
 * `renew` is **one transaction**: the renewed certificate and the reset of `reminderCount` to zero
 * are written together or not at all (US-06, FR-4) — a renewal that landed without its reset would
 * show a customer still owing a renewal they have just brought. Certificates are appended, never
 * overwritten; the current one is the latest on record (US-06.3), so the history of renewals stays
 * readable.
 */
export interface CertificateRepository {
  /** Append the renewed certificate at `recordedAt` and reset the customer's count to zero. */
  renew(customerId: number, certificate: NeedsCertificate, recordedAt: Date): Promise<void>;
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
  /**
   * The reason a human gave for the change, or `""` where none was required. The one machine-written
   * value: a logged reminder records its resulting count here (`reminderCount=2`), because the entry
   * must tell the trail's state on its own and no human reason is asked for (US-06.2).
   */
  readonly why: string;
}

/** The append-only audit log. Entries are never amended or removed. */
export interface AuditLog {
  append(entry: AuditEntry): Promise<void>;
}
