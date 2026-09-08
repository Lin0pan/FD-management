/**
 * Move a household to another customer number, and print the card that goes with it (US-30, ADR-016).
 *
 * Staff's reasons — a returning family wanting the number their neighbours know them by, a block of
 * numbers kept together, a number typed wrongly — are none of the software's business, so this asks
 * for **no reason** and refuses only what would break the register.
 *
 * **The card is issued in the same act**, or a household whose record says 23 while their pocket says
 * `5k4` would be two disagreeing sources of truth that nothing could notice. The store writes both or
 * neither.
 *
 * **No card is ever re-labelled**: the cards left behind on the old slot are what make it safe to hand
 * out again (US-25). The new card therefore counts on from the **new** slot's run, and the
 * household's own run simply jumps — except that the index must also outrank what they are already
 * carrying, which is `nextCardIndexOnMove`.
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

/** The slot and nothing else — the card the move printed is the *second* entry's business. */
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
 * A **blocked** household moves like any other — a block pauses them at the counter and does not
 * freeze their record (US-08). An **archived** one does not: they hold no slot to move out of.
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
  // One read of the clock for the whole act: the card's issue date and both audit entries are one
  // event, and reading the clock twice would record it as two.
  const now = deps.clock.now();

  const customer = await deps.customers.findById(customerId);
  if (customer === null) {
    throw new CustomerNotFound(customerId);
  }
  if (customer.status === "ARCHIVED") {
    throw new CustomerArchived(customerId);
  }

  // Read now rather than trusted from the screen: a quota lowered while the record was open (US-14)
  // leaves numbers above it no longer slots at all.
  const settings = await readCurrentSettings({ settings: deps.settings, clock: deps.clock });
  assertChoosableNumber(
    customerNumber,
    customer.customerNumber,
    await deps.customers.takenActiveNumbers(),
    settings.quotaN,
  );

  // The run belongs to the **new** slot: one an archived household left at `23k5` continues at
  // `23k6`. But the card a household holds is their highest-indexed one — that *is* what valid means
  // (US-02, FR-4) — so a household carrying `5k4` moved onto a fresh slot as `99k1` would hold two
  // cards disagreeing about which is current. Hence the later of the two runs.
  const index = nextCardIndexOnMove(
    await deps.cards.highestIndexForNumber(customerNumber),
    customer.card.index,
  );

  const card = await deps.customers.changeCustomerNumber(customerId, customerNumber, {
    index,
    issuedAt: now,
    reason: NUMBER_CHANGE_REASON,
    // Today's household, as `issueCard` derives it — the card states the household as it stands now,
    // not as the card it replaces did. Its week needs no field: it is the new slot (ADR-017).
    countsAtIssue: composition(customer.details.householdMembers, now),
  });

  // Two entries, because two things happened and each is read on its own. The numbers ride in `why`
  // as the one machine-written value the port documents — no human reason is asked for, so the entry
  // has to tell its own story (ADR-006).
  //
  // The group is named **only when the parity changed**: a reader of the log should not have to know
  // the rule to see that `37→106` moved a household to the other week, and `group=RED→RED` on a move
  // from 37 to 39 would be noise.
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
