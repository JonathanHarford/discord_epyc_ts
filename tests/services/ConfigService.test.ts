import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { PrismaClient, SeasonConfig } from '@prisma/client';
import { ConfigService, ConfigUpdateOptions } from '../../src/services/ConfigService.js';
import { nanoid } from 'nanoid';

describe('ConfigService Unit Tests', () => {
  let prisma: PrismaClient;
  let configService: ConfigService;
  let testGuildId: string;
  let testConfig: SeasonConfig;

  beforeEach(async () => {
    prisma = new PrismaClient();
    configService = new ConfigService(prisma);
    testGuildId = 'test-guild-id-' + nanoid();

    // Clear the database before each test
    await prisma.$transaction([
      prisma.playersOnSeasons.deleteMany(),
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.player.deleteMany(),
      prisma.seasonConfig.deleteMany(),
    ]);

    // Create a test config
    testConfig = await prisma.seasonConfig.create({
      data: {
        id: nanoid(),
        turnPattern: 'writing,drawing,writing',
        claimTimeout: '24h',
        writingTimeout: '48h',
        writingWarning: '12h',
        drawingTimeout: '24h',
        drawingWarning: '6h',
        openDuration: '7d',
        minPlayers: 6,
        maxPlayers: 20,
        isGuildDefaultFor: testGuildId
      }
    });
  });

  afterAll(async () => {
    // Clean up after all tests
    await prisma.$transaction([
      prisma.playersOnSeasons.deleteMany(),
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.player.deleteMany(),
      prisma.seasonConfig.deleteMany(),
    ]);
    await prisma.$disconnect();
  });

  describe('getGuildDefaultConfig', () => {
    it('should return existing guild default config', async () => {
      const result = await configService.getGuildDefaultConfig(testGuildId);

      expect(result).toBeDefined();
      expect(result.id).toBe(testConfig.id);
      expect(result.turnPattern).toBe('writing,drawing,writing');
      expect(result.isGuildDefaultFor).toBe(testGuildId);
    });

    it('should create new guild default config if none exists', async () => {
      const newGuildId = 'new-guild-id-' + nanoid();
      
      const result = await configService.getGuildDefaultConfig(newGuildId);

      expect(result).toBeDefined();
      expect(result.isGuildDefaultFor).toBe(newGuildId);
      expect(result.turnPattern).toBe('writing,drawing'); // Default value
      expect(result.minPlayers).toBe(6); // Default value
      expect(result.maxPlayers).toBe(20); // Default value

      // Verify it was created in the database
      const dbConfig = await prisma.seasonConfig.findFirst({
        where: { isGuildDefaultFor: newGuildId }
      });
      expect(dbConfig).toBeDefined();
      expect(dbConfig?.id).toBe(result.id);
    });

    it('should handle database errors gracefully', async () => {
      const mockPrisma = {
        seasonConfig: {
          findUnique: vi.fn().mockRejectedValue(new Error('Database error'))
        }
      } as any;

      const mockConfigService = new ConfigService(mockPrisma);

      await expect(
        mockConfigService.getGuildDefaultConfig(testGuildId)
      ).rejects.toThrow('Database error');
    });
  });

  describe('updateGuildDefaultConfig', () => {
    it('should successfully update guild config with valid data', async () => {
      const updates: ConfigUpdateOptions = {
        turnPattern: 'writing,drawing,writing',
        minPlayers: 4,
        maxPlayers: 10,
        claimTimeout: '12h'
      };

      const result = await configService.updateGuildDefaultConfig(testGuildId, updates);

      expect(result).toBeDefined();
      expect(result.type).toBe('success');
      expect(result.key).toBe('messages.config.updateSuccess');

      // Verify the update in the database
      const updatedConfig = await prisma.seasonConfig.findFirst({
        where: { isGuildDefaultFor: testGuildId }
      });
      expect(updatedConfig?.turnPattern).toBe('writing,drawing,writing');
      expect(updatedConfig?.minPlayers).toBe(4);
      expect(updatedConfig?.maxPlayers).toBe(10);
      expect(updatedConfig?.claimTimeout).toBe('12h');
    });

    it('should return validation error for invalid turn pattern', async () => {
      const updates: ConfigUpdateOptions = {
        turnPattern: 'INVALID'
      };

      const result = await configService.updateGuildDefaultConfig(testGuildId, updates);

      expect(result.type).toBe('error');
      expect(result.key).toBe('messages.config.validationError');
      expect(result.data).toBeDefined();
      expect(result.data!.error).toContain('Must be comma-separated list of "writing" and "drawing"');
    });

    it('should return validation error for invalid min/max players', async () => {
      const updates: ConfigUpdateOptions = {
        minPlayers: 10,
        maxPlayers: 5
      };

      const result = await configService.updateGuildDefaultConfig(testGuildId, updates);

      expect(result.type).toBe('error');
      expect(result.key).toBe('messages.config.validationError');
      expect(result.data).toBeDefined();
      expect(result.data!.error).toContain('Must be less than or equal to maxPlayers');
    });

    it('should return validation error for invalid duration strings', async () => {
      const updates: ConfigUpdateOptions = {
        claimTimeout: 'invalid-duration'
      };

      const result = await configService.updateGuildDefaultConfig(testGuildId, updates);

      expect(result.type).toBe('error');
      expect(result.key).toBe('messages.config.validationError');
      expect(result.data).toBeDefined();
      expect(result.data!.error).toContain('Invalid duration format');
    });

    it('should handle database errors gracefully', async () => {
      const mockPrisma = {
        seasonConfig: {
          findUnique: vi.fn().mockResolvedValue(testConfig),
          update: vi.fn().mockRejectedValue(new Error('Database error'))
        }
      } as any;

      const mockConfigService = new ConfigService(mockPrisma);
      const updates: ConfigUpdateOptions = { minPlayers: 4 };

      const result = await mockConfigService.updateGuildDefaultConfig(testGuildId, updates);

      expect(result.type).toBe('error');
      expect(result.key).toBe('messages.config.unknownError');
    });

    it('should create config if guild has no default config', async () => {
      const newGuildId = 'new-guild-id-' + nanoid();
      const updates: ConfigUpdateOptions = {
        minPlayers: 5,
        maxPlayers: 12
      };

      const result = await configService.updateGuildDefaultConfig(newGuildId, updates);

      expect(result.type).toBe('success');
      expect(result.key).toBe('messages.config.updateSuccess');

      // Verify the config was created with updates
      const newConfig = await prisma.seasonConfig.findFirst({
        where: { isGuildDefaultFor: newGuildId }
      });
      expect(newConfig?.minPlayers).toBe(5);
      expect(newConfig?.maxPlayers).toBe(12);
    });
  });

    it('should return validation error for min players out of range', async () => {
      const updates: ConfigUpdateOptions = {
        minPlayers: 0
      };

      const result = await configService.updateGuildDefaultConfig(testGuildId, updates);

      expect(result.type).toBe('error');
      expect(result.key).toBe('messages.config.validationError');
      expect(result.data).toBeDefined();
      expect(result.data!.error).toContain('Must be at least 1');
    });

    it('should return validation error for max players out of range', async () => {
      const updates: ConfigUpdateOptions = {
        maxPlayers: 101
      };

      const result = await configService.updateGuildDefaultConfig(testGuildId, updates);

      expect(result.type).toBe('error');
      expect(result.key).toBe('messages.config.validationError');
      expect(result.data).toBeDefined();
      expect(result.data!.error).toContain('Must be 100 or less');
    });

    it('should accept valid turn patterns', async () => {
      const updates: ConfigUpdateOptions = {
        turnPattern: 'writing,drawing,writing'
      };

      const result = await configService.updateGuildDefaultConfig(testGuildId, updates);

      expect(result.type).toBe('success');
      expect(result.key).toBe('messages.config.updateSuccess');
    });

    it('should accept valid duration strings', async () => {
      const updates: ConfigUpdateOptions = {
        claimTimeout: '24h',
        writingTimeout: '2d',
        openDuration: '30m'
      };

      const result = await configService.updateGuildDefaultConfig(testGuildId, updates);

      expect(result.type).toBe('success');
      expect(result.key).toBe('messages.config.updateSuccess');
    });

  describe('formatConfigForDisplay', () => {
    it('should format config data for display', () => {
      const result = configService.formatConfigForDisplay(testConfig);

      expect(result).toBeDefined();
      expect(result.turnPattern).toBe('writing,drawing,writing');
      expect(result.claimTimeout).toBe('24h');
      expect(result.writingTimeout).toBe('48h');
      expect(result.writingWarning).toBe('12h');
      expect(result.drawingTimeout).toBe('24h');
      expect(result.drawingWarning).toBe('6h');
      expect(result.openDuration).toBe('7d');
      expect(result.minPlayers).toBe(6);
      expect(result.maxPlayers).toBe(20);
      expect(result.isGuildDefault).toBe('Yes');
      expect(result.lastUpdated).toBe(testConfig.updatedAt.toISOString());
    });

    it('should handle config without guild default', () => {
      const configWithoutGuildDefault = {
        ...testConfig,
        isGuildDefaultFor: null
      };

      const result = configService.formatConfigForDisplay(configWithoutGuildDefault);
      expect(result.isGuildDefault).toBe('No');
    });

    it('should handle recent updates', () => {
      const recentConfig = {
        ...testConfig,
        updatedAt: new Date()
      };

      const result = configService.formatConfigForDisplay(recentConfig);
      expect(result.lastUpdated).toBe(recentConfig.updatedAt.toISOString());
    });
  });
}); 