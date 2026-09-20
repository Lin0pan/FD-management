-- CreateTable
CREATE TABLE "SettingsVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recordedAt" DATETIME NOT NULL,
    "quotaN" INTEGER NOT NULL,
    "weekAnchorIsoWeek" TEXT NOT NULL,
    "weekAnchorColour" TEXT NOT NULL,
    "distributionWeekday" INTEGER NOT NULL,
    "pricePerGrownUpCents" INTEGER NOT NULL,
    "pricePerChildCents" INTEGER NOT NULL,
    "priceCapCents" INTEGER
);

-- CreateTable
CREATE TABLE "EggAllowanceRow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "settingsVersionId" INTEGER NOT NULL,
    "minPersons" INTEGER NOT NULL,
    "eggs" INTEGER NOT NULL,
    CONSTRAINT "EggAllowanceRow_settingsVersionId_fkey" FOREIGN KEY ("settingsVersionId") REFERENCES "SettingsVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CertificateType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "label" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerNumber" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATETIME NOT NULL,
    "firstNameFolded" TEXT NOT NULL,
    "lastNameFolded" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "houseNumber" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "blockReason" TEXT,
    "archiveReason" TEXT,
    "archivedAt" DATETIME,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "previousCustomerId" INTEGER,
    CONSTRAINT "Customer_previousCustomerId_fkey" FOREIGN KEY ("previousCustomerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATETIME NOT NULL,
    CONSTRAINT "HouseholdMember_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "validUntil" DATETIME NOT NULL,
    "recordedAt" DATETIME NOT NULL,
    CONSTRAINT "Certificate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Card" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "customerNumber" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "issuedAt" DATETIME NOT NULL,
    "grownUpsAtIssue" INTEGER NOT NULL,
    "childrenAtIssue" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    CONSTRAINT "Card_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DistributionRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "showedUp" BOOLEAN NOT NULL,
    "paidCents" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    CONSTRAINT "DistributionRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DistributionRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DistributionSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HandoutReceipt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recordId" INTEGER NOT NULL,
    "customerNumber" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "grownUps" INTEGER NOT NULL,
    "children" INTEGER NOT NULL,
    "cardCustomerNumber" INTEGER NOT NULL,
    "cardIndex" INTEGER NOT NULL,
    "certificateValidUntil" DATETIME NOT NULL,
    "reminderCount" INTEGER NOT NULL,
    CONSTRAINT "HandoutReceipt_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "DistributionRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DistributionSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "discardedAt" DATETIME,
    "groups" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "WaitingListEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATETIME NOT NULL,
    "street" TEXT NOT NULL,
    "houseNumber" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "contactNote" TEXT,
    "certificateType" TEXT NOT NULL,
    "certificateValidUntil" DATETIME NOT NULL,
    "addedOn" DATETIME NOT NULL,
    "removedOn" DATETIME,
    "removalReason" TEXT
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "resultingCount" INTEGER NOT NULL,
    CONSTRAINT "ReminderLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReminderLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DistributionSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
CREATE INDEX "EggAllowanceRow_settingsVersionId_idx" ON "EggAllowanceRow"("settingsVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "EggAllowanceRow_settingsVersionId_minPersons_key" ON "EggAllowanceRow"("settingsVersionId", "minPersons");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateType_label_key" ON "CertificateType"("label");

-- CreateIndex
CREATE INDEX "Customer_customerNumber_idx" ON "Customer"("customerNumber");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE INDEX "Customer_lastNameFolded_birthDate_idx" ON "Customer"("lastNameFolded", "birthDate");

-- CreateIndex
CREATE INDEX "Customer_firstNameFolded_idx" ON "Customer"("firstNameFolded");

-- CreateIndex
CREATE INDEX "HouseholdMember_customerId_idx" ON "HouseholdMember"("customerId");

-- CreateIndex
CREATE INDEX "Certificate_customerId_recordedAt_idx" ON "Certificate"("customerId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Card_customerId_index_key" ON "Card"("customerId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "Card_customerNumber_index_key" ON "Card"("customerNumber", "index");

-- CreateIndex
CREATE INDEX "DistributionRecord_date_idx" ON "DistributionRecord"("date");

-- CreateIndex
CREATE INDEX "DistributionRecord_customerId_date_idx" ON "DistributionRecord"("customerId", "date");

-- CreateIndex
CREATE INDEX "DistributionRecord_sessionId_idx" ON "DistributionRecord"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionRecord_customerId_sessionId_key" ON "DistributionRecord"("customerId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoutReceipt_recordId_key" ON "HandoutReceipt"("recordId");

-- CreateIndex
CREATE INDEX "DistributionSession_startedAt_idx" ON "DistributionSession"("startedAt");

-- CreateIndex
CREATE INDEX "WaitingListEntry_addedOn_idx" ON "WaitingListEntry"("addedOn");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_customerId_sessionId_key" ON "ReminderLog"("customerId", "sessionId");

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

-- CreateIndex (hand-written: the same reason, on a different shape of rule)
--
-- At most one distribution session runs at a time, on every workstation at once (US-34, FR-5). The
-- indexed expression is constant by construction — every running row indexes the same value — so
-- the *second* running row is the one that collides. Ending or discarding a session takes it out of
-- the partial index and the next one may start.
--
-- The application asks `findRunning` before it starts one; only the database can settle two
-- workstations pressing the button in the same second.
CREATE UNIQUE INDEX "one_running_session"
    ON "DistributionSession"("startedAt" IS NOT NULL)
    WHERE "endedAt" IS NULL AND "discardedAt" IS NULL;
