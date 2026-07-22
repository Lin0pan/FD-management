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
CREATE INDEX "AuditEntry_when_idx" ON "AuditEntry"("when");
