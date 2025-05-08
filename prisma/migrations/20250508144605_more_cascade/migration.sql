/*
  Warnings:

  - You are about to drop the column `testCreatorId` on the `players` table. All the data in the column will be lost.
  - You are about to drop the column `testMode` on the `server_settings` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "games" DROP CONSTRAINT "games_settingsId_fkey";

-- DropForeignKey
ALTER TABLE "players" DROP CONSTRAINT "players_testCreatorId_fkey";

-- DropForeignKey
ALTER TABLE "seasons" DROP CONSTRAINT "seasons_seasonSettingsId_fkey";

-- AlterTable
ALTER TABLE "players" DROP COLUMN "testCreatorId";

-- AlterTable
ALTER TABLE "server_settings" DROP COLUMN "testMode";

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "game_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_seasonSettingsId_fkey" FOREIGN KEY ("seasonSettingsId") REFERENCES "season_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
