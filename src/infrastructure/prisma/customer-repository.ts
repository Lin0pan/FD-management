import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ArchivedCustomer,
  ArchiveSearchQuery,
  CustomerCounter,
  CustomerListQuery,
  CustomerListSearch,
  CustomerRepository,
} from "@/application/ports";
import type { ValidUntilRange } from "@/domain/customer/certificate";
import { parseCardIssueReason, type IssuedCard, type NewCard } from "@/domain/card/card";
import {
  parseCustomerStatus,
  type CustomerStatus,
  type HouseholdMemberDetails,
  type NewCustomer,
  type PersonalDetails,
  type RegisteredCustomer,
} from "@/domain/customer/customer";
import { foldName } from "@/domain/customer/nameSearch";
import {
  CardIndexTaken,
  CardNumberTaken,
  CustomerNotFound,
  CustomerNumberTaken,
  InvalidCustomerRecord,
} from "@/domain/errors";
import { isCardCollision, toIssuedCard } from "./card-repository";

/**
 * Everyone who still holds a customer number: `ACTIVE` and `BLOCKED`, never `ARCHIVED`. Stated once
 * so the queries below cannot drift apart, which is how a number would be handed out twice.
 */
const ON_REGISTER = { status: { not: "ARCHIVED" } } as const;

/**
 * The related rows the counter and the card view read off a customer, loaded *with* it so neither
 * screen fans out into an N+1 (`tasks/prd-us-04-lookup-customer.md` §US-04.3).
 *
 * Prisma's SQLite provider has no join strategy, so this is four statements per lookup, not one. What
 * matters is that the number is *fixed* — a ten-person household costs the same four reads as a
 * two-person one — which is the invariant the integration test pins.
 */
const CUSTOMER_INCLUDE = {
  householdMembers: { orderBy: { id: "asc" } },
  // The latest-recorded certificate is the one on file; renewals stack behind it (US-06.3). The id
  // breaks a same-instant tie, as "the later row wins" does elsewhere.
  certificates: { orderBy: [{ recordedAt: "desc" }, { id: "desc" }], take: 1 },
  // The highest index is the card the customer holds; superseded ones stay on file so an old card is
  // recognisable at the counter (US-09). The whole run rather than the top row, because the *first*
  // card is `registeredOn` and a second query for one date on the counter's hot path would cost more
  // than the two or three rows a run ever holds.
  cards: { orderBy: { index: "desc" } },
} as const satisfies Prisma.CustomerInclude;

/** A customer row with the {@link CUSTOMER_INCLUDE} relations attached. */
type CustomerRow = Prisma.CustomerGetPayload<{ include: typeof CUSTOMER_INCLUDE }>;

/**
 * Whether a failed write was one named unique index rejecting the row — matched on the index's
 * columns **in order**, never a substring of the error's `meta`.
 *
 * A registration writes the customer *and* their first card in one nested statement, and both rows
 * carry a `customerNumber` (US-25). Matching the word alone would report a card number already
 * printed as a lost race for the slot, which the caller answers by retrying on another number and
 * leaves the real fault in place. Prisma names the *rooted* model — `Customer` for both — so the
 * columns are the only thing that tells them apart.
 */
function isCollisionOn(error: unknown, columns: readonly string[]): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return (
    Array.isArray(target) &&
    target.length === columns.length &&
    columns.every((column, position) => target[position] === column)
  );
}

/**
 * Whether a failed write was the self-referencing foreign key refusing a `previousCustomerId` that
 * belongs to nobody (US-11.3). The database checks the link for free; all that is left is reporting
 * it as the domain's `CustomerNotFound`.
 *
 * Unlike the collision above, the column cannot be read off the error — SQLite reports a foreign-key
 * violation with no `meta`. It need not be: every other foreign key in that nested write points at
 * the row being inserted, so `previousCustomerId` is the only one that can name something missing.
 */
function isMissingPredecessor(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

/**
 * What the customer list's search box narrows the query by (US-15.2). A name is folded here — only
 * this layer knows the columns hold folded values — and matched as a prefix of *either* name. The
 * customer number is matched exactly: `5` must not drag in 50 and 51.
 */
function searchCondition(search: CustomerListSearch | undefined): Prisma.CustomerWhereInput {
  if (search === undefined) {
    return {};
  }
  if (search.kind === "CUSTOMER_NUMBER") {
    return { customerNumber: search.customerNumber };
  }
  const folded = foldName(search.name);
  return {
    OR: [{ lastNameFolded: { startsWith: folded } }, { firstNameFolded: { startsWith: folded } }],
  };
}

/**
 * The SQLite-backed {@link CustomerRepository}. It maps and nothing else — what it *does* own is the
 * one thing the pure layers cannot: the partial unique index that settles which of two simultaneous
 * registrations got the last free number (`tasks/prd-us-01-register-customer.md` §US-01.5).
 */
export class PrismaCustomerRepository implements CustomerRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async takenActiveNumbers(): Promise<ReadonlyArray<number>> {
    const rows = await this.prisma.customer.findMany({
      where: ON_REGISTER,
      select: { customerNumber: true },
      orderBy: { customerNumber: "asc" },
    });
    return rows.map((row) => row.customerNumber);
  }

  async findById(id: number): Promise<RegisteredCustomer | null> {
    const row = await this.prisma.customer.findUnique({
      where: { id },
      include: CUSTOMER_INCLUDE,
    });
    return row === null ? null : this.toRegisteredCustomer(row);
  }

  /**
   * **Two reads rather than one**, because "active or, failing that, the latest archived" is not a
   * single `orderBy`: an active holder must win over an archived one whatever their creation order,
   * and recency only decides between archived rows. So a reassigned slot resolves to its current
   * holder, never to the person it was taken from. At most one active holder exists — the partial
   * unique index guarantees it.
   */
  async findByCustomerNumber(customerNumber: number): Promise<RegisteredCustomer | null> {
    const active = await this.prisma.customer.findFirst({
      where: { customerNumber, status: { not: "ARCHIVED" } },
      include: CUSTOMER_INCLUDE,
    });
    if (active !== null) {
      return this.toRegisteredCustomer(active);
    }

    const archived = await this.prisma.customer.findFirst({
      where: { customerNumber, status: "ARCHIVED" },
      orderBy: { id: "desc" },
      include: CUSTOMER_INCLUDE,
    });
    return archived === null ? null : this.toRegisteredCustomer(archived);
  }

  /**
   * The one whole-register read in the product, for the cards-due-for-reissue list (US-13.2). That
   * comparison cannot be a `WHERE` clause — one side is a rule over dates that changes answer as the
   * clock moves — so the rows come out and the domain decides. At ~240 customers, a few hundred rows
   * on a screen nobody stands at.
   */
  async listWithStatus(status: CustomerStatus): Promise<ReadonlyArray<RegisteredCustomer>> {
    const rows = await this.prisma.customer.findMany({
      where: { status },
      orderBy: { customerNumber: "asc" },
      include: CUSTOMER_INCLUDE,
    });
    return rows.map((row) => this.toRegisteredCustomer(row));
  }

  /**
   * The customers the customer list asked for, lowest number first (US-15.2). Every criterion is a
   * `WHERE` clause: the register is small enough to filter in JavaScript, and that is exactly why it
   * is not — the screen replacing a spreadsheet must not *be* one.
   *
   * The **group** is the one narrowing that is not here, and not a column either (ADR-017) —
   * `CustomerListQuery` says why. Names are compared folded by the same `foldName` that wrote the
   * columns, so this and the archive search (US-11.1) agree letter for letter.
   */
  async list(query: CustomerListQuery): Promise<ReadonlyArray<RegisteredCustomer>> {
    const rows = await this.prisma.customer.findMany({
      where: {
        status: { in: [...query.statuses] },
        ...searchCondition(query.search),
        ...(query.certificate === undefined
          ? {}
          : { id: { in: await this.idsByCurrentCertificate(query.certificate) } }),
      },
      orderBy: { customerNumber: "asc" },
      include: CUSTOMER_INCLUDE,
    });
    return rows.map((row) => this.toRegisteredCustomer(row));
  }

  /**
   * The ids of the customers whose **current** certificate expires inside `range`.
   *
   * A raw statement because Prisma cannot express "the latest related row satisfies this":
   * `certificates: { some: … }` would match a household on a notice they long since renewed, which is
   * precisely the household the list must *not* show as expired. The correlated subquery picks the
   * row `CUSTOMER_INCLUDE` calls current, so the filter and the printed certificate always agree.
   *
   * The bounds are half-open, so a `validUntil` stored with a time of day still falls on its own
   * calendar day's side of the boundary.
   */
  private async idsByCurrentCertificate(range: ValidUntilRange): Promise<number[]> {
    const bounds: Prisma.Sql[] = [];
    if (range.from !== undefined) {
      bounds.push(Prisma.sql`cert.validUntil >= ${range.from}`);
    }
    if (range.before !== undefined) {
      bounds.push(Prisma.sql`cert.validUntil < ${range.before}`);
    }
    const rows = await this.prisma.$queryRaw<Array<{ id: number }>>`
      SELECT c.id AS id
      FROM Customer c
      JOIN Certificate cert ON cert.customerId = c.id
      WHERE cert.id = (
        SELECT latest.id FROM Certificate latest
        WHERE latest.customerId = c.id
        ORDER BY latest.recordedAt DESC, latest.id DESC
        LIMIT 1
      )
      AND ${Prisma.join([Prisma.sql`1 = 1`, ...bounds], " AND ")}
    `;
    return rows.map((row) => row.id);
  }

  /**
   * The archived households answering to what staff typed, most recently archived first (US-11.1).
   *
   * Folded here with the domain's own `foldName`, the function that wrote the columns, so the query
   * and the stored value cannot mean two different things. `startsWith` on the folded column is a
   * prefix match the `(lastNameFolded, birthDate)` index serves — which is why the fold is stored at
   * all, SQLite being unable to do it in the `WHERE` clause.
   *
   * An unfilled criterion is left out of the `where` rather than matched against the empty string.
   */
  async searchArchived(
    query: ArchiveSearchQuery,
    limit: number,
  ): Promise<ReadonlyArray<ArchivedCustomer>> {
    const rows = await this.prisma.customer.findMany({
      where: {
        status: "ARCHIVED",
        ...(query.lastName === undefined
          ? {}
          : { lastNameFolded: { startsWith: foldName(query.lastName) } }),
        ...(query.firstName === undefined
          ? {}
          : { firstNameFolded: { startsWith: foldName(query.firstName) } }),
        ...(query.birthDate === undefined ? {} : { birthDate: query.birthDate }),
      },
      // The id breaks a same-instant tie, so the order is total and two runs of one search agree.
      orderBy: [{ archivedAt: "desc" }, { id: "desc" }],
      take: limit,
      include: CUSTOMER_INCLUDE,
    });
    return rows.map((row) => this.toArchivedCustomer(row));
  }

  /**
   * Map an archived row, narrowing the archive reason and instant to non-null.
   *
   * @throws {InvalidCustomerRecord} if either is missing — `archive` writes all three in one
   *   statement, so such a row can only come from a hand-edited database.
   */
  private toArchivedCustomer(row: CustomerRow): ArchivedCustomer {
    const customer = this.toRegisteredCustomer(row);
    const { archiveReason, archivedAt } = customer;
    if (archiveReason === null || archivedAt === null) {
      throw new InvalidCustomerRecord(
        archiveReason === null ? "archiveReason" : "archivedAt",
        String(row.id),
      );
    }
    return { ...customer, archiveReason, archivedAt };
  }

  /**
   * Map a loaded row into the domain record, validating the stored `status` on the way back in so a
   * hand-edited row fails loudly. There is no group to validate — it is the parity of the number
   * (ADR-017), so a row cannot carry one that disagrees with its slot.
   *
   * @throws {InvalidCustomerRecord} if the certificate or the current card is missing. Registration
   *   writes both in the customer's own transaction, so such a row is a hand-edited database.
   */
  private toRegisteredCustomer(row: CustomerRow): RegisteredCustomer {
    const certificate = row.certificates[0];
    const card = row.cards[0];
    // The run is highest index first, so its last element is the card handed over with the
    // registration — the day the household joined, which a reissue therefore cannot move.
    const firstCard = row.cards.at(-1);
    if (certificate === undefined || card === undefined || firstCard === undefined) {
      throw new InvalidCustomerRecord(
        certificate === undefined ? "certificate" : "card",
        String(row.id),
      );
    }

    return {
      id: row.id,
      customerNumber: row.customerNumber,
      status: parseCustomerStatus(row.status),
      blockReason: row.blockReason,
      archiveReason: row.archiveReason,
      archivedAt: row.archivedAt,
      reminderCount: row.reminderCount,
      card: {
        // The slot the card was **printed under**, off the card row and not the customer's — the two
        // part company for a household that has been moved (ADR-016).
        customerNumber: card.customerNumber,
        index: card.index,
        issuedAt: card.issuedAt,
        reason: parseCardIssueReason(card.reason),
        // What is printed on the card, not what the household is today — the two part company on a
        // 13th birthday, which is the point of storing it (US-13.3).
        countsAtIssue: { grownUps: card.grownUpsAtIssue, children: card.childrenAtIssue },
      },
      registeredOn: firstCard.issuedAt,
      previousCustomerId: row.previousCustomerId,
      details: {
        firstName: row.firstName,
        lastName: row.lastName,
        birthDate: row.birthDate,
        address: {
          street: row.street,
          houseNumber: row.houseNumber,
          zip: row.zip,
          city: row.city,
        },
        certificate: { type: certificate.type, validUntil: certificate.validUntil },
        householdMembers: row.householdMembers.map((member) => ({
          firstName: member.firstName,
          lastName: member.lastName,
          birthDate: member.birthDate,
        })),
        notes: row.notes,
      },
    };
  }

  /**
   * Persist a new customer with their household, certificate and first card — **one nested write in a
   * single transaction**, so a failure leaves neither a half-built household nor a consumed number.
   *
   * @throws {CustomerNumberTaken} if another registration took the number first.
   * @throws {CardNumberTaken} if the first card's number had already been printed on that slot.
   */
  async create(customer: NewCustomer): Promise<RegisteredCustomer> {
    const { details } = customer;
    try {
      const row = await this.prisma.customer.create({
        data: {
          customerNumber: customer.customerNumber,
          firstName: details.firstName,
          lastName: details.lastName,
          // The search keys, derived in the same statement as the names so the two cannot be
          // written apart (US-11.1). Any edit of a name must do the same.
          firstNameFolded: foldName(details.firstName),
          lastNameFolded: foldName(details.lastName),
          birthDate: details.birthDate,
          street: details.address.street,
          houseNumber: details.address.houseNumber,
          zip: details.address.zip,
          city: details.address.city,
          status: customer.status,
          reminderCount: customer.reminderCount,
          notes: details.notes,
          // Display metadata for a returning household (US-11.3). Nothing is copied across the
          // link, and the predecessor's row is not read, let alone touched.
          previousCustomerId: customer.previousCustomerId,
          householdMembers: {
            create: details.householdMembers.map((member) => ({
              firstName: member.firstName,
              lastName: member.lastName,
              birthDate: member.birthDate,
            })),
          },
          certificates: {
            // The first row of the append-only trail, at the registration instant — the same one the
            // first card carries, both being written by one decision.
            create: {
              type: details.certificate.type,
              validUntil: details.certificate.validUntil,
              recordedAt: customer.card.issuedAt,
            },
          },
          cards: {
            create: {
              // The slot the card is printed under, written with the customer row it comes from —
              // the key `@@unique([customerNumber, index])` needs. The card *number* stays derived.
              customerNumber: customer.customerNumber,
              index: customer.card.index,
              issuedAt: customer.card.issuedAt,
              reason: customer.card.reason,
              grownUpsAtIssue: customer.card.countsAtIssue.grownUps,
              childrenAtIssue: customer.card.countsAtIssue.children,
            },
          },
        },
        select: { id: true },
      });
      // A new customer is active, so carries neither reason, and the card just written is both their
      // current and their first — which is what makes today their `registeredOn`.
      return {
        ...customer,
        id: row.id,
        // Printed under the very number this registration took, filled in here rather than by the
        // caller for `issue`'s reason.
        card: { ...customer.card, customerNumber: customer.customerNumber },
        blockReason: null,
        archiveReason: null,
        archivedAt: null,
        registeredOn: customer.card.issuedAt,
      };
    } catch (error: unknown) {
      // The register's partial index — the slot was taken while this was in flight.
      if (isCollisionOn(error, ["customerNumber"])) {
        throw new CustomerNumberTaken(customer.customerNumber);
      }
      // `Card`'s global index — the slot was won, but its card number has been printed before
      // (US-25). A different fault: nothing answers it but reading the slot's run again.
      if (isCollisionOn(error, ["customerNumber", "index"])) {
        throw new CardNumberTaken(customer.customerNumber, customer.card.index);
      }
      if (isMissingPredecessor(error) && customer.previousCustomerId !== null) {
        throw new CustomerNotFound(customer.previousCustomerId);
      }
      throw error;
    }
  }

  /**
   * Replace a customer's household with exactly `members` (US-16.1).
   *
   * Delete-then-create in **one transaction**, because the household is a set: matching given rows
   * against stored ones would need an identity the screen does not have — two children of the same
   * name and birthdate are two rows — and a partial match would leave a household nobody typed.
   *
   * The one delete in this file, and the deliberate exception to ADR-010: no history of past
   * compositions is kept (PRD §FR-2), and the counts the household *had* survive on their card.
   */
  async updateHousehold(id: number, members: ReadonlyArray<HouseholdMemberDetails>): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.householdMember.deleteMany({ where: { customerId: id } }),
      this.prisma.householdMember.createMany({
        data: members.map((member) => ({
          customerId: id,
          firstName: member.firstName,
          lastName: member.lastName,
          birthDate: member.birthDate,
        })),
      }),
    ]);
  }

  /**
   * Correct the customer's personal data and their household, in **one transaction** (US-16.2).
   *
   * The folded search keys are rewritten from the names in the same statement, or the register would
   * be findable only under a spelling nobody uses any more (US-11.1).
   *
   * The household is replaced as {@link updateHousehold} replaces it: the customer is one of its
   * rows, so a write moving only one of the two copies of their name would leave a household listing
   * a person who no longer exists. Which row was them is `replaceHouseholdMember`'s decision, so the
   * set is written as handed over even when nothing in it moved.
   *
   * The customer number is not written, and no argument reaches it (PRD §FR-7).
   */
  async updateDetails(
    id: number,
    details: PersonalDetails,
    household: ReadonlyArray<HouseholdMemberDetails>,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.customer.update({
        where: { id },
        data: {
          firstName: details.firstName,
          lastName: details.lastName,
          firstNameFolded: foldName(details.firstName),
          lastNameFolded: foldName(details.lastName),
          birthDate: details.birthDate,
          street: details.address.street,
          houseNumber: details.address.houseNumber,
          zip: details.address.zip,
          city: details.address.city,
        },
      }),
      this.prisma.householdMember.deleteMany({ where: { customerId: id } }),
      this.prisma.householdMember.createMany({
        data: household.map((member) => ({
          customerId: id,
          firstName: member.firstName,
          lastName: member.lastName,
          birthDate: member.birthDate,
        })),
      }),
    ]);
  }

  /**
   * Replace the free-text note (US-16.3). One column, one statement: nothing is derived from a note,
   * so there is nothing to keep in step with it.
   */
  async updateNotes(id: number, notes: string): Promise<void> {
    await this.prisma.customer.update({ where: { id }, data: { notes } });
  }

  /**
   * Move a customer to another slot and write the card that goes with it — **one `$transaction`**, so
   * the register and the card in the household's pocket cannot be left disagreeing (US-30).
   *
   * The update goes first and the card's slot is read back off the row it just wrote, so the card can
   * only ever be printed under the number the household now holds. Earlier cards keep the numbers
   * they were printed with — the run left on the old slot is what makes it safe to hand out again
   * (US-25). Any refusal rolls the whole transaction back.
   *
   * @throws {CustomerNumberTaken} if an active customer took the number first.
   * @throws {CardNumberTaken} if the index had already been printed on the new slot.
   * @throws {CardIndexTaken} if the household was issued a card at that index meanwhile — their own
   *   run is half of what picks the index (`nextCardIndexOnMove`), so it can go stale under this
   *   write exactly as the slot's run can, and is answered by re-reading the record.
   */
  async changeCustomerNumber(
    id: number,
    customerNumber: number,
    card: NewCard,
  ): Promise<IssuedCard> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const moved = await tx.customer.update({
          where: { id },
          data: { customerNumber },
          select: { customerNumber: true },
        });
        return tx.card.create({
          data: {
            customerId: id,
            customerNumber: moved.customerNumber,
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
      // The slot itself. Checked first and unambiguous: `Customer`'s index names one column where
      // both of `Card`'s name two.
      if (isCollisionOn(error, ["customerNumber"])) {
        throw new CustomerNumberTaken(customerNumber);
      }
      // One of `Card`'s two unique indexes, and *which* is asked of the record rather than the error
      // — `PrismaCardRepository.issue`'s reading, shared so the two writers of a card cannot
      // translate one constraint two ways.
      //
      // Both faults reach here and are answered differently: a spent card number is re-read from the
      // slot's run (US-25), an index the household already holds from the record. The second is the
      // fault only a move raises, since its index is the later of two runs.
      if (isCardCollision(error)) {
        const held = await this.prisma.card.count({ where: { customerId: id, index: card.index } });
        throw held > 0
          ? new CardIndexTaken(id, card.index)
          : new CardNumberTaken(customerNumber, card.index);
      }
      throw error;
    }
  }

  /**
   * Move a customer to a new status, writing `blockReason` in the same statement. Number, cards and
   * records are untouched — only the status column and its reason change (US-08).
   */
  async setStatus(id: number, status: CustomerStatus, blockReason: string | null): Promise<void> {
    await this.prisma.customer.update({ where: { id }, data: { status, blockReason } });
  }

  /**
   * Archive a customer: status, reason and instant in one statement, with any block reason cleared,
   * so an archived row is never left without its why nor with a stale block.
   *
   * The slot is freed by the status alone, because the partial unique index exempts archived rows —
   * that is the whole mechanism (US-10, PRD §7), and why this is a `WHERE id` update and no larger.
   */
  async archive(id: number, reason: string, archivedAt: Date): Promise<void> {
    await this.prisma.customer.update({
      where: { id },
      data: { status: "ARCHIVED", blockReason: null, archiveReason: reason, archivedAt },
    });
  }
}

/**
 * How many customers hold a slot — the reality the quota may not be lowered below
 * (`tasks/prd-us-14-configure-business-rules.md`, FR-4). The same rows
 * {@link PrismaCustomerRepository.takenActiveNumbers} reads: "holds a number" and "counts against the
 * quota" are one statement.
 */
export class PrismaCustomerCounter implements CustomerCounter {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  countActive(): Promise<number> {
    return this.prisma.customer.count({ where: ON_REGISTER });
  }
}
