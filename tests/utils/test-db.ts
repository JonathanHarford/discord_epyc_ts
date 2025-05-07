import { PrismaClient } from '../../prisma/generated/index.js';
import { execSync } from 'child_process';

export const setupTestDatabase = async () => {
  const testDbUrl = process.env.TEST_DATABASE_URL;

  if (!testDbUrl) {
    
      throw new Error('TEST_DATABASE_URL is not set. Please set TEST_DATABASE_URL.');
    }
    // Use testDbUrl for Prisma Client instantiation
    process.env.DATABASE_URL = testDbUrl;
  

  // Migrations are now handled in globalSetup.js
  // try {
  //   execSync('pnpx prisma migrate deploy --schema=./prisma/schema.prisma', { stdio: 'inherit' });
  // } catch (error) {
  //   console.error("Failed to apply migrations for test database:", error);
  //   throw error;
  // }

  // 3. Return a new PrismaClient instance connected to the target test DB
  // PrismaClient will automatically use the DATABASE_URL from process.env
  return new PrismaClient();
};

export const resetTestDatabase = async (prismaClient: PrismaClient) => {
  const models = [
    'Flag',
    'SeasonsPlayers',
    'Turn',
    'Game',
    'Season',
    'Player',
    'User',
    'ServerSettings',
    'GameSettings',
    'SeasonSettings',
    'Server',
  ];

  for (const model of models) {
    // Use $executeRawUnsafe for dynamic model names or handle types carefully
    // A simpler approach for defined models is direct access
    // We need to cast because the string literal isn't enough for TS
    await (prismaClient[model as keyof PrismaClient] as any).deleteMany({});
  }
  console.log('Test database reset.');
}; 