-- CreateTable
CREATE TABLE "SettingsVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recordedAt" DATETIME NOT NULL,
    "quotaN" INTEGER NOT NULL,
    "portionsPerGrownUp" INTEGER NOT NULL,
    "portionsPerChild" INTEGER NOT NULL,
    "weekAnchorIsoWeek" TEXT NOT NULL,
    "weekAnchorColour" TEXT NOT NULL,
    "distributionWeekday" INTEGER NOT NULL,
    "pricePerGrownUpCents" INTEGER NOT NULL,
    "pricePerChildCents" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerNumber" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATETIME NOT NULL,
    "street" TEXT NOT NULL,
    "houseNumber" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATETIME NOT NULL,
    CONSTRAINT "HouseholdMember_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "validUntil" DATETIME NOT NULL,
    CONSTRAINT "Certificate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Card" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "issuedAt" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    CONSTRAINT "Card_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DistributionRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "dayKey" TEXT NOT NULL,
    "showedUp" BOOLEAN NOT NULL,
    "paid" BOOLEAN NOT NULL,
    "priceCents" INTEGER NOT NULL,
    CONSTRAINT "DistributionRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "what" TEXT NOT NULL,
    "changedFields" TEXT NOT NULL,
    "when" DATETIME NOT NULL,
    "why" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "SettingsVersion_recordedAt_idx" ON "SettingsVersion"("recordedAt");

-- CreateIndex
CREATE INDEX "Customer_customerNumber_idx" ON "Customer"("customerNumber");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE INDEX "HouseholdMember_customerId_idx" ON "HouseholdMember"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_customerId_key" ON "Certificate"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_customerId_index_key" ON "Card"("customerId", "index");

-- CreateIndex
CREATE INDEX "DistributionRecord_date_idx" ON "DistributionRecord"("date");

-- CreateIndex
CREATE INDEX "DistributionRecord_customerId_date_idx" ON "DistributionRecord"("customerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionRecord_customerId_dayKey_key" ON "DistributionRecord"("customerId", "dayKey");

-- CreateIndex
CREATE INDEX "AuditEntry_when_idx" ON "AuditEntry"("when");

-- CreateIndex (hand-written: Prisma has no syntax for a partial/filtered unique index)
--
-- A customer number is a *slot*, not an identity. At most one household that is still on the
-- register may hold a given number; an archived household releases it, so any number of archived
-- rows may share one (docs/tech_stack_architecture_sketch.md §5.3).
--
-- The predicate is `status <> 'ARCHIVED'` rather than `status = 'ACTIVE'` because a BLOCKED
-- household is turned away at the counter but still holds its slot — reusing its number would hand
-- two households the same card.
--
-- This index is the *final* authority on a free number: the application reads the taken numbers and
-- then writes, and only the database can settle the race in between.
CREATE UNIQUE INDEX "Customer_customerNumber_onRegister_key"
    ON "Customer"("customerNumber")
    WHERE "status" <> 'ARCHIVED';
