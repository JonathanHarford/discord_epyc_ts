import { execSync } from 'node:child_process';

// This function is called once before all tests run
export async function setup() {
  console.log('Setting up test database...');
  try {
    // Run prisma migrations on the test database
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('Migrations applied successfully to test database.');
  } catch (error) {
    console.error('Failed to apply migrations to test database:', error);
    process.exit(1);
  }
}

// This function is called once after all tests complete
export async function teardown() {
  // Any cleanup needed after all tests finish
  console.log('Test suite completed.');
} 