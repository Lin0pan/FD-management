/**
 * Database seed entry point: `npm run db:seed`, run after `prisma migrate deploy` on a new install
 * and by the Playwright web server.
 *
 * It only fills an *empty* settings table, so running it against a live database changes nothing.
 * The values themselves live in src/infrastructure/prisma/seed.ts next to the repository.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaSettingsRepository } from "../src/infrastructure/prisma/settings-repository";
import { seedSettings } from "../src/infrastructure/prisma/seed";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const inserted = await seedSettings(new PrismaSettingsRepository(prisma));
    console.log(
      inserted
        ? "Seeded the provisional settings version."
        : "Settings already present — nothing to seed.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
