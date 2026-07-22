-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "what" TEXT NOT NULL,
    "changedFields" TEXT NOT NULL,
    "when" DATETIME NOT NULL,
    "why" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "AuditEntry_when_idx" ON "AuditEntry"("when");
