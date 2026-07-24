/**
 * Integration tests for the SQLite certificate adapter.
 *
 * Thin and test-after, per the testing approach (CLAUDE.md): what is worth proving here is what the
 * pure layers cannot state — that a renewal **appends** a row rather than overwriting the one on
 * file, so the history of renewals stays readable (US-06.3, FR-8), that the customer repository
 * resolves the certificate on file as the latest by `recordedAt`, and that the append and the reset
 * of `reminderCount` to zero land in one transaction. The renewal rules themselves are unit-tested
 * in src/application.
 *
 * Each run migrates a throwaway database file which is deleted afterwards, so nothing touches
 * data/fd.db. Synthetic data only (Faker), seeded so a failing run is reproducible.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaCertificateRepository } from "./certificate-repository";
import { PrismaCustomerRepository } from "./customer-repository";

faker.seed(20260724);

const REGISTERED_AT = new Date("2026-01-15T09:00:00.000Z");
const RENEWED_AT = new Date("2026-07-23T09:00:00.000Z");

let directory: string;
let prisma: PrismaClient;
let repository: PrismaCertificateRepository;
let customers: PrismaCustomerRepository;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "fd-certificates-"));
  const url = `file:${join(directory, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });
  prisma = new PrismaClient({ datasourceUrl: url });
  repository = new PrismaCertificateRepository(prisma);
  customers = new PrismaCustomerRepository(prisma);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.certificate.deleteMany();
  await prisma.customer.deleteMany();
});

/**
 * A customer with the certificate and card a registration writes, inserted straight through Prisma —
 * the renewal is what is tested, and the customer repository refuses a row missing either relation.
 */
async function insertCustomer(customerNumber: number, reminderCount = 0): Promise<number> {
  const row = await prisma.customer.create({
    data: {
      customerNumber,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      birthDate: new Date("1990-01-01T00:00:00.000Z"),
      street: faker.location.street(),
      houseNumber: faker.location.buildingNumber(),
      zip: faker.location.zipCode("#####"),
      city: faker.location.city(),
      group: "RED",
      status: "ACTIVE",
      reminderCount,
      notes: "",
      certificates: {
        create: {
          type: "Jobcenter",
          validUntil: new Date("2026-06-30T00:00:00.000Z"),
          recordedAt: REGISTERED_AT,
        },
      },
      cards: { create: { index: 1, issuedAt: REGISTERED_AT, reason: "FIRST_ISSUE" } },
    },
    select: { id: true },
  });
  return row.id;
}

describe("PrismaCertificateRepository.renew", () => {
  it("appends the renewal as a new row, keeping the replaced certificate on file", async () => {
    const customerId = await insertCustomer(50);

    await repository.renew(
      customerId,
      { type: "Wohngeldbescheid", validUntil: new Date("2027-01-31T00:00:00.000Z") },
      RENEWED_AT,
    );

    const rows = await prisma.certificate.findMany({
      where: { customerId },
      orderBy: { recordedAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe("Jobcenter");
    expect(rows[1].type).toBe("Wohngeldbescheid");
    expect(rows[1].recordedAt).toEqual(RENEWED_AT);
  });

  it("resets the reminder count to zero in the same write", async () => {
    const customerId = await insertCustomer(50, 3);

    await repository.renew(
      customerId,
      { type: "Wohngeldbescheid", validUntil: new Date("2027-01-31T00:00:00.000Z") },
      RENEWED_AT,
    );

    const row = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { reminderCount: true },
    });
    expect(row.reminderCount).toBe(0);
  });

  it("makes the latest-recorded certificate the one the counter reads back", async () => {
    const customerId = await insertCustomer(50);

    await repository.renew(
      customerId,
      { type: "Wohngeldbescheid", validUntil: new Date("2027-01-31T00:00:00.000Z") },
      RENEWED_AT,
    );

    const found = await customers.findById(customerId);
    expect(found?.details.certificate).toEqual({
      type: "Wohngeldbescheid",
      validUntil: new Date("2027-01-31T00:00:00.000Z"),
    });
  });
});
