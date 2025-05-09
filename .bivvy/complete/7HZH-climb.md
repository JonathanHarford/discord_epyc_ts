<Climb>
  <header>
    <id>7HZH</id>
    <type>feature</type>
    <description>Create integration tests for src/services/game-creation-service.ts</description>
  </header>
  <newDependencies>
    <!-- Vitest is already in use. Prisma is already in use for database interaction. -->
    <!-- Confirm if any specific Vitest plugins or Prisma client extensions might be needed for test setup. -->
  </newDependencies>
  <prerequisiteChanges>
    <!-- Configuration for a separate test database (using TEST_DATABASE_URL from .env) via Prisma. -->
    <!-- Mechanism to run Prisma migrations (e.g., `prisma migrate deploy` or `prisma db push --accept-data-loss` for testing) before tests. -->
    <!-- Mechanism to truncate ALL tables using Prisma (e.g., a custom script or Prisma utility) before/after each test or test suite. -->
  </prerequisiteChanges>
  <relevantFiles>
    - src/services/game-creation-service.ts
    - .env (for TEST_DATABASE_URL)
    - prisma/schema.prisma (for understanding table structures and Prisma client generation)
    - (Potentially existing Vitest configuration files: vitest.config.ts)
    - (Potentially existing Prisma migration files in prisma/migrations/)
  </relevantFiles>
  <everythingElse>
    <requirements>
      - Tests must use a separate database instance configured via `TEST_DATABASE_URL` from the `.env` file, managed by Prisma.
      - Before all tests run (or before each test suite), the test database must be prepared by:
        1. Running all Prisma migrations.
        2. Truncating ALL tables to ensure a clean state.
      - Tests should be written using Vitest.
      - Tests should cover the `createGame` method in `GameCreationService`.
      - Test cases should include:
        - Successful game creation with default settings.
        - Successful game creation with valid custom settings.
        - Attempted game creation when the server is not set up in the database.
        - Attempted game creation when default server game settings are not configured in the database.
        - Attempted game creation with invalid custom settings (e.g., `maxTurns` < `minTurns`, invalid duration strings, invalid turn patterns).
        - Verification that `ensurePlayer` is called and a player record is created if it doesn't exist.
        - Verification that game and custom settings (if any) are correctly stored in the database.
    </requirements>
    <testingApproach>
      - Integration tests will be written using Vitest, focusing on the interaction between `GameCreationService` and the Prisma-managed database.
      - Mocks will be avoided where possible; direct database interaction via Prisma is preferred for these tests.
      - A test setup (likely in a global setup file for Vitest, e.g., `vitest.setup.ts`, or a helper module) will:
        - Initialize the Prisma client for the test database (ensuring it uses `TEST_DATABASE_URL`).
        - Run Prisma migrations.
        - Provide a utility function to truncate all tables. This utility will be called before each test suite or test file execution.
      - Each test case will represent a specific scenario for game creation.
    </testingApproach>
    <implementationNotes>
      <!-- Vitest and Prisma are confirmed. All tables will be truncated. -->
      <!-- The following will be determined/implemented during the setup tasks: -->
      - Determine if existing Vitest configuration (`vitest.config.ts`) needs adaptation or if a new one (e.g., `vitest.integration.config.ts`) is better.
      - Establish the method for managing Prisma Client instances for testing, ensuring connection to `TEST_DATABASE_URL` (likely via datasource URL override in a test-specific Prisma Client instantiation).
      - Confirm the exact Prisma command for migrations (e.g., `prisma migrate deploy` or `prisma db push --accept-data-loss`) to be used in the test setup.
      - Develop or identify a script/method for truncating all tables with Prisma. This might involve querying schema metadata (e.g., `sqlite_master` for SQLite or `information_schema.tables` for PostgreSQL) and then using `prisma.$executeRawUnsafe` or a similar Prisma utility for each table.
    </implementationNotes>
  </everythingElse>
</Climb> 