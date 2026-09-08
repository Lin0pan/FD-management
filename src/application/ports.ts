/**
 * Ports — the repository and service interfaces the application layer depends on (ADR-001).
 *
 * They **emerge** from application-layer test needs rather than being designed up front
 * (`docs/architecture/08-crosscutting-concepts.md` §Testing strategy): `infrastructure/` supplies the
 * adapters, the tests supply fakes. Type-only, so the file carries no untested runtime code.
 */

import type { IssuedCard, NewCard } from "@/domain/card/card";
import type { ValidUntilRange } from "@/domain/customer/certificate";
import type {
  CustomerStatus,
  HouseholdMemberDetails,
  NeedsCertificate,
  NewCustomer,
  PersonalDetails,
  RegisteredCustomer,
} from "@/domain/customer/customer";
import type { WaitingListDetails } from "@/domain/customer/waitingList";
import type {
  DistributionRecord,
  NewDistributionRecord,
} from "@/domain/distribution/distributionRecord";
import type { Cents } from "@/domain/money";
import type { SettingsVersion } from "@/domain/policy/settings";

/** Injectable time source. Every time-dependent domain rule reads "now" through this port. */
export interface Clock {
  now(): Date;
}

/**
 * The immutable policy versions, each stamped with the instant it took over. No `update` and no
 * `delete` by design — a past distribution's price is only recoverable from the version in force
 * then (ADR-005).
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
 * A {@link RegisteredCustomer} whose archive reason and date are narrowed to non-null.
 *
 * The pair is non-null exactly while the status is `ARCHIVED`, but the type system cannot say so.
 * The adapter loads only archived rows, so it is the one place that can narrow honestly — and a row
 * arriving without its reason is a hand-edited database, which it refuses.
 */
export interface ArchivedCustomer extends RegisteredCustomer {
  readonly archiveReason: string;
  readonly archivedAt: Date;
}

/**
 * What staff typed into the archive search (US-11.1). Every criterion is optional here; that at least
 * one is given is the use case's rule. Names arrive **unfolded** — folding is the adapter's job,
 * because only it knows they are stored folded (`src/domain/customer/nameSearch.ts`).
 */
export interface ArchiveSearchQuery {
  readonly lastName?: string;
  readonly firstName?: string;
  readonly birthDate?: Date;
}

/**
 * What a staff member typed into the customer list's search box, once read (US-15.1). Which of the
 * two it is was decided by the caller, since *what a card number looks like* is a domain rule
 * (`counterQueryOrNull`), not a storage detail.
 *
 * A card number arrives as the customer number it resolves to; the index is dropped, because the list
 * is about households rather than which piece of card is current (US-04).
 */
export type CustomerListSearch =
  | {
      readonly kind: "NAME";
      /** The name **as typed**, unfolded — folding it for comparison is the adapter's job. */
      readonly name: string;
    }
  | { readonly kind: "CUSTOMER_NUMBER"; readonly customerNumber: number };

/**
 * How the customer list narrows the register (US-15.2). Every criterion here is a `WHERE` clause.
 *
 * **The group is deliberately not among them.** A group is the parity of a number (ADR-017), SQLite
 * cannot express `% 2` in a `WHERE`, and a stored parity key would be the second recording US-31
 * removed. `listCustomers` and `readGroupRoster` narrow the returned rows instead — the register is
 * bounded by the quota, so the widest scan is `quotaN` rows.
 *
 * `statuses` is never absent: which statuses a list shows is a decision with a default, made by the
 * use case, so no store has to guess it.
 */
export interface CustomerListQuery {
  /** The statuses to include; never empty, and never implicitly all of them. */
  readonly statuses: ReadonlyArray<CustomerStatus>;
  readonly search?: CustomerListSearch;
  /**
   * The range the household's **current** certificate's `validUntil` must fall in, as
   * `validUntilRangeFor` computed it from today. The window is the domain's, so the filter and the
   * label the screen prints on the row cannot mean two different things.
   */
  readonly certificate?: ValidUntilRange;
}

/**
 * The customer register.
 *
 * `create` is **one transaction** — customer, members, certificate and first card together or not at
 * all, so a failure leaves neither a half-built household nor a consumed number
 * (`tasks/prd-us-01-register-customer.md` §US-01.4). The adapter, not the caller, is the final
 * authority on whether the number was still free, and reports a lost race as `CustomerNumberTaken`.
 */
export interface CustomerRepository {
  /** The numbers held by customers who still occupy a slot; archived rows release theirs. */
  takenActiveNumbers(): Promise<ReadonlyArray<number>>;
  /** The customer with this id, or `null`. Archived customers are returned like any other. */
  findById(id: number): Promise<RegisteredCustomer | null>;
  /**
   * The customer a customer *number* resolves to (US-04.2): the **active** holder when there is one,
   * otherwise the **most recently archived**, so a freed-and-not-yet-reissued number still names who
   * last had it. `null` only when nobody has ever held it.
   *
   * The card, household and certificate load with the row — the counter reads them all in one query
   * (US-04.3).
   */
  findByCustomerNumber(customerNumber: number): Promise<RegisteredCustomer | null>;
  /**
   * Every customer in one status, **lowest customer number first**, with household and current card.
   * Ordering is the adapter's job because the database can do it.
   *
   * The status is asked for rather than assumed — which households a use case concerns is its own
   * decision. At ~240 customers a whole-register read is one query of a few hundred rows, which is
   * why no narrower one exists; `listCardsDueForReissue` says why its filter cannot reach SQL.
   */
  listWithStatus(status: CustomerStatus): Promise<ReadonlyArray<RegisteredCustomer>>;
  /**
   * The customers matching `query`, **lowest customer number first** — the call-up order staff think
   * in (US-15.1, FR-6). Each row carries the household, certificate and current card, because every
   * column of the list is derived from them, so no column can have fallen behind (PRD §7).
   */
  list(query: CustomerListQuery): Promise<ReadonlyArray<RegisteredCustomer>>;
  /**
   * The **archived** customers matching every criterion, most recently archived first, at most
   * `limit` (US-11.1). Only archived rows: an active household turning up here would invite a second
   * registration of somebody who already holds a slot (FR-6).
   *
   * Names match on a prefix of the folded value, using `foldName` and the index on the folded column,
   * so the database's comparison is the domain's. `limit` is the caller's, since how many results are
   * too many is the screen's decision — one beyond what it shows answers "were there more".
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
   * Replace a customer's household with exactly `members`, in **one transaction** (US-16.1).
   *
   * A replacement rather than add-and-remove because the household is a set, and two half-applied
   * statements would leave a household nobody typed. The previous rows are gone: no history of past
   * compositions is kept (`tasks/prd-us-16-maintain-customer-record.md` §FR-2), and what a card was
   * printed with survives on the card. Nothing derived is written with them.
   */
  updateHousehold(id: number, members: ReadonlyArray<HouseholdMemberDetails>): Promise<void>;
  /**
   * Correct who the customer is and where they live, together with their household, in **one
   * transaction** (US-16.2).
   *
   * The household travels with the personal data because the customer *is* one of its rows, and a
   * write moving only one would leave a household listing a person who no longer exists. The caller
   * has already found their row (`replaceHouseholdMember`, a domain rule), so the set arrives as it
   * should stand — and goes out even when nothing in it moved, so there is one code path.
   *
   * The customer number is deliberately unreachable here: a slot is not part of who the customer is,
   * so correcting a misspelt name is not the moment to move one ({@link changeCustomerNumber} is,
   * with its own audit entry and card; US-16.2 §FR-7, US-30).
   *
   * The folded search keys are the adapter's to rewrite in the same statement as the names, or the
   * register would be findable only under a spelling nobody uses any more (US-11.1).
   */
  updateDetails(
    id: number,
    details: PersonalDetails,
    household: ReadonlyArray<HouseholdMemberDetails>,
  ): Promise<void>;
  /**
   * Replace the free-text note, which may be `""` (US-16.3). Its own method rather than part of
   * {@link updateDetails} because it is its own decision with its own audit entry — a note left for
   * the counter is not a correction of the record.
   */
  updateNotes(id: number, notes: string): Promise<void>;
  /**
   * Move a customer to another slot **and issue the card that goes with it, in one transaction**
   * (US-30). Two writes would leave a window in which a household holds 23 and carries `5k4`, with
   * nothing in the system able to notice.
   *
   * The card arrives as a {@link NewCard}, without the slot — read off the customer row after the
   * update, for {@link CardRepository.issue}'s reason. Its `index` is the caller's, being a rule
   * (`nextCardIndex` over the **new** slot's run) rather than a column to copy.
   *
   * **No card is re-labelled**: the run left on the old slot is what makes it safe to hand out again
   * (US-25).
   *
   * @returns the card as it was stored, carrying the new slot.
   * @throws {CustomerNumberTaken} if an active customer took the number first.
   * @throws {CardNumberTaken} if the index was printed on the new slot in the meantime.
   */
  changeCustomerNumber(id: number, customerNumber: number, card: NewCard): Promise<IssuedCard>;
  /**
   * Move a customer to a new status, storing `blockReason` in the same transaction so the two cannot
   * disagree: the trimmed reason for `BLOCKED`, `null` otherwise. Number, cards and records are
   * untouched — a status change frees nothing but the slot an archive releases (US-08, US-10).
   */
  setStatus(id: number, status: CustomerStatus, blockReason: string | null): Promise<void>;
  /**
   * Archive a customer: status, trimmed reason and instant in **one write**, so an archived row is
   * never left without the why that justified it. Any block reason is cleared in the same statement.
   *
   * The customer number stays on the row for the record; the slot is freed purely by the status,
   * because the partial unique index exempts archived rows
   * (`tasks/prd-us-10-archive-customer.md` §7). Nothing else is touched (ADR-010).
   */
  archive(id: number, reason: string, archivedAt: Date): Promise<void>;
}

/**
 * An application about to go on the waiting list. `addedOn` is the whole of a place in the queue
 * (US-12, FR-3): no position column to keep in step, and nothing to renumber on a promotion.
 */
export interface NewWaitingListEntry extends WaitingListDetails {
  readonly addedOn: Date;
}

/**
 * A persisted waiting-list entry. `id` is the surrogate key and, since rows are numbered as written,
 * the tie-break between two applicants added the same day (`src/domain/customer/waitingList.ts`).
 */
export interface WaitingListEntry extends NewWaitingListEntry {
  readonly id: number;
}

/**
 * The waiting list (US-12).
 *
 * Entries are **retained, never deleted** (FR-7): a removal stamps the row, so past promotions stay
 * reconstructable and "first come, first served" is a claim DF can still defend a year later. There
 * is no `delete`, and everything handed back is the *waiting* list.
 *
 * It deliberately promises no ordering — `nextInLine` decides who is next, so the screen, the banner
 * and the promotion cannot each arrive at a different head.
 */
export interface WaitingListRepository {
  /** Every applicant still waiting — the rows no removal has stamped. */
  listWaiting(): Promise<ReadonlyArray<WaitingListEntry>>;
  /** The applicant still waiting under this id, or `null` for an unknown or already-removed one. */
  findWaiting(entryId: number): Promise<WaitingListEntry | null>;
  /** Put an applicant on the list and hand the entry back with the id it was given. */
  add(entry: NewWaitingListEntry): Promise<WaitingListEntry>;
  /**
   * Take an applicant off the list at `removedOn`, keeping the row and the reason. Required, because
   * there are only two ways off — registered or withdrawn — and a row that cannot say which is a gap
   * in the ordering history the retention exists for.
   */
  remove(entryId: number, reason: string, removedOn: Date): Promise<void>;
}

/**
 * How many cards a customer has been through, and how many of those a loss caused (US-09.2).
 *
 * Counted apart because a card replaced when a birthday overtook its printed counts (US-13) is the
 * software's doing, not the household's — counting it as a loss would put a judgement in front of
 * staff on a number that was never about them (`tasks/prd-us-09-reissue-card-after-loss.md` §FR-5).
 */
export interface CardIssueCounts {
  /** How many cards this customer has been issued; 0 for a customer holding none. */
  readonly cardsIssued: number;
  /** How many of the cards on file were issued because the previous one was lost. */
  readonly reissuesForLoss: number;
}

/**
 * The cards a customer has been issued. The store does not decide which is valid: the highest index
 * on record *is* the valid card (FR-4), so there is no flag to set or clear.
 *
 * The adapter is the final authority on a free index, holding both constraints —
 * `@@unique([customerId, index])` for a race between two issues on one record, and
 * `@@unique([customerNumber, index])` for a card number already printed (US-25).
 */
export interface CardRepository {
  /** The customer's highest-indexed card, or `null` if they hold none yet. */
  currentCard(customerId: number): Promise<IssuedCard | null>;
  /**
   * The highest index any card ever carried on that customer number, **0** when none did. Archived
   * holders count — a printed card exists whatever became of the household carrying it (US-25).
   *
   * Deliberately not `currentCard(customerId).index`. The two agree for every active household, but
   * that invariant is exactly what the counting rule must not have to remember; only the store can
   * see the archived holders anyway.
   */
  highestIndexForNumber(customerNumber: number): Promise<number>;
  /**
   * The plural of {@link CardRepository.highestIndexForNumber}, in one aggregate query — the number
   * control names the card number every slot would print (US-30.4), and asking one slot at a time is
   * ~240 round trips for one dropdown.
   *
   * A slot **absent** from the map has never had a card, which is honest where a `0` written down 240
   * times is not; callers read `map.get(n) ?? 0`.
   */
  highestIndexByNumber(): Promise<ReadonlyMap<number, number>>;
  /**
   * Every card the customer has been issued, **highest index first** — the first is the one they
   * hold. Ordering is the adapter's job; a caller sorting it again would be a second, silent
   * statement of which card is current.
   */
  listCards(customerId: number): Promise<ReadonlyArray<IssuedCard>>;
  /**
   * Both of {@link CardIssueCounts} in **one aggregate query** (US-09.2). Application code filtering
   * the run by reason would be a second, quietly diverging statement of what counts as a loss.
   */
  issueCounts(customerId: number): Promise<CardIssueCounts>;
  /**
   * Write one card and hand it back as stored. The caller passes a {@link NewCard} — everything but
   * the slot, which is read off the customer row inside the write's own transaction, because a caller
   * that could pass it could pass the wrong one.
   */
  issue(customerId: number, card: NewCard): Promise<IssuedCard>;
}

/**
 * The distribution records — the append-many history of hand-outs (US-05).
 *
 * The store does not decide the once-per-day rule: that is `attendance.canRecord`'s, backstopped by
 * the database's unique day-key constraint (US-05.3), which makes the adapter the final authority on
 * a lost race and reports it as {@link AlreadyServedToday}. Records are never cascade-deleted
 * (ADR-010); only a same-day correction removes one.
 */
export interface DistributionRecordRepository {
  /** Every record ever written for the customer — the raw material the duplicate check reads. */
  listForCustomer(customerId: number): Promise<ReadonlyArray<DistributionRecord>>;
  /**
   * Every hand-out written on one day, in **one** query, so "which of this group have collected?"
   * (US-23) reads the day once instead of once per household.
   *
   * `dayKey` is the **Berlin** day as `berlinDayKey` writes it. The caller derives it from the
   * {@link Clock} and the adapter matches it rather than re-deriving, so the two cannot drift to
   * different answers about when today ended.
   */
  listForDay(dayKey: string): Promise<ReadonlyArray<DistributionRecord>>;
  /** The record with this surrogate id, or `null` if the id belongs to none. */
  findById(recordId: number): Promise<DistributionRecord | null>;
  /**
   * Write one hand-out and hand it back as stored, with its assigned id.
   *
   * @throws {AlreadyServedToday} if a record for the customer's day already existed when this landed.
   */
  create(record: NewDistributionRecord): Promise<DistributionRecord>;
  /** Amend the amount handed over on a record made today, and return it as stored. */
  setPayment(recordId: number, paidCents: Cents): Promise<DistributionRecord>;
  /** Remove a record made today — the one deletion the history permits (US-05, FR-7). */
  remove(recordId: number): Promise<void>;
}

/**
 * One logged certificate reminder (US-06). `resultingCount` repeats the count as it stood after this
 * entry, so the trail is readable without replaying it.
 */
export interface ReminderLogEntry {
  /** The Berlin day the reminder was given, as `berlinDayKey` writes it — both happen at a counter. */
  readonly loggedOn: string;
  /** The customer's reminder count after this entry. */
  readonly resultingCount: number;
}

/**
 * The reminder trail (US-06). Entries are appended, never amended — the one legitimate reset, a
 * renewed certificate, resets the *count* and not the log.
 *
 * `record` is **one transaction**, so the count can never disagree with the trail. The unique
 * `(customerId, loggedOn)` constraint makes the adapter the final authority on one reminder per day
 * (US-06.3), reported as `ReminderAlreadyLoggedToday`.
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
 * The certificates a customer has presented over time. Appended, never overwritten — the current one
 * is the latest on record (US-06.3).
 *
 * `renew` is **one transaction**: a renewal landing without its `reminderCount` reset would show a
 * customer still owing the renewal they have just brought (US-06, FR-4).
 */
export interface CertificateRepository {
  /** Append the renewed certificate at `recordedAt` and reset the customer's count to zero. */
  renew(customerId: number, certificate: NeedsCertificate, recordedAt: Date): Promise<void>;
}

/**
 * One append-only audit record: *what* changed, *when* and *why* — never *who*, since DF has ruled
 * out login and the system cannot tell its staff apart (ADR-006).
 */
export interface AuditEntry {
  /** A stable, machine-readable event name such as `settings.updated`. */
  readonly what: string;
  /** The names of the fields this change touched. */
  readonly changedFields: ReadonlyArray<string>;
  readonly when: Date;
  /**
   * The reason a human gave, or `""` where none was required — and the one machine-written value, for
   * changes that ask for no reason but must still tell their own story: `reminderCount=2` (US-06.2),
   * `customerNumber=5→23` (US-30).
   */
  readonly why: string;
}

/** The append-only audit log. Entries are never amended or removed. */
export interface AuditLog {
  append(entry: AuditEntry): Promise<void>;
}
