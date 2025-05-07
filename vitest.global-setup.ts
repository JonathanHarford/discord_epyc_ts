import { execSync } from 'child_process';

export async function setup() {
  const testDbUrl = process.env.TEST_DATABASE_URL;

  if (!testDbUrl) {
    throw new Error('TEST_DATABASE_URL is not set. Please set TEST_DATABASE_URL.');
  }
  process.env.DATABASE_URL = testDbUrl; // Ensure test DB URL is used for migrations

  console.log("Running test database migrations...");
  try {
    execSync('pnpx prisma migrate deploy --schema=./prisma/schema.prisma', { stdio: 'inherit' });
    console.log("Test database migrations applied successfully.");
  } catch (error) {
    console.error("Failed to apply migrations for test database:", error);
    // It's crucial that setup fails if migrations don't apply
    process.exit(1);
  }
}

export async function teardown() {
  // Optional: Add logic here to potentially clean up resources after all tests
  // For now, we'll rely on individual test resets or database cleanup outside the suite.
} 