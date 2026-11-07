/**
 * Runs once when the server starts, before it answers a request — the one moment nothing has opened
 * the register, so a staged restore is swapped in here (`local_only/datensicherung`).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const [
    { applyStagedRestore },
    { databaseBackupsFor, softwareVersion },
    { prisma },
    audit,
    clock,
  ] = await Promise.all([
    import("@/application/backup/apply-staged-restore"),
    import("@/infrastructure/backup/composition"),
    import("@/infrastructure/prisma/client"),
    import("@/infrastructure/prisma/audit-log"),
    import("@/infrastructure/clock"),
  ]);
  try {
    const restored = await applyStagedRestore({
      backups: databaseBackupsFor(prisma),
      audit: new audit.PrismaAuditLog(prisma),
      clock: clock.systemClock,
      softwareVersion,
    });
    if (restored !== null) {
      console.info(
        `FD-Management: backup restored; the previous register is ${restored.safetyCopy}.`,
      );
    }
  } catch (error: unknown) {
    // The old register is still in place and the staged file still waits: the next start retries.
    console.error("FD-Management: the staged restore could not be swapped in.", error);
  }
}
