import { Prisma, type PrismaClient } from "@prisma/client";
import type { CustomerCounter, CustomerRepository } from "@/application/ports";
import { parseCardIssueReason } from "@/domain/card/card";
import {
  parseCustomerStatus,
  type NewCustomer,
  type RegisteredCustomer,
} from "@/domain/customer/customer";
import { parseGroup, type GroupCounts } from "@/domain/customer/group";
import { CustomerNumberTaken, InvalidCustomerRecord } from "@/domain/errors";

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
  // one, which stays on file so an old card can be recognised at the counter (US-09).
  cards: { orderBy: { index: "desc" }, take: 1 },
} as const satisfies Prisma.CustomerInclude;

/** A customer row with the {@link CUSTOMER_INCLUDE} relations attached. */
type CustomerRow = Prisma.CustomerGetPayload<{ include: typeof CUSTOMER_INCLUDE }>;

/**
 * Whether a failed write was the partial unique index rejecting a customer number that had been
 * taken in the meantime.
 *
 * The other unique constraint reachable from `create` — one card per `(customer, index)` — cannot
 * collide on a row that is being inserted for the first time, so the target is checked anyway
 * rather than assuming: a future constraint should surface as itself.
 */
function isCustomerNumberCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta ?? {}).includes("customerNumber")
  );
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
    if (certificate === undefined || card === undefined) {
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
      reminderCount: row.reminderCount,
      card: {
        index: card.index,
        issuedAt: card.issuedAt,
        reason: parseCardIssueReason(card.reason),
      },
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
   */
  async create(customer: NewCustomer): Promise<RegisteredCustomer> {
    const { details } = customer;
    try {
      const row = await this.prisma.customer.create({
        data: {
          customerNumber: customer.customerNumber,
          firstName: details.firstName,
          lastName: details.lastName,
          birthDate: details.birthDate,
          street: details.address.street,
          houseNumber: details.address.houseNumber,
          zip: details.address.zip,
          city: details.address.city,
          group: customer.group,
          status: customer.status,
          reminderCount: customer.reminderCount,
          notes: details.notes,
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
              index: customer.card.index,
              issuedAt: customer.card.issuedAt,
              reason: customer.card.reason,
            },
          },
        },
        select: { id: true },
      });
      return { ...customer, id: row.id };
    } catch (error: unknown) {
      if (isCustomerNumberCollision(error)) {
        throw new CustomerNumberTaken(customer.customerNumber);
      }
      throw error;
    }
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
