-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "configId" TEXT,
ADD COLUMN     "creatorId" TEXT,
ADD COLUMN     "guildId" TEXT,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "seasonId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "GameConfig" (
    "id" TEXT NOT NULL,
    "turnPattern" TEXT NOT NULL DEFAULT 'writing,drawing',
    "writingTimeout" TEXT NOT NULL DEFAULT '5m',
    "writingWarning" TEXT NOT NULL DEFAULT '1m',
    "drawingTimeout" TEXT NOT NULL DEFAULT '20m',
    "drawingWarning" TEXT NOT NULL DEFAULT '2m',
    "staleTimeout" TEXT NOT NULL DEFAULT '3d',
    "minTurns" INTEGER NOT NULL DEFAULT 6,
    "maxTurns" INTEGER,
    "returnCount" INTEGER DEFAULT 0,
    "returnCooldown" INTEGER DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isGuildDefaultFor" TEXT,

    CONSTRAINT "GameConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameConfig_isGuildDefaultFor_key" ON "GameConfig"("isGuildDefaultFor");

-- CreateIndex
CREATE INDEX "Game_creatorId_idx" ON "Game"("creatorId");

-- CreateIndex
CREATE INDEX "Game_guildId_idx" ON "Game"("guildId");

-- CreateIndex
CREATE INDEX "Game_lastActivityAt_idx" ON "Game"("lastActivityAt");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_configId_fkey" FOREIGN KEY ("configId") REFERENCES "GameConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
