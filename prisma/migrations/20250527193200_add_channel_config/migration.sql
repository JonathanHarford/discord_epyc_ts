-- CreateTable
CREATE TABLE "ChannelConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "announceChannelId" TEXT,
    "completedChannelId" TEXT,
    "adminChannelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConfig_guildId_key" ON "ChannelConfig"("guildId");

-- CreateIndex
CREATE INDEX "ChannelConfig_guildId_idx" ON "ChannelConfig"("guildId");
