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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PriceTableRow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "settingsVersionId" INTEGER NOT NULL,
    "grownUps" INTEGER NOT NULL,
    "children" INTEGER NOT NULL,
    "cents" INTEGER NOT NULL,
    CONSTRAINT "PriceTableRow_settingsVersionId_fkey" FOREIGN KEY ("settingsVersionId") REFERENCES "SettingsVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SettingsVersion_effectiveFrom_key" ON "SettingsVersion"("effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PriceTableRow_settingsVersionId_grownUps_children_key" ON "PriceTableRow"("settingsVersionId", "grownUps", "children");
