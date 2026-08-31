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
import { parseGroup, type Group, type GroupCounts } from "@/domain/customer/group";
import { foldName } from "@/domain/customer/nameSearch";
import {
  CardNumberTaken,
  CustomerNotFound,
  CustomerNumberTaken,
  InvalidCustomerRecord,
} from "@/domain/errors";
import { toIssuedCard } from "./card-repository";

/**
 * Everyone who still holds a customer number.
 *
 * `ACTIVE` and `BLOCKED` both occupy a slot — a blocked household is turned away at the counter but
 * stays registered — while `ARCHIVED` releases it. Stating the condition once keeps the three
 * queries below from drifting apart, which is how a number would silently be handed out twice.
 */
const ON_REGISTER = { status: { not: "ARCHIVED" } } as const;

/**
 * The related rows the counter and the card view both read off a customer — the household, the
 * certificate and the current card — loaded *with* the customer so neither screen fans out into an
 * N+1 (tasks/prd-us-04-lookup-customer.md §US-04.3).
 *
 * Prisma's SQLite provider has no join strategy (`relationLoadStrategy: "join"` is Postgres/MySQL
 * only), so this is four statements per lookup rather than literally one: the customer and one per
 * relation. What matters at the counter is that the number is *fixed* — a ten-person household costs
 * the same four reads as a two-person one — which is the invariant the integration test pins.
 */
const CUSTOMER_INCLUDE = {
  householdMembers: { orderBy: { id: "asc" } },
  // The latest-recorded certificate is the one on file; renewals stack behind it as history
  // (US-06.3). The id breaks a same-instant tie the same way "the later row wins" does elsewhere.
  certificates: { orderBy: [{ recordedAt: "desc" }, { id: "desc" }], take: 1 },
  // The highest index is the card the customer actually holds; a reissue supersedes the earlier
  // one, which stays on file so an old card can be recognised at the counter (US-09). The whole run
  // is loaded rather than only the top one, because the *first* card is the household's start date
  // (`registeredOn`) — there is no registration column, and a second query for one date on the
  // counter's hot path would cost more than the two or three rows a household's run ever holds.
  cards: { orderBy: { index: "desc" } },
} as const satisfies Prisma.CustomerInclude;

/** A customer row with the {@link CUSTOMER_INCLUDE} relations attached. */
type CustomerRow = Prisma.CustomerGetPayload<{ include: typeof CUSTOMER_INCLUDE }>;

/**
 * Whether a failed write was one named unique index rejecting the row: the columns of the index, in
 * order, and not a substring of the error's `meta` blob.
 *
 * A registration writes the customer *and* their first card in one nested statement, and both rows
 * carry a `customerNumber` (US-25) — so matching the word alone would report a card number already
 * printed on this slot as a lost race for the slot itself, which the caller answers by retrying on
 * another number and leaves the real fault in place. Prisma names the *rooted* model for a nested
 * write, `Customer` for both, so the columns are the only thing that tells them apart.
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
 * belongs to nobody (US-11.3).
 *
 * The link is display metadata the application deliberately does not verify — no rule reads it, and
 * a lookup purely to check it would make it one. The database checks it for free; all that is left
 * is to report the refusal as the domain's own `CustomerNotFound` rather than as a Prisma code.
 *
 * Unlike the unique-index collision above, the offending column cannot be read off the error:
 * SQLite reports a foreign-key violation with no `meta` at all. It does not need to be — the
 * customer, its members, its certificate and its card go out as one nested write, so every other
 * foreign key in it points at the row being inserted. `previousCustomerId` is the only one that can
 * name something that might not exist, and the caller checks that they supplied one.
 */
function isMissingPredecessor(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

/**
 * What the customer list's single search box narrows the query by (US-15.2).
 *
 * A name is folded here, because only this layer knows the columns hold folded values, and matched
 * as a prefix of *either* name: staff type whichever of the two they were given, and a household is
 * as often looked up by the first name as by the surname. The customer number is matched exactly —
 * a slot is a number, not a prefix, and `5` must not drag in 50 and 51.
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
 * The SQLite-backed {@link CustomerRepository}.
 *
 * The adapter maps and nothing else: no rule is decided here. What it *does* own is the one thing
 * the pure layers cannot — the partial unique index that settles which of two simultaneous
 * registrations got the last free number (tasks/prd-us-01-register-customer.md §US-01.5).
 */
export class PrismaCustomerRepository implements CustomerRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /** The numbers held by customers who still occupy a slot; archived rows release theirs. */
  async takenActiveNumbers(): Promise<ReadonlyArray<number>> {
    const rows = await this.prisma.customer.findMany({
      where: ON_REGISTER,
      select: { customerNumber: true },
      orderBy: { customerNumber: "asc" },
    });
    return rows.map((row) => row.customerNumber);
  }

  /** How many customers each balancing group holds. Archived households turn up to nothing. */
  async groupCounts(): Promise<GroupCounts> {
    const [red, blue] = await Promise.all([
      this.prisma.customer.count({ where: { ...ON_REGISTER, group: "RED" } }),
      this.prisma.customer.count({ where: { ...ON_REGISTER, group: "BLUE" } }),
    ]);
    return { red, blue };
  }

  /**
   * The customer behind a surrogate id, with their household, certificate and current card.
   *
   * Archived customers come back like any other — their data stays queryable (US-10, US-11). The
   * stored `group` and `status` strings re-enter the domain through its own parsers, so a
   * hand-edited row fails loudly instead of quietly becoming an active RED household.
   */
  async findById(id: number): Promise<RegisteredCustomer | null> {
    const row = await this.prisma.customer.findUnique({
      where: { id },
      include: CUSTOMER_INCLUDE,
    });
    return row === null ? null : this.toRegisteredCustomer(row);
  }

  /**
   * The customer a customer *number* resolves to at the counter (US-04.2): the slot's active holder
   * when there is one, and otherwise the most recently archived holder, so a freed-and-not-yet-
   * reissued number still names who last had it.
   *
   * Two reads rather than one because "active or, failing that, the latest archived" is not a single
   * `orderBy`: an active holder must always win over an archived one regardless of when each row was
   * created, and only when there is no active holder does recency decide between the archived ones.
   * A reassigned slot therefore resolves to its current holder, never to the person it was taken
   * from. At most one active holder can exist — the partial unique index guarantees it.
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
   * Every customer in one status, lowest customer number first, each with their household,
   * certificate and current card attached.
   *
   * This is the one whole-register read in the product, and it exists for the cards-due-for-reissue
   * list, which compares each household's birthdates against what their card has printed on it
   * (US-13.2). That comparison cannot be a `WHERE` clause — one side of it is a rule over dates that
   * changes answer as the clock moves — so the rows come out and the domain decides. At DF's ~240
   * customers this is a few hundred rows loaded once on a screen nobody stands at.
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
   * The customers the customer list asked for, lowest customer number first (US-15.2).
   *
   * Every criterion is a `WHERE` clause. The register is small enough that loading it and filtering
   * in JavaScript would work, and that is exactly why it is written down here instead: the screen
   * that replaces a spreadsheet must not *be* one, and the day someone adds a column to it the
   * filtering should already be where a database can serve it from an index.
   *
   * Names are compared folded, by the same `foldName` that wrote the columns, so this search and the
   * archive search (US-11.1) agree letter for letter — one normalisation in the codebase, not two. A
   * folded prefix matches either name, because staff type whichever of the two they were told.
   */
  async list(query: CustomerListQuery): Promise<ReadonlyArray<RegisteredCustomer>> {
    const rows = await this.prisma.customer.findMany({
      where: {
        status: { in: [...query.statuses] },
        ...(query.group === undefined ? {} : { group: query.group }),
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
   * It is a separate statement because Prisma cannot express "the latest related row satisfies this"
   * — `certificates: { some: … }` would match a household on a notice they have long since renewed,
   * which is precisely the household the list must *not* show as expired. The correlated subquery
   * picks the same row `CUSTOMER_INCLUDE` calls current (latest `recordedAt`, id breaking the tie),
   * so the filter and the certificate the screen prints beside it are always the same certificate.
   *
   * The bounds are half-open — `from` included, `before` excluded — so a `validUntil` that was
   * stored with a time of day still falls on the side of the boundary its calendar day belongs to.
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
   * The name criteria are folded here, because only this layer knows the columns hold folded values;
   * the folding itself is the domain's `foldName`, the same function that wrote them, so the query
   * and the stored value can never mean two different things. `startsWith` on the folded column is a
   * prefix match the `(lastNameFolded, birthDate)` index serves, which is why the fold is stored at
   * all — SQLite could not do it in the `WHERE` clause.
   *
   * A criterion nobody filled in is left out of the `where` entirely rather than matched against the
   * empty string; whether *no* criterion at all is acceptable is the use case's rule, and it refuses
   * before reaching here.
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
      // Most recently archived first; the id breaks a same-instant tie the way "the later row wins"
      // does elsewhere, so the order is total and two runs of the same search agree.
      orderBy: [{ archivedAt: "desc" }, { id: "desc" }],
      take: limit,
      include: CUSTOMER_INCLUDE,
    });
    return rows.map((row) => this.toArchivedCustomer(row));
  }

  /**
   * Map an archived row, narrowing the archive reason and instant to non-null.
   *
   * @throws {InvalidCustomerRecord} if either is missing. `archive` writes the status, the reason and
   *   the instant in one statement, so an archived row without them can only come from a hand-edited
   *   database — and a search result inventing a reason would be worse than refusing.
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
   * Map a loaded row into the domain record, validating the stored `group` and `status` strings on
   * the way back in — a hand-edited row fails loudly rather than quietly becoming an active RED
   * household.
   *
   * @throws {InvalidCustomerRecord} if the certificate or the current card is missing. Registration
   *   writes both in the same transaction as the customer, so a row without them can only come from
   *   a hand-edited database — and a card view inventing either would be worse than refusing.
   */
  private toRegisteredCustomer(row: CustomerRow): RegisteredCustomer {
    const certificate = row.certificates[0];
    const card = row.cards[0];
    // The run is ordered highest index first, so its last element is the card handed over with the
    // registration — the day the household joined. A reissue therefore cannot move their start.
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
      group: parseGroup(row.group),
      status: parseCustomerStatus(row.status),
      blockReason: row.blockReason,
      archiveReason: row.archiveReason,
      archivedAt: row.archivedAt,
      reminderCount: row.reminderCount,
      card: {
        // The slot the card was **printed under**, off the card row rather than off the customer's
        // — the two part company for a household that has been moved to another number (US-30).
        customerNumber: card.customerNumber,
        index: card.index,
        issuedAt: card.issuedAt,
        reason: parseCardIssueReason(card.reason),
        // What is printed on the card the household holds, not what their household is today — the
        // two part company on a 13th birthday, which is the whole point of storing it (US-13.3).
        countsAtIssue: { grownUps: card.grownUpsAtIssue, children: card.childrenAtIssue },
        // Likewise the group: what the card names as their week, not the group they are in today.
        groupAtIssue: parseGroup(card.groupAtIssue),
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
   * Persist a new customer with their household, certificate and first card.
   *
   * The nested writes go out as **one statement group inside a single transaction**, so a failure
   * anywhere leaves neither a half-built household nor a consumed customer number.
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
          // The search keys, derived from the names in the same statement that writes them, so the
          // two cannot be written apart (US-11.1). A future edit of a name must do the same.
          firstNameFolded: foldName(details.firstName),
          lastNameFolded: foldName(details.lastName),
          birthDate: details.birthDate,
          street: details.address.street,
          houseNumber: details.address.houseNumber,
          zip: details.address.zip,
          city: details.address.city,
          group: customer.group,
          status: customer.status,
          reminderCount: customer.reminderCount,
          notes: details.notes,
          // Display metadata for a returning household (US-11.3), null for everyone else. Written
          // like any other column: nothing is copied across the link, and the predecessor's row is
          // not read, let alone touched.
          previousCustomerId: customer.previousCustomerId,
          householdMembers: {
            create: details.householdMembers.map((member) => ({
              firstName: member.firstName,
              lastName: member.lastName,
              birthDate: member.birthDate,
            })),
          },
          certificates: {
            // The first row of the append-only trail, recorded at the registration instant — the
            // same one the first card carries, because both were written by the same decision.
            create: {
              type: details.certificate.type,
              validUntil: details.certificate.validUntil,
              recordedAt: customer.card.issuedAt,
            },
          },
          cards: {
            create: {
              // The slot the card is printed under, written in the same statement as the customer
              // row it comes from — the key `@@unique([customerNumber, index])` needs, never the
              // card's number, which stays derived (US-25).
              customerNumber: customer.customerNumber,
              index: customer.card.index,
              issuedAt: customer.card.issuedAt,
              reason: customer.card.reason,
              grownUpsAtIssue: customer.card.countsAtIssue.grownUps,
              childrenAtIssue: customer.card.countsAtIssue.children,
              groupAtIssue: customer.card.groupAtIssue,
            },
          },
        },
        select: { id: true },
      });
      // A newly registered customer is always active, so they carry neither a block reason (US-08)
      // nor an archive one (US-10), and the card just written is both their current and their first —
      // which is what makes today their `registeredOn`.
      return {
        ...customer,
        id: row.id,
        // The card as it was stored: printed under the very number this registration just took, and
        // filled in here rather than by the caller for the reason `issue` gives — a caller that
        // could pass the slot is a caller that could pass the wrong one.
        card: { ...customer.card, customerNumber: customer.customerNumber },
        blockReason: null,
        archiveReason: null,
        archivedAt: null,
        registeredOn: customer.card.issuedAt,
      };
    } catch (error: unknown) {
      // The partial index on the register — the slot itself was taken while this was in flight.
      if (isCollisionOn(error, ["customerNumber"])) {
        throw new CustomerNumberTaken(customer.customerNumber);
      }
      // `Card`'s global index — the slot was won, but the card number on it has been printed before
      // (US-25). A different fault: another slot answers the first, and nothing answers this one but
      // reading the slot's run again.
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
   * Delete-then-create inside **one transaction**, because the household is a set rather than a list
   * of rows staff maintain: matching the given rows against the stored ones would need an identity
   * the screen does not have — two children of the same name and birthdate are two rows and nothing
   * distinguishes them — and a partial match would leave a household nobody typed. The delete is the
   * one place in this file that removes anything, and what it removes is not customer data leaving
   * the system: no history of past compositions is kept (PRD §FR-2), and the counts the household
   * *had* survive on the card that printed them.
   *
   * Nothing derived is written: there is no count column, and the price follows from the birthdates
   * the moment they are read.
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
   * Correct the customer's personal data and the household they belong to, in **one transaction**
   * (US-16.2).
   *
   * The folded search keys are rewritten from the names in the same statement, so the register can
   * never be findable only under a spelling nobody uses any more; they are a *search key* and not a
   * fact, which is exactly why they may not be written apart from the names they come from (US-11.1).
   *
   * The household is replaced the way {@link updateHousehold} replaces it, and for the same reason:
   * the customer is one of its rows, their name is on the record twice, and a write that moved only
   * one of the two would leave a household listing a person who no longer exists. Which row was them
   * has already been decided by the domain (`replaceHouseholdMember`) — the adapter is handed the set
   * as it should stand and writes it, even when nothing in it moved, so there is one code path here
   * rather than a comparison this layer has no business making.
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
   * Replace the free-text note on a record (US-16.3).
   *
   * One column, one statement: nothing is derived from a note, so there is nothing to keep in step
   * with it — which is what makes this the shortest write in the file rather than a transaction.
   */
  async updateNotes(id: number, notes: string): Promise<void> {
    await this.prisma.customer.update({ where: { id }, data: { notes } });
  }

  /**
   * Move a customer to the other balancing group — a single column, and nothing beside it (US-16.4).
   *
   * The cards the household has been issued are deliberately left alone: each printed the group that
   * was true when it left the counter, and updating that snapshot is what would hide the fact that
   * the card in their pocket now names the wrong week.
   */
  async setGroup(id: number, group: Group): Promise<void> {
    await this.prisma.customer.update({ where: { id }, data: { group } });
  }

  /**
   * Move a customer to another slot and write the card that goes with it — **one `$transaction`**,
   * so the register and the card in the household's pocket can never be left disagreeing (US-30).
   *
   * The update goes first and the card's slot is then read back off the row it just wrote, exactly
   * as {@link PrismaCardRepository.issue} reads it off the customer: the card can only ever be
   * printed under the number the household now holds, whatever a caller passed. Nothing else is
   * touched — the earlier cards keep the numbers they were printed with, because the run left on
   * the old slot is what makes that slot safe to hand out again (US-25).
   *
   * Either constraint refusing the write rolls the whole transaction back, so a lost race leaves
   * neither a moved number nor a card.
   *
   * @throws {CustomerNumberTaken} if an active customer took the number first — the partial unique
   *   index on the register.
   * @throws {CardNumberTaken} if the index had already been printed on the new slot.
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
            groupAtIssue: card.groupAtIssue,
          },
        });
      });
      return toIssuedCard(row);
    } catch (error: unknown) {
      // The slot itself, refused by the register's partial unique index.
      if (isCollisionOn(error, ["customerNumber"])) {
        throw new CustomerNumberTaken(customerNumber);
      }
      // The card number on it, refused by `Card`'s global index — a different fault, and one no
      // retry on this slot can answer (US-25).
      if (isCollisionOn(error, ["customerNumber", "index"])) {
        throw new CardNumberTaken(customerNumber, card.index);
      }
      throw error;
    }
  }

  /**
   * Move a customer to a new status, writing `blockReason` alongside it in the same statement — the
   * trimmed reason for a block, `null` for anything else. The number, cards and distribution records
   * are untouched: only the status column (and its reason) change (US-08).
   */
  async setStatus(id: number, status: CustomerStatus, blockReason: string | null): Promise<void> {
    await this.prisma.customer.update({ where: { id }, data: { status, blockReason } });
  }

  /**
   * Archive a customer: status, reason and instant in one statement, with any block reason cleared
   * alongside them, so an archived row can never be left without its why nor with a stale block.
   *
   * Nothing else is written — the customer number stays put and no related row is touched. The slot
   * is freed by the status alone, because the partial unique index in the init migration exempts
   * archived rows; that is the whole mechanism (US-10, PRD §7), and it is why archiving is a `WHERE
   * id` update rather than anything larger.
   */
  async archive(id: number, reason: string, archivedAt: Date): Promise<void> {
    await this.prisma.customer.update({
      where: { id },
      data: { status: "ARCHIVED", blockReason: null, archiveReason: reason, archivedAt },
    });
  }
}

/**
 * How many customers currently hold a slot — the reality the quota `N` may not be lowered below
 * (tasks/prd-us-14-configure-business-rules.md, FR-4).
 *
 * It counts the same rows as {@link PrismaCustomerRepository.takenActiveNumbers}, because "holds a
 * number" and "counts against the quota" are the same statement said twice.
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
