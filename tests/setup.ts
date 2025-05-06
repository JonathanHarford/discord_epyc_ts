import { vi } from 'vitest';

// Mock dotenv/config
vi.mock('dotenv/config', () => {
  return {};
});

// Mock any required configuration that would normally be loaded from .env
process.env.NODE_ENV = 'test';
process.env.DISCORD_TOKEN = 'test-token';
process.env.CLIENT_ID = 'test-client-id';
process.env.GUILD_ID = 'test-guild-id'; 