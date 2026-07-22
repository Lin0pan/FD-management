import { Prisma, type PrismaClient } from "@prisma/client";
import type { CustomerCounter, CustomerRepository } from "@/application/ports";
import type { NewCustomer, RegisteredCustomer } from "@/domain/customer/customer";
import type { GroupCounts } from "@/domain/customer/group";
import { CustomerNumberTaken } from "@/domain/errors";

/**
 * Everyone who still holds a customer number.
 *
 * `ACTIVE` and `BLOCKED` both occupy a slot — a blocked household is turned away at the counter but
 * stays registered — while `ARCHIVED` releases it. Stating the condition once keeps the three
 * queries below from drifting apart, which is how a number would silently be handed out twice.
 */
const ON_REGISTER = { status: { not: "ARCHIVED" } } as const;

/**
 * Whether a failed write was the partial unique index rejecting a customer number that had been
 * taken in the meantime.
 *
 * The other unique constraints reachable from `create` — one certificate per customer, one card per
 * `(customer, index)` — cannot collide on a row that is being inserted for the first time, so the
 * target is checked anyway rather than assuming: a future constraint should surface as itself.
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
          certificate: {
            create: { type: details.certificate.type, validUntil: details.certificate.validUntil },
          },
          cards: {
            create: { index: customer.card.index, issuedAt: customer.card.issuedAt },
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
