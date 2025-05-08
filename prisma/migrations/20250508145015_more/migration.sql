-- DropForeignKey
ALTER TABLE "server_settings" DROP CONSTRAINT "server_settings_defaultGameSettingsId_fkey";

-- DropForeignKey
ALTER TABLE "server_settings" DROP CONSTRAINT "server_settings_defaultSeasonSettingsId_fkey";

-- AddForeignKey
ALTER TABLE "server_settings" ADD CONSTRAINT "server_settings_defaultGameSettingsId_fkey" FOREIGN KEY ("defaultGameSettingsId") REFERENCES "game_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_settings" ADD CONSTRAINT "server_settings_defaultSeasonSettingsId_fkey" FOREIGN KEY ("defaultSeasonSettingsId") REFERENCES "season_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
