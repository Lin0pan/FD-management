/**
 * Move a household to another customer number, and print the card that goes with it (US-30).
 *
 * A customer number is the **slot** a household occupies in DF's register and the number on the
 * card they carry — never their identity, which is the row's surrogate id (ADR-008). Staff choose
 * the slot at registration (US-24), and until now it was fixed for good; DF's testing showed that
 * is too rigid. A returning family wants the number their neighbours know them by, a block of
 * numbers is to be kept together, a number was typed in wrongly and noticed a week later. None of
 * those is a fault the software can detect, and none of them needs its opinion — so this use case
 * asks for **no reason** and refuses only what would break the register: a number somebody active
 * holds, one outside the quota, and the number the household already has.
 *
 * **The card is issued in the same act**, which is the whole point of putting the two here rather
 * than leaving the screen to do them in turn. A household whose record says 23 while their pocket
 * says `5k4` is exactly the disagreement between two sources of truth this project exists to
 * remove, and nothing in the system could notice it. The store therefore writes both or neither.
 *
 * **No card is ever re-labelled.** The cards left behind on the old slot are what makes that slot
 * safe to hand out again: the next household to take it asks the slot for its highest index and is
 * printed the one after. Renumbering them would put a card number back into the pool that is
 * already out in the world (US-25) — which is why the new card counts on from the run of the
 * **new** slot, archived holders included, and why the household's own run simply jumps. The gap is
 * the slot's history, not theirs; the number of cards they have been through is the count of their
 * own rows and stays what it was.
 *
 * The one thing the new slot does not settle on its own is an index the household is **already
 * carrying** — a fresh slot would say `k1` to a household holding `5k4` — so the index is the later
 * of the two runs (`nextCardIndexOnMove`), and the skipped numbers on that slot are skipped for
 * good.
 */

import type { IssuedCard } from "@/domain/card/card";
import { nextCardIndexOnMove } from "@/domain/card/cardNumber";
import { assertChoosableNumber } from "@/domain/customer/customerNumber";
import { groupOf } from "@/domain/customer/group";
import { composition } from "@/domain/customer/householdComposition";
import { CustomerArchived, CustomerNotFound } from "@/domain/errors";
import type {
  AuditLog,
  CardRepository,
  Clock,
  CustomerRepository,
  SettingsRepository,
} from "../ports";
import { readCurrentSettings } from "../settings/read-current-settings";
import { CARD_ISSUED, ISSUED_FIELDS } from "./issue-card";

/** The audit event name a move between slots is recorded under. */
const NUMBER_CHANGED = "customer.numberChanged";

/**
 * What the audit entry names as changed: the slot, and nothing else. The card the move printed is
 * the *second* entry's business — two things happened and each is read on its own.
 */
const NUMBER_FIELDS = ["customerNumber"] as const;

/** The reason word the card records, and the `why` of the entry that reports it. */
const NUMBER_CHANGE_REASON = "CUSTOMER_NUMBER_CHANGED" as const;

export interface ChangeCustomerNumberDeps {
  readonly customers: CustomerRepository;
  readonly cards: CardRepository;
  readonly settings: SettingsRepository;
  readonly audit: AuditLog;
  readonly clock: Clock;
}

export interface ChangeCustomerNumberInput {
  readonly customerId: number;
  /** The slot the household should hold afterwards — never a direction or an offset. */
  readonly customerNumber: number;
}

/**
 * Move the household and hand back the card the store wrote.
 *
 * A **blocked** household is moved like any other: a block pauses them at the counter and does not
 * freeze their record, the same division `issueCard` and `updateHousehold` already make (US-08). An
 * **archived** one is not: their record is read-only, they hold no slot to move out of, and they
 * receive no cards.
 *
 * @returns the {@link IssuedCard} as the register stored it, so the receipt on the screen names the
 *   number the register actually holds rather than one the screen worked out.
 * @throws {CustomerNotFound} if no customer holds `customerId`.
 * @throws {CustomerArchived} if the household has left the register.
 * @throws {CustomerNumberUnchanged} if they already hold that number.
 * @throws {CustomerNumberTaken} if an active household holds it — found here, or found by the
 *   partial unique index when one took it between the read and the write.
 * @throws {CustomerNumberOutOfRange} if it is not a whole number within the quota in force.
 * @throws {CardNumberTaken} if the card number this move was about to print was issued on the new
 *   slot between the read of its run and the write. It is not retried: what went stale is the run,
 *   which the screen has to read again (US-25).
 * @throws {CardIndexTaken} if the household was issued a card at that index while the move was
 *   being decided. The index here is the later of *two* runs (`nextCardIndexOnMove`), so the
 *   household's own can go stale under this write while the slot they are moving to is untouched —
 *   a fault an ordinary issue cannot produce, answered by re-reading the record.
 */
export async function changeCustomerNumber(
  deps: ChangeCustomerNumberDeps,
  { customerId, customerNumber }: ChangeCustomerNumberInput,
): Promise<IssuedCard> {
  // One read of the clock for the whole act, as `issueCard` does: the card's issue date and both
  // audit entries are one event, and reading the clock twice would record it as two.
  const now = deps.clock.now();

  const customer = await deps.customers.findById(customerId);
  if (customer === null) {
    throw new CustomerNotFound(customerId);
  }
  if (customer.status === "ARCHIVED") {
    throw new CustomerArchived(customerId);
  }

  // Read now rather than trusted from the screen: the quota may have been lowered (US-14) while the
  // record was open, and a number above it is no longer a slot at all.
  const settings = await readCurrentSettings({ settings: deps.settings, clock: deps.clock });
  assertChoosableNumber(
    customerNumber,
    customer.customerNumber,
    await deps.customers.takenActiveNumbers(),
    settings.quotaN,
  );

  // The run belongs to the **new** slot, not to the household: a slot an archived household left at
  // `23k5` continues at `23k6`, whatever index the household's own cards had reached.
  //
  // The card they are carrying is the second half of the question, and only a move raises it. The
  // card a household holds is the highest-indexed one they have been issued — that *is* what valid
  // means (US-02, FR-4), and the database says so with `@@unique([customerId, index])`. A household
  // carrying `5k4` moved onto a fresh slot as `99k1` would hold two cards whose indexes disagree
  // about which of them is current, so the rule takes the later of the two next indexes and the
  // domain states it once (`nextCardIndexOnMove`).
  const index = nextCardIndexOnMove(
    await deps.cards.highestIndexForNumber(customerNumber),
    customer.card.index,
  );

  const card = await deps.customers.changeCustomerNumber(customerId, customerNumber, {
    index,
    issuedAt: now,
    reason: NUMBER_CHANGE_REASON,
    // Today's household, derived here exactly as `issueCard` derives it: the card the move prints
    // states the household as it stands now, not as the card it replaces did. The week it prints
    // needs no field — it is the new slot, which the store fills in (`groupOf`, US-31).
    countsAtIssue: composition(customer.details.householdMembers, now),
  });

  // Two entries, because two things happened and each is read on its own. The numbers ride in `why`
  // as the one machine-written value the port documents — no human reason is asked for, so the
  // entry has to tell its own story (ADR-006), and staff's reasons for wanting a particular number
  // are their own.
  //
  // The group is named **only when the parity changed**, because only then does it say something
  // the two numbers do not. A move to the other week is the half of the story `37→106` merely
  // implies, and a reader of the log a year later should not have to know the rule to see it; a
  // move from 37 to 39 changes no week, and a line saying `group=RED→RED` would be noise.
  const groupBefore = groupOf(customer.customerNumber);
  const groupAfter = groupOf(customerNumber);
  const groupMoved = groupBefore === groupAfter ? "" : `; group=${groupBefore}→${groupAfter}`;
  await deps.audit.append({
    what: NUMBER_CHANGED,
    changedFields: [...NUMBER_FIELDS],
    when: now,
    why: `customerNumber=${customer.customerNumber}→${customerNumber}${groupMoved}`,
  });
  await deps.audit.append({
    what: CARD_ISSUED,
    changedFields: [...ISSUED_FIELDS],
    when: now,
    why: NUMBER_CHANGE_REASON,
  });

  return card;
}
