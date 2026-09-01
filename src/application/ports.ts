/**
 * Ports — the repository and service interfaces the application layer depends on.
 *
 * Per the TDD approach (docs/architecture/08-crosscutting-concepts.md §Testing strategy) these interfaces **emerge** from
 * application-layer test needs rather than being designed up front; `infrastructure/` supplies the
 * adapters and the tests supply hand-written fakes. The file stays type-only, so it carries no
 * untested runtime code.
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
import type { Group, GroupCounts } from "@/domain/customer/group";
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
 * The immutable policy versions, each stamped with the instant it took over. There is no `update`
 * and no `delete` by design: history is append-only because a past distribution's price can only be
 * recovered from the version that was in force then (docs/architecture/adr/005-keep-business-rules-as-dated-append-only-settings-data.md).
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
 * What a staff member typed into the customer list's single search box, once it has been read
 * (US-15.1).
 *
 * Which of the two it is has already been decided by the caller, because *what a card number looks
 * like* is a domain rule (`counterQueryOrNull`) and not a storage detail. What the repository is left
 * to decide is the part only it knows: that names are compared against their folded form.
 *
 * A card number arrives as the customer number it resolves to — `50k3` names the household holding
 * slot 50, and the index is dropped, because the list is about households and not about which piece
 * of card is current. That question belongs to the counter (US-04).
 */
export type CustomerListSearch =
  | {
      readonly kind: "NAME";
      /** The name **as typed**, unfolded — folding it for comparison is the adapter's job. */
      readonly name: string;
    }
  | { readonly kind: "CUSTOMER_NUMBER"; readonly customerNumber: number };

/**
 * How the customer list narrows the register (US-15.2). Every criterion is a `WHERE` clause: nothing
 * here is filtered after loading, because the whole point of the screen is to *not* be a spreadsheet
 * that reads every row.
 *
 * `statuses` is the one criterion that is never absent. "Which statuses does this list show" is a
 * decision with a default rather than an option — archived households are excluded unless they were
 * asked for — and the use case makes it before the query is built, so no store has to guess it.
 */
export interface CustomerListQuery {
  /** The statuses to include; never empty, and never implicitly all of them. */
  readonly statuses: ReadonlyArray<CustomerStatus>;
  readonly search?: CustomerListSearch;
  readonly group?: Group;
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
   * wants active households only). At DF's ~240 customers a whole-register read is one query of a
   * few hundred rows, which is why no narrower query exists — see `listCardsDueForReissue` for why
   * the filtering it feeds cannot be pushed into SQL at all.
   */
  listWithStatus(status: CustomerStatus): Promise<ReadonlyArray<RegisteredCustomer>>;
  /**
   * The customers matching every criterion of `query`, **lowest customer number first** — the
   * call-up order staff think in (US-15.1, FR-6). Ordering is the adapter's job for the reason
   * {@link listWithStatus}'s is: the database can do it, and a caller sorting it again would be a
   * second statement of what the list's order is.
   *
   * Each row carries the household, the certificate and the current card, because every column of
   * the list is derived from them — the counts from the birthdates, the price from the settings, the
   * card number from the slot and the index. Nothing about a row is stored, so nothing
   * about a row can have fallen behind (PRD §7).
   */
  list(query: CustomerListQuery): Promise<ReadonlyArray<RegisteredCustomer>>;
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
   * Replace a customer's household with exactly `members`, in **one transaction** (US-16.1).
   *
   * It is a replacement rather than an add-and-remove pair because the household is a set: staff
   * edit the whole list on the screen and press save, and two half-applied statements would leave a
   * household nobody typed. The previous rows are gone afterwards — deliberately, since no history
   * of past compositions is kept (tasks/prd-us-16-maintain-customer-record.md §FR-2); what a card
   * was printed with survives on the card, which is the only snapshot the system keeps.
   *
   * Nothing derived is written with them: there is no count column to update, and the price follows
   * from the birthdates the moment they are read.
   */
  updateHousehold(id: number, members: ReadonlyArray<HouseholdMemberDetails>): Promise<void>;
  /**
   * Correct who the customer is and where they live, together with the household they belong to, in
   * **one transaction** (US-16.2).
   *
   * The household travels with the personal data because the customer *is* one of its rows: their
   * name is on the record twice, and a write that moved only one of the two would leave a household
   * listing a person who no longer exists. The caller has already worked out which row was them
   * (`replaceHouseholdMember`) — that is a domain rule and not a storage detail — so the set arrives
   * here as it should stand afterwards, exactly like {@link updateHousehold}'s, and is written the
   * same way. It goes out even when nothing in it moved, so there is one code path rather than a
   * branch that decides when the two halves may be written apart.
   *
   * The customer number is not among the fields, and there is deliberately no way to reach it
   * *here*. There is a way — {@link changeCustomerNumber}, its own act with its own audit entry and
   * the card it prints — but a slot is not part of who the customer is, so correcting a misspelt
   * name is not the moment to move one (US-16.2 §FR-7, US-30).
   *
   * The folded search keys are the adapter's to rewrite in the same statement as the names they come
   * from — they are stored, so an edit that moved a name without them would leave the register
   * findable only under a spelling nobody uses any more (US-11.1).
   */
  updateDetails(
    id: number,
    details: PersonalDetails,
    household: ReadonlyArray<HouseholdMemberDetails>,
  ): Promise<void>;
  /**
   * Replace the free-text note on a customer's record with `notes`, which may be `""` (US-16.3).
   *
   * A note is the one field on the record that carries no rule: nothing is derived from it and
   * nothing follows from changing it, so this is a single column write. It is its own method rather
   * than part of {@link updateDetails} because it is its own decision with its own audit entry — the
   * note staff leave for the counter is not a correction of the record.
   */
  updateNotes(id: number, notes: string): Promise<void>;
  /**
   * Move a customer to the other balancing group (US-16.4).
   *
   * A single column write, and deliberately nothing more. The counter's verdict reads the column
   * every time it is asked, so the change is in force for today's distribution the instant this
   * returns; the card the household holds still prints the old group, which is a difference the
   * cards-due list derives on its next read rather than something enqueued here.
   *
   * The group is not part of {@link updateDetails} because it is not a correction of who the
   * customer is: it is a decision about the register's balance, taken for DF's sake rather than the
   * household's, and it gets its own audit entry saying so.
   */
  setGroup(id: number, group: Group): Promise<void>;
  /**
   * Move a customer to another slot **and issue the card that goes with it, in one transaction**
   * (US-30): the number moves and the card is inserted together, or neither happens.
   *
   * The precedent is {@link create}, which writes the customer, the household, the certificate and
   * the first card as one. Two writes would have a window in which a household holds 23 and carries
   * `5k4`, and nothing in the system could notice — the record and the card in their pocket are the
   * two sources of truth this application exists to keep from disagreeing.
   *
   * The card arrives as a {@link NewCard}, without the slot: it is read off the customer row
   * *after* the update, inside the same transaction, for the reason {@link CardRepository.issue}
   * gives — a caller that could pass the slot is a caller that could pass the wrong one. Its
   * `index` is the caller's, because that is a rule (`nextCardIndex` over the **new** slot's run)
   * rather than a column to copy.
   *
   * Nothing else on the row is touched, and **no card is re-labelled**: the run the household
   * leaves on the old slot is what makes that slot safe to hand out again (US-25).
   *
   * @returns the card as it was stored, carrying the new slot.
   * @throws {CustomerNumberTaken} if an active customer took the number first — the partial unique
   *   index is the final authority, exactly as it is for a registration.
   * @throws {CardNumberTaken} if the index was printed on the new slot in the meantime.
   */
  changeCustomerNumber(id: number, customerNumber: number, card: NewCard): Promise<IssuedCard>;
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
 * An application about to go on the waiting list: the validated details plus the instant they joined.
 *
 * `addedOn` is the whole of a place in the queue (US-12, FR-3) — there is no position column to keep
 * in step and nothing to renumber when somebody is promoted or withdraws, because the order is
 * derived from when people arrived (`inArrivalOrder`).
 */
export interface NewWaitingListEntry extends WaitingListDetails {
  readonly addedOn: Date;
}

/**
 * A persisted waiting-list entry. `id` is the surrogate key and, because rows are numbered as they
 * are written, also the tie-break between two applicants added the same day — see
 * `src/domain/customer/waitingList.ts`.
 */
export interface WaitingListEntry extends NewWaitingListEntry {
  readonly id: number;
}

/**
 * The waiting list (US-12).
 *
 * Entries are **retained, never deleted** (FR-7): a removal stamps the row so the order of past
 * promotions stays reconstructable, which is what makes "first come, first served" a claim DF can
 * still defend a year later. The store therefore has no `delete`, and everything it hands back is the
 * *waiting* list — the removed rows are history, and no screen asks for them yet.
 *
 * It does not decide who is next. That is `nextInLine`'s, and the repository deliberately promises no
 * ordering: a list of a handful of rows is sorted by the domain rule so that the screen, the banner
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
   * Take an applicant off the list at `removedOn`, keeping the row and the reason it went.
   *
   * The reason is required because there are only two ways off this list — the applicant was
   * registered, or they withdrew — and a row that cannot say which is a gap in the very ordering
   * history the retention exists for.
   */
  remove(entryId: number, reason: string, removedOn: Date): Promise<void>;
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
  /** How many cards this customer has been issued; 0 for a customer holding none. */
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
 * on whether an index was still free when the write landed, because the database holds the two
 * constraints that decide it: `@@unique([customerId, index])`, a race between two issues on one
 * record, and `@@unique([customerNumber, index])`, a card number that has already been printed
 * (US-25).
 */
export interface CardRepository {
  /** The customer's highest-indexed card, or `null` if they hold none yet. */
  currentCard(customerId: number): Promise<IssuedCard | null>;
  /**
   * The highest index any card has ever carried on that customer number, and **0** when none ever
   * did. Archived holders count: nothing about status is consulted, because a card that was printed
   * exists whatever became of the household that walked away with it (US-25).
   *
   * This is deliberately not `currentCard(customerId).index`. The two agree for every active
   * household — the active holder always sits at the top of the slot's run, since a registration
   * starts above every predecessor and only the active holder is ever reissued — but that invariant
   * is exactly what the counting rule must not have to remember. Both callers, registration and
   * reissue, ask the slot instead, and only the store can see the archived holders to answer.
   */
  highestIndexForNumber(customerNumber: number): Promise<number>;
  /**
   * The highest index ever issued on **each** customer number that has ever had a card, in one
   * aggregate query — the plural of {@link CardRepository.highestIndexForNumber}, and archived
   * holders count for the same reason.
   *
   * A slot **absent** from the map has never had a card on it, which is the honest answer rather
   * than a `0` written down 240 times; callers read it as `map.get(n) ?? 0`, and `nextCardIndex`
   * turns that 0 into a `k1` with no special case for a fresh slot.
   *
   * It is an aggregate for the reason {@link CardRepository.issueCounts} is one: the record's
   * number control names the card number every slot would print (US-30.4), and asking the slots one
   * at a time is ~240 round trips to render one dropdown.
   */
  highestIndexByNumber(): Promise<ReadonlyMap<number, number>>;
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
  /**
   * Write one card for a customer, and hand it back as it was stored.
   *
   * The caller passes a {@link NewCard} — everything but the slot. The customer number the card is
   * printed under is read off the customer row inside the write's own transaction, because a caller
   * that could pass it is a caller that could pass the wrong one.
   */
  issue(customerId: number, card: NewCard): Promise<IssuedCard>;
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
  /**
   * Every hand-out written on one day, in **one** query — the whole afternoon at once, so a screen
   * asking "which of this group have collected?" (US-23) reads the day once instead of once per
   * household.
   *
   * `dayKey` is the **Berlin** calendar day as `berlinDayKey` writes it (`YYYY-MM-DD`), the same
   * notion of "the same day" the once-per-day rule and the unique constraint already rest on. The
   * caller derives it from the {@link Clock}; the adapter matches it and does not re-derive a day
   * from an instant, so the two can never drift to different answers about when today ended.
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
 * One append-only audit record: *what* changed, *when* and *why* — never *who*. DF has ruled out
 * login, so the system cannot tell its staff apart and the log deliberately has no actor field
 * (docs/architecture/adr/006-record-what-when-and-why-in-the-audit-log-never-who.md).
 */
export interface AuditEntry {
  /** A stable, machine-readable event name such as `settings.updated`. */
  readonly what: string;
  /** The names of the fields this change touched. */
  readonly changedFields: ReadonlyArray<string>;
  readonly when: Date;
  /**
   * The reason a human gave for the change, or `""` where none was required. It is also the one
   * machine-written value, for the changes that ask staff for no reason and must still tell their
   * own story: a logged reminder records its resulting count here (`reminderCount=2`, US-06.2) and
   * a move between slots records the two numbers (`customerNumber=5→23`, US-30).
   */
  readonly why: string;
}

/** The append-only audit log. Entries are never amended or removed. */
export interface AuditLog {
  append(entry: AuditEntry): Promise<void>;
}
