// This file will be used to set up the environment for integration tests.
// It will include Prisma client initialization, migrations, and table truncation logic. 

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { vi, beforeAll, afterAll } from 'vitest';

// Ensure TEST_DATABASE_URL is used
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL,
    },
  },
});

const runMigrations = () => {
  console.log('Running database migrations for tests...');
  try {
    // It's generally better to use the version of prisma installed in node_modules
    execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit' });
    console.log('Migrations completed.');
  } catch (error) {
    console.error('Failed to run migrations:', error);
    process.exit(1); // Exit if migrations fail
  }
};

const truncateTables = async () => {
  console.log('Truncating tables for a clean test state...');
  // Based on schema and cascade behavior, targeting these models for deletion.
  const modelsToTruncate = [
    'GameSettings',
    'SeasonSettings',
    'User', 
    'Server',
    // Most other tables (Player, Game, Turn, Season, Flag, ServerSettings, SeasonsPlayers)
    // should be cleared via onDelete: Cascade from User and Server.
  ];

  for (const modelName of modelsToTruncate) {
    try {
      await (prisma as any)[modelName].deleteMany({});
      // console.log(`Truncated ${modelName}`); // Optional: for verbose logging
    } catch (error) {
      console.error(`Error truncating ${modelName}:`, error);
      // Consider if tests should halt on truncation error
    }
  }
  console.log('Table truncation completed.');
};


// Run migrations once when this setup file is imported/run by Vitest
runMigrations();

// Export a function to be called by Vitest's hooks (e.g., beforeAll or beforeEach)
export const setupTestDatabaseAndTruncate = async () => {
  // Migrations are already run once on import.
  // Truncate tables before each test suite or test that needs a clean DB.
  await truncateTables();
};

export const E2EPrisma = prisma; // Export test prisma instance for direct use in tests

// Mock the DatabaseService to use the test Prisma client
// Corrected path from tests/setup/ to src/database/
vi.mock('../../src/database/index.js', async (importOriginal) => {
    const originalModule = await importOriginal() as any;
    // Check if DatabaseService is a class or if there's a default export to instantiate
    let MockedDatabaseService;
    if (originalModule.DatabaseService && typeof originalModule.DatabaseService === 'function') {
        MockedDatabaseService = class extends originalModule.DatabaseService {
            constructor() { // Changed to take no arguments
                // Call original constructor logic if necessary, or just initialize with test Prisma
                super(E2EPrisma); // Assumes constructor takes PrismaClient as first arg or is similar
            }
        };
    } else {
        // Fallback or error if DatabaseService class is not found as expected
        console.warn('DatabaseService class not found in the mocked module as expected. Mocking might be incomplete.');
        MockedDatabaseService = originalModule.DatabaseService; // assign original if not a class
    }

    return {
        ...originalModule,
        DatabaseService: MockedDatabaseService,
        // If your services import a global/singleton prisma instance from '../../src/database/index.js',
        // you might need to mock that too:
        // prisma: E2EPrisma, 
    };
});

console.log('Integration test setup: Loaded, migrations run. Truncation function ready.');

// Vitest global hook: Runs before all tests in each test file.
// This ensures tables are truncated for each test suite (file).
// If tests within the same file interfere with each other, 
// consider changing this to `beforeEach` to truncate before every single test.
beforeAll(async () => {
  console.log('Running beforeAll: truncating tables via setupTestDatabaseAndTruncate...');
  await setupTestDatabaseAndTruncate();
});

// Optional: Add afterAll or afterEach for cleanup if needed, e.g., prisma.$disconnect()
// afterAll(async () => {
//   await prisma.$disconnect();
//   console.log('Test Prisma client disconnected.');
// }); 