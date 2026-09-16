import type { PrismaClient } from "@prisma/client";
import type { CertificateTypeRepository } from "@/application/ports";

/**
 * The SQLite-backed {@link CertificateTypeRepository}. `replace` deletes and re-inserts the whole
 * table in one transaction — see the port for why a partial write is never wanted.
 */
export class PrismaCertificateTypeRepository implements CertificateTypeRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async list(): Promise<ReadonlyArray<string>> {
    const rows = await this.prisma.certificateType.findMany({ orderBy: { id: "asc" } });
    return rows.map((row) => row.label);
  }

  async replace(labels: ReadonlyArray<string>): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.certificateType.deleteMany(),
      this.prisma.certificateType.createMany({ data: labels.map((label) => ({ label })) }),
    ]);
  }
}
