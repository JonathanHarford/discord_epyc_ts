-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "configId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayersOnSeasons" (
    "playerId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayersOnSeasons_pkey" PRIMARY KEY ("playerId","seasonId")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "seasonId" TEXT NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" TEXT NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "textContent" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "offeredAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "gameId" TEXT NOT NULL,
    "playerId" TEXT,
    "previousTurnId" TEXT,

    CONSTRAINT "Turn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonConfig" (
    "id" TEXT NOT NULL,
    "turnPattern" TEXT NOT NULL DEFAULT 'writing,drawing',
    "claimTimeout" TEXT NOT NULL DEFAULT '1d',
    "writingTimeout" TEXT NOT NULL DEFAULT '1d',
    "writingWarning" TEXT NOT NULL DEFAULT '1m',
    "drawingTimeout" TEXT NOT NULL DEFAULT '1d',
    "drawingWarning" TEXT NOT NULL DEFAULT '10m',
    "openDuration" TEXT NOT NULL DEFAULT '7d',
    "minPlayers" INTEGER NOT NULL DEFAULT 6,
    "maxPlayers" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isGuildDefaultFor" TEXT,

    CONSTRAINT "SeasonConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_discordUserId_key" ON "Player"("discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Season_name_key" ON "Season"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Season_configId_key" ON "Season"("configId");

-- CreateIndex
CREATE INDEX "Season_status_idx" ON "Season"("status");

-- CreateIndex
CREATE INDEX "Season_creatorId_idx" ON "Season"("creatorId");

-- CreateIndex
CREATE INDEX "PlayersOnSeasons_playerId_idx" ON "PlayersOnSeasons"("playerId");

-- CreateIndex
CREATE INDEX "PlayersOnSeasons_seasonId_idx" ON "PlayersOnSeasons"("seasonId");

-- CreateIndex
CREATE INDEX "Game_status_idx" ON "Game"("status");

-- CreateIndex
CREATE INDEX "Game_seasonId_idx" ON "Game"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "Turn_previousTurnId_key" ON "Turn"("previousTurnId");

-- CreateIndex
CREATE INDEX "Turn_status_idx" ON "Turn"("status");

-- CreateIndex
CREATE INDEX "Turn_type_idx" ON "Turn"("type");

-- CreateIndex
CREATE INDEX "Turn_gameId_idx" ON "Turn"("gameId");

-- CreateIndex
CREATE INDEX "Turn_playerId_idx" ON "Turn"("playerId");

-- CreateIndex
CREATE INDEX "Turn_createdAt_idx" ON "Turn"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonConfig_isGuildDefaultFor_key" ON "SeasonConfig"("isGuildDefaultFor");

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SeasonConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayersOnSeasons" ADD CONSTRAINT "PlayersOnSeasons_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayersOnSeasons" ADD CONSTRAINT "PlayersOnSeasons_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_previousTurnId_fkey" FOREIGN KEY ("previousTurnId") REFERENCES "Turn"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
