-- DropForeignKey
ALTER TABLE "flags" DROP CONSTRAINT "flags_reporterId_fkey";

-- DropForeignKey
ALTER TABLE "flags" DROP CONSTRAINT "flags_turnId_fkey";

-- DropForeignKey
ALTER TABLE "games" DROP CONSTRAINT "games_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "games" DROP CONSTRAINT "games_serverId_fkey";

-- DropForeignKey
ALTER TABLE "players" DROP CONSTRAINT "players_id_fkey";

-- DropForeignKey
ALTER TABLE "seasons" DROP CONSTRAINT "seasons_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "seasons" DROP CONSTRAINT "seasons_serverId_fkey";

-- DropForeignKey
ALTER TABLE "seasons_players" DROP CONSTRAINT "seasons_players_playerId_fkey";

-- DropForeignKey
ALTER TABLE "seasons_players" DROP CONSTRAINT "seasons_players_seasonId_fkey";

-- DropForeignKey
ALTER TABLE "server_settings" DROP CONSTRAINT "server_settings_id_fkey";

-- DropForeignKey
ALTER TABLE "turns" DROP CONSTRAINT "turns_gameId_fkey";

-- DropForeignKey
ALTER TABLE "turns" DROP CONSTRAINT "turns_playerId_fkey";

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_id_fkey" FOREIGN KEY ("id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_settings" ADD CONSTRAINT "server_settings_id_fkey" FOREIGN KEY ("id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turns" ADD CONSTRAINT "turns_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turns" ADD CONSTRAINT "turns_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons_players" ADD CONSTRAINT "seasons_players_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons_players" ADD CONSTRAINT "seasons_players_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flags" ADD CONSTRAINT "flags_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flags" ADD CONSTRAINT "flags_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "turns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
