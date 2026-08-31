import { Prisma, type PrismaClient } from "@prisma/client";
import type { CardIssueCounts, CardRepository } from "@/application/ports";
import { parseCardIssueReason, type IssuedCard, type NewCard } from "@/domain/card/card";
import { parseGroup } from "@/domain/customer/group";
import { CardIndexTaken, CardNumberTaken } from "@/domain/errors";

/**
 * The slot stood in for a customer id nobody holds. It is never written: the insert fails on the
 * foreign key first, and it stands in only so an unknown id reaches *that* failure rather than a
 * different one while the customer number is being read.
 */
const UNKNOWN_SLOT = -1;

/** The two unique indexes on `Card`, as their columns are reported when one of them refuses a row. */
const CARD_UNIQUE_INDEXES = [
  ["customerId", "index"],
  ["customerNumber", "index"],
] as const;

/**
 * Whether a failed write was one of `Card`'s unique indexes rejecting the row — matched on the
 * columns of the index, in order, rather than on a substring of the error's `meta` blob, which
 * `Customer`'s own `customerNumber` index would satisfy just as well.
 *
 * *Which* of the two is named is deliberately not read off the error. A card's slot is written from
 * the customer's row, so a second card on an index the customer already holds breaks both indexes at
 * once, and which of them the database then names is its own business rather than a fact about the
 * fault. {@link PrismaCardRepository.issue} asks the record itself instead.
 */
function isCardCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (!Array.isArray(target)) {
    return false;
  }
  return CARD_UNIQUE_INDEXES.some(
    (columns) =>
      target.length === columns.length &&
      columns.every((column, position) => target[position] === column),
  );
}

/**
 * One stored card row as an {@link IssuedCard}. The two count columns are flat in SQLite and a
 * value object in the domain, so the shape is put back together here — in one place, so
 * `currentCard` and `listCards` cannot come to read the snapshot differently. The group word is
 * checked rather than trusted, like every other enum-shaped column SQLite keeps as a string.
 *
 * It sits outside the class because a card is also written by the customer register: a number
 * change inserts the card in the same transaction that moves the slot (US-30), and reading the row
 * it wrote back differently is exactly the drift this one function exists to prevent.
 */
export function toIssuedCard(row: {
  customerNumber: number;
  index: number;
  issuedAt: Date;
  reason: string;
  grownUpsAtIssue: number;
  childrenAtIssue: number;
  groupAtIssue: string;
}): IssuedCard {
  return {
    customerNumber: row.customerNumber,
    index: row.index,
    issuedAt: row.issuedAt,
    reason: parseCardIssueReason(row.reason),
    countsAtIssue: { grownUps: row.grownUpsAtIssue, children: row.childrenAtIssue },
    groupAtIssue: parseGroup(row.groupAtIssue),
  };
}

/**
 * The SQLite-backed {@link CardRepository}.
 *
 * The adapter stores cards and reads them back; it decides nothing. In particular it never marks a
 * card valid or invalid, because validity is *being* the highest index (FR-4) — `currentCard` reads
 * that fact off the run rather than a column that could disagree with it.
 *
 * What it does own is the one thing the pure layers cannot: the unique constraints that settle a
 * write nobody could have seen coming. There are two of them, and they say different things.
 *
 * `@@unique([customerNumber, index])` is the rule a card number states — a number is printed once
 * and never again, on whichever household happens to hold the slot (US-25). Customer number 50 is a
 * slot an archived household releases (FR-6), so `50k1` and `50k2` may well belong to two different
 * households; what the constraint forbids is `50k1` being handed out a second time, which is how the
 * counter came to answer for a card that left the register with a household years ago.
 *
 * `@@unique([customerId, index])` is kept beside it because it is a different fact: it settles which
 * of two simultaneous reissues on *one record* got the index
 * (tasks/prd-us-02-issue-customer-card.md §US-02.3). A caller answers that by counting on from what
 * is now there and trying again; the global one it cannot answer by retrying at all. Hence the two
 * errors — {@link CardIndexTaken} and {@link CardNumberTaken} — and hence `issue` working out which
 * of the two a refused write was before it reports one.
 */
export class PrismaCardRepository implements CardRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * The customer's highest-indexed card — the one they actually hold — or `null` if they hold none.
   *
   * An unknown customer id also answers `null`: whether the household exists is the use case's
   * question, asked of the customer register, and answering it twice in two places would let the two
   * answers differ.
   */
  async currentCard(customerId: number): Promise<IssuedCard | null> {
    const row = await this.prisma.card.findFirst({
      where: { customerId },
      orderBy: { index: "desc" },
    });
    if (row === null) {
      return null;
    }
    return toIssuedCard(row);
  }

  /**
   * The highest index ever issued on a customer number, 0 for a slot that has never held a card.
   *
   * One aggregate over the slot, served by the leading column of `@@unique([customerNumber, index])`.
   * The `where` names the number and nothing else: an archived household's cards count, because the
   * card they walked away with is still out in the world (US-25).
   */
  async highestIndexForNumber(customerNumber: number): Promise<number> {
    const highest = await this.prisma.card.aggregate({
      where: { customerNumber },
      _max: { index: true },
    });
    return highest._max.index ?? 0;
  }

  /**
   * Every card the customer has been issued, highest index first — the one they hold, then the
   * numbers it replaced. Superseded cards are kept rather than deleted, so an old card handed over
   * at the counter can still be recognised (US-09).
   */
  async listCards(customerId: number): Promise<ReadonlyArray<IssuedCard>> {
    const rows = await this.prisma.card.findMany({
      where: { customerId },
      orderBy: { index: "desc" },
    });
    return rows.map((row) => toIssuedCard(row));
  }

  /**
   * How many cards the customer has been through and how many of those a loss caused — one grouped
   * aggregate, whatever the length of the run (US-09.2).
   *
   * Grouping by reason rather than counting twice keeps it to a single round trip: the total is the
   * sum of the groups' sizes, and the loss count is the size of the `LOST` group. The reason word is
   * parsed rather than compared as a string, so a hand-edited row fails here exactly as it does in
   * `currentCard` instead of quietly dropping out of the loss count.
   *
   * The total counts the customer's own **rows**, not the index they have reached: an index counts
   * the slot's whole history (US-25), so a household given `66k4` as their first card would otherwise
   * be reported as having been through four cards and appear to have lost three they never held.
   */
  async issueCounts(customerId: number): Promise<CardIssueCounts> {
    const groups = await this.prisma.card.groupBy({
      by: ["reason"],
      where: { customerId },
      _count: { _all: true },
    });

    return groups.reduce<CardIssueCounts>(
      (counts, group) => ({
        cardsIssued: counts.cardsIssued + group._count._all,
        reissuesForLoss:
          parseCardIssueReason(group.reason) === "LOST"
            ? counts.reissuesForLoss + group._count._all
            : counts.reissuesForLoss,
      }),
      { cardsIssued: 0, reissuesForLoss: 0 },
    );
  }

  /**
   * Write one card for a customer and hand it back as it was stored.
   *
   * The slot the card is printed under is read off the customer row rather than taken as an
   * argument, in one transaction with the insert: `Card.customerNumber` is the key the global
   * constraint needs, and a caller that could pass it is a caller that could pass the wrong one.
   * `IssuedCard` stays a pure domain type and gains nothing. An id nobody holds fails as it always
   * did — on the foreign key, which is the register's question to answer, not this adapter's.
   *
   * @throws {CardIndexTaken} if a concurrent issue took the index on this record first.
   * @throws {CardNumberTaken} if the card number had already been printed on this slot.
   */
  async issue(customerId: number, card: NewCard): Promise<IssuedCard> {
    // Kept out here as well as written inside, so a refused card number can be named as staff know
    // it — `50k1` — rather than as an id nobody at the counter has ever seen.
    let slot = UNKNOWN_SLOT;
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { customerNumber: true },
        });
        slot = customer?.customerNumber ?? UNKNOWN_SLOT;
        return tx.card.create({
          data: {
            customerId,
            customerNumber: slot,
            index: card.index,
            issuedAt: card.issuedAt,
            reason: card.reason,
            grownUpsAtIssue: card.countsAtIssue.grownUps,
            childrenAtIssue: card.countsAtIssue.children,
            groupAtIssue: card.groupAtIssue,
          },
        });
      });
      return toIssuedCard(row);
    } catch (error: unknown) {
      if (isCardCollision(error)) {
        // Which of the two constraints refused the row is asked of the record rather than of the
        // error, because both cover it and only the record can say which fault it was: a customer
        // who already holds the index lost a race between two issues of their own, which a caller
        // settles by reading their run again; anyone else has been handed a card number that was
        // printed once already, and no retry on this slot can answer that (US-25).
        const held = await this.prisma.card.count({ where: { customerId, index: card.index } });
        throw held > 0
          ? new CardIndexTaken(customerId, card.index)
          : new CardNumberTaken(slot, card.index);
      }
      throw error;
    }
  }
}
