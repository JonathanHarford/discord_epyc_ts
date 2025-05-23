-- AlterTable
ALTER TABLE "Season" ADD COLUMN     "channelId" TEXT,
ADD COLUMN     "guildId" TEXT;

-- CreateIndex
CREATE INDEX "Season_guildId_idx" ON "Season"("guildId");
