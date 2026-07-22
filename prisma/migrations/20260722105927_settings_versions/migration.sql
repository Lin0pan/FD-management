/*
  Warnings:

  - You are about to drop the `SchemaMarker` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "SchemaMarker";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "SettingsVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "effectiveFrom" DATETIME NOT NULL,
    "quotaN" INTEGER NOT NULL,
    "portionsPerGrownUp" INTEGER NOT NULL,
    "portionsPerChild" INTEGER NOT NULL,
    "reminderThreshold" INTEGER NOT NULL,
    "weekAnchorIsoWeek" TEXT NOT NULL,
    "weekAnchorColour" TEXT NOT NULL,
    "distributionWeekday" INTEGER NOT NULL,
    "pricePerGrownUpCents" INTEGER NOT NULL,
    "pricePerChildCents" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "SettingsVersion_effectiveFrom_key" ON "SettingsVersion"("effectiveFrom");
