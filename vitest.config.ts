import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

// Load .env.test for test environment and override any existing env vars
config({ path: '.env.test', override: true });

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        exclude: ['node_modules', 'dist', 'tests/**/*.integration.test.ts'],
        setupFiles: ['./tests/setup.ts'],
    },
});
