import { Prisma, type PrismaClient } from "@prisma/client";
import type { CardIssueCounts, CardRepository } from "@/application/ports";
import { parseCardIssueReason, type IssuedCard, type NewCard } from "@/domain/card/card";
import { CardIndexTaken, CardNumberTaken } from "@/domain/errors";

/**
 * Stands in for a customer id nobody holds. Never written — the insert fails on the foreign key
 * first, and this only keeps an unknown id from failing somewhere else on the way there.
 */
const UNKNOWN_SLOT = -1;

/** The two unique indexes on `Card`, as their columns are reported when one of them refuses a row. */
const CARD_UNIQUE_INDEXES = [
  ["customerId", "index"],
  ["customerNumber", "index"],
] as const;

/**
 * Whether a failed write was one of `Card`'s unique indexes rejecting the row — matched on the
 * index's columns **in order**, since `Customer`'s own `customerNumber` index would satisfy a
 * substring match just as well.
 *
 * *Which* of the two is deliberately not read off the error: a second card on an index the customer
 * already holds breaks both at once, and which the database names is its own business.
 * {@link PrismaCardRepository.issue} asks the record instead.
 *
 * Exported because the customer register also writes cards (US-30) and both writers must read a
 * refusal the same way.
 */
export function isCardCollision(error: unknown): boolean {
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
 * One stored card row as an {@link IssuedCard} — the counts are flat in SQLite and a value object in
 * the domain, put back together in one place so no two readers differ. There is no group to put
 * back: a card's week is the parity of the slot it was printed under (ADR-017).
 *
 * Outside the class because the customer register writes cards too (US-30).
 */
export function toIssuedCard(row: {
  customerNumber: number;
  index: number;
  issuedAt: Date;
  reason: string;
  grownUpsAtIssue: number;
  childrenAtIssue: number;
}): IssuedCard {
  return {
    customerNumber: row.customerNumber,
    index: row.index,
    issuedAt: row.issuedAt,
    reason: parseCardIssueReason(row.reason),
    countsAtIssue: { grownUps: row.grownUpsAtIssue, children: row.childrenAtIssue },
  };
}

/**
 * The SQLite-backed {@link CardRepository}. It never marks a card valid or invalid, because validity
 * is *being* the highest index (FR-4).
 *
 * **Two unique constraints, saying different things.** `@@unique([customerNumber, index])` is the
 * rule a card number states — printed once and never again, on whichever household holds the slot
 * (US-25); `50k1` and `50k2` may belong to two households, but `50k1` is never handed out twice.
 * `@@unique([customerId, index])` settles which of two simultaneous reissues on *one record* got the
 * index (`tasks/prd-us-02-issue-customer-card.md` §US-02.3).
 *
 * A caller answers the second by counting on from what is now there; the first it cannot answer by
 * retrying at all. Hence the two errors, and hence `issue` working out which refused the write.
 */
export class PrismaCardRepository implements CardRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * The customer's highest-indexed card, or `null`. An unknown id also answers `null` — whether the
   * household exists is the register's question, and answering it twice would let the two differ.
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
   * The highest index ever issued on a customer number, 0 for a slot that has never held a card. The
   * `where` names the number and nothing else: an archived household's cards count, because the card
   * they walked away with is still out in the world (US-25).
   */
  async highestIndexForNumber(customerNumber: number): Promise<number> {
    const highest = await this.prisma.card.aggregate({
      where: { customerNumber },
      _max: { index: true },
    });
    return highest._max.index ?? 0;
  }

  /**
   * The same for **every** slot that has had a card, in one grouped aggregate — rather than the ~240
   * singular calls the record's number control would make to render one dropdown (US-30.4).
   *
   * A slot that has never had a card is **absent** rather than reported as 0; the caller reads
   * `?? 0`, which is the same answer the singular method gives.
   */
  async highestIndexByNumber(): Promise<ReadonlyMap<number, number>> {
    const groups = await this.prisma.card.groupBy({
      by: ["customerNumber"],
      _max: { index: true },
    });

    // `_max` is nullable for an empty group, which a `groupBy` cannot produce; `?? 0` is
    // `highestIndexForNumber`'s own reading rather than an assertion about it.
    return new Map(groups.map((group) => [group.customerNumber, group._max.index ?? 0]));
  }

  /**
   * Every card the customer has been issued, highest index first. Superseded cards are kept rather
   * than deleted, so an old one handed over at the counter is still recognisable (US-09).
   */
  async listCards(customerId: number): Promise<ReadonlyArray<IssuedCard>> {
    const rows = await this.prisma.card.findMany({
      where: { customerId },
      orderBy: { index: "desc" },
    });
    return rows.map((row) => toIssuedCard(row));
  }

  /**
   * How many cards the customer has been through and how many a loss caused — one grouped aggregate
   * (US-09.2). The reason word is parsed rather than string-compared, so a hand-edited row fails
   * here rather than quietly dropping out of the loss count.
   *
   * The total counts the customer's own **rows**, not the index they have reached: an index counts
   * the slot's whole history (US-25), so a household given `66k4` as their first card would otherwise
   * appear to have lost three cards they never held.
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
   * Write one card and hand it back as stored. The slot is read off the customer row inside the
   * insert's transaction rather than taken as an argument — a caller that could pass it could pass
   * the wrong one. An id nobody holds fails on the foreign key, the register's question to answer.
   *
   * @throws {CardIndexTaken} if a concurrent issue took the index on this record first.
   * @throws {CardNumberTaken} if the card number had already been printed on this slot.
   */
  async issue(customerId: number, card: NewCard): Promise<IssuedCard> {
    // Kept out here as well as written inside, so a refusal names the card as staff know it — `50k1`
    // — rather than an id nobody at the counter has seen.
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
          },
        });
      });
      return toIssuedCard(row);
    } catch (error: unknown) {
      if (isCardCollision(error)) {
        // Asked of the record rather than the error, because both constraints cover the row: a
        // customer already holding the index lost a race between two issues of their own, settled by
        // re-reading their run; anyone else has hit a card number printed once already, which no
        // retry on this slot can answer (US-25).
        const held = await this.prisma.card.count({ where: { customerId, index: card.index } });
        throw held > 0
          ? new CardIndexTaken(customerId, card.index)
          : new CardNumberTaken(slot, card.index);
      }
      throw error;
    }
  }
}
