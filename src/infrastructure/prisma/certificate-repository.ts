import type { PrismaClient } from "@prisma/client";
import type { CertificateRepository } from "@/application/ports";
import type { NeedsCertificate } from "@/domain/customer/customer";

/**
 * The SQLite-backed {@link CertificateRepository}. `renew` **appends** rather than editing the row on
 * file, so the history of renewals stays readable (US-06.3, FR-8), and the append goes out in **one
 * transaction** with the `reminderCount` reset — a renewal landing without its reset would show a
 * customer still owing what they have just brought.
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
