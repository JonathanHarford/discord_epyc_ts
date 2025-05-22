import { PrismaClient } from '@prisma/client';

export async function truncateTables(prisma: PrismaClient) {
  await prisma.$executeRaw`TRUNCATE TABLE "PlayersOnSeasons" CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE "Turn" CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE "Game" CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE "Season" CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE "SeasonConfig" CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE "Player" CASCADE`;
} 