import type { PrismaClient } from "@prisma/client";
import type { CertificateRepository } from "@/application/ports";
import type { NeedsCertificate } from "@/domain/customer/customer";

/**
 * The SQLite-backed {@link CertificateRepository}.
 *
 * `renew` **appends** — the renewed certificate becomes a new row rather than editing the one on
 * file, so the history of renewals stays readable (US-06.3, FR-8); the counter reads the latest by
 * `recordedAt` through the customer repository. The append and the reset of `reminderCount` to zero
 * go out in **one transaction**: a renewal that landed without its reset would show a customer
 * still owing the renewal they have just brought.
 */
export class PrismaCertificateRepository implements CertificateRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /** Append the renewed certificate at `recordedAt` and reset the customer's count to zero. */
  async renew(customerId: number, certificate: NeedsCertificate, recordedAt: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.certificate.create({
        data: {
          customerId,
          type: certificate.type,
          validUntil: certificate.validUntil,
          recordedAt,
        },
      }),
      this.prisma.customer.update({
        where: { id: customerId },
        data: { reminderCount: 0 },
      }),
    ]);
  }
}
