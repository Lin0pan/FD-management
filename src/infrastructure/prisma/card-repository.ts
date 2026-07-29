import { Prisma, type PrismaClient } from "@prisma/client";
import type { CardIssueCounts, CardRepository } from "@/application/ports";
import { parseCardIssueReason, type IssuedCard } from "@/domain/card/card";
import { parseGroup } from "@/domain/customer/group";
import { CardIndexTaken } from "@/domain/errors";

/**
 * Whether a failed write was the `(customerId, index)` constraint rejecting an index another issue
 * had taken in the meantime.
 *
 * The target is checked rather than assumed — `Card` may grow a second unique constraint, and it
 * should then surface as itself rather than as a lost race that a retry would answer wrongly.
 */
function isCardIndexCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta ?? {}).includes("index")
  );
}

/**
 * The SQLite-backed {@link CardRepository}.
 *
 * The adapter stores cards and reads them back; it decides nothing. In particular it never marks a
 * card valid or invalid, because validity is *being* the highest index (FR-4) — `currentCard` reads
 * that fact off the run rather than a column that could disagree with it.
 *
 * What it does own is the one thing the pure layers cannot: the `@@unique([customerId, index])`
 * constraint that settles which of two simultaneous issues got an index
 * (tasks/prd-us-02-issue-customer-card.md §US-02.3).
 *
 * Card numbers are **not** unique across the archive: two customers may each hold `50k1`, because
 * customer number 50 is a slot an archived household releases (FR-6). The constraint is deliberately
 * per customer id for that reason.
 */
export class PrismaCardRepository implements CardRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * One stored row as an {@link IssuedCard}. The two count columns are flat in SQLite and a value
   * object in the domain, so the shape is put back together here — in one place, so `currentCard`
   * and `listCards` cannot come to read the snapshot differently. The group word is checked rather
   * than trusted, like every other enum-shaped column SQLite keeps as a string.
   */
  private static toCard(row: {
    index: number;
    issuedAt: Date;
    reason: string;
    grownUpsAtIssue: number;
    childrenAtIssue: number;
    groupAtIssue: string;
  }): IssuedCard {
    return {
      index: row.index,
      issuedAt: row.issuedAt,
      reason: parseCardIssueReason(row.reason),
      countsAtIssue: { grownUps: row.grownUpsAtIssue, children: row.childrenAtIssue },
      groupAtIssue: parseGroup(row.groupAtIssue),
    };
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
    return PrismaCardRepository.toCard(row);
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
    return rows.map((row) => PrismaCardRepository.toCard(row));
  }

  /**
   * How many cards the customer has been through and how many of those a loss caused — one grouped
   * aggregate, whatever the length of the run (US-09.2).
   *
   * Grouping by reason rather than counting twice keeps it to a single round trip: the highest index
   * is the largest of the groups' maxima, and the loss count is the size of the `LOST` group. The
   * reason word is parsed rather than compared as a string, so a hand-edited row fails here exactly
   * as it does in `currentCard` instead of quietly dropping out of the loss count.
   */
  async issueCounts(customerId: number): Promise<CardIssueCounts> {
    const groups = await this.prisma.card.groupBy({
      by: ["reason"],
      where: { customerId },
      _count: { _all: true },
      _max: { index: true },
    });

    return groups.reduce<CardIssueCounts>(
      (counts, group) => ({
        cardsIssued: Math.max(counts.cardsIssued, group._max.index ?? 0),
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
   * @throws {CardIndexTaken} if a concurrent issue took the index first.
   */
  async issue(customerId: number, card: IssuedCard): Promise<IssuedCard> {
    try {
      const row = await this.prisma.card.create({
        data: {
          customerId,
          index: card.index,
          issuedAt: card.issuedAt,
          reason: card.reason,
          grownUpsAtIssue: card.countsAtIssue.grownUps,
          childrenAtIssue: card.countsAtIssue.children,
          groupAtIssue: card.groupAtIssue,
        },
      });
      return PrismaCardRepository.toCard(row);
    } catch (error: unknown) {
      if (isCardIndexCollision(error)) {
        throw new CardIndexTaken(customerId, card.index);
      }
      throw error;
    }
  }
}
