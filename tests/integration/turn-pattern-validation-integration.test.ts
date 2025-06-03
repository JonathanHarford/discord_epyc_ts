import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfigService } from '../../src/services/ConfigService.js';
import { GameConfigService } from '../../src/services/GameConfigService.js';

describe('Turn Pattern Validation Integration Tests', () => {
  let prisma: PrismaClient;
  let configService: ConfigService;
  let gameConfigService: GameConfigService;
  let testGuildId: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    configService = new ConfigService(prisma);
    gameConfigService = new GameConfigService(prisma);
    testGuildId = `test-guild-${nanoid()}`;
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.seasonConfig.deleteMany({
      where: { isGuildDefaultFor: testGuildId }
    });
    await prisma.gameConfig.deleteMany({
      where: { isGuildDefaultFor: testGuildId }
    });
    await prisma.$disconnect();
  });

  describe('Season Config Integration', () => {
    it('should accept valid turn patterns', async () => {
      const validPatterns = [
        'writing,drawing',
        'drawing,writing',
        'writing,drawing,writing',
        'drawing,writing,drawing,writing'
      ];

      for (const pattern of validPatterns) {
        const result = await configService.updateGuildDefaultConfig(testGuildId, {
          turnPattern: pattern
        });

        expect(result.type).toBe('success');
        expect(result.key).toBe('messages.config.updateSuccess');
      }
    });

    it('should reject invalid turn patterns', async () => {
      const invalidPatterns = [
        'invalid',
        'writing,invalid',
        'drawing,invalid,writing',
        'writing,,drawing',
        '',
        'writing,',
        ',drawing'
      ];

      for (const pattern of invalidPatterns) {
        const result = await configService.updateGuildDefaultConfig(testGuildId, {
          turnPattern: pattern
        });

        expect(result.type).toBe('error');
        expect(result.key).toBe('messages.config.validationError');
        expect(result.data?.error).toBeDefined();
      }
    });

    it('should provide specific error messages for different validation failures', async () => {
      // Test invalid turn type
      const invalidTypeResult = await configService.updateGuildDefaultConfig(testGuildId, {
        turnPattern: 'invalid'
      });
      expect(invalidTypeResult.data?.error).toContain('Invalid turn type \'invalid\'');

      // Test empty pattern
      const emptyResult = await configService.updateGuildDefaultConfig(testGuildId, {
        turnPattern: ''
      });
      expect(emptyResult.data?.error).toContain('Turn pattern cannot be empty');

      // Test extra commas
      const extraCommasResult = await configService.updateGuildDefaultConfig(testGuildId, {
        turnPattern: 'writing,,drawing'
      });
      expect(extraCommasResult.data?.error).toContain('Turn pattern contains empty values');
    });
  });

  describe('Game Config Integration', () => {
    it('should accept valid turn patterns', async () => {
      const validPatterns = [
        'writing,drawing',
        'drawing,writing',
        'writing,drawing,writing',
        'drawing,writing,drawing,writing'
      ];

      for (const pattern of validPatterns) {
        const result = await gameConfigService.updateGuildDefaultConfig(testGuildId, {
          turnPattern: pattern
        });

        expect(result.type).toBe('success');
        expect(result.key).toBe('messages.config.updateSuccess');
      }
    });

    it('should reject invalid turn patterns', async () => {
      const invalidPatterns = [
        'invalid',
        'writing,invalid',
        'drawing,invalid,writing',
        'writing,,drawing',
        '',
        'writing,',
        ',drawing'
      ];

      for (const pattern of invalidPatterns) {
        const result = await gameConfigService.updateGuildDefaultConfig(testGuildId, {
          turnPattern: pattern
        });

        expect(result.type).toBe('error');
        expect(result.key).toBe('messages.config.validationError');
        expect(result.data?.error).toBeDefined();
      }
    });

    it('should provide specific error messages for different validation failures', async () => {
      // Test invalid turn type
      const invalidTypeResult = await gameConfigService.updateGuildDefaultConfig(testGuildId, {
        turnPattern: 'invalid'
      });
      expect(invalidTypeResult.data?.error).toContain('Invalid turn type \'invalid\'');

      // Test empty pattern
      const emptyResult = await gameConfigService.updateGuildDefaultConfig(testGuildId, {
        turnPattern: ''
      });
      expect(emptyResult.data?.error).toContain('Turn pattern cannot be empty');

      // Test extra commas
      const extraCommasResult = await gameConfigService.updateGuildDefaultConfig(testGuildId, {
        turnPattern: 'writing,,drawing'
      });
      expect(extraCommasResult.data?.error).toContain('Turn pattern contains empty values');
    });
  });

  describe('Cross-Service Consistency', () => {
    it('should apply the same validation rules across both services', async () => {
      const testPattern = 'invalid,pattern';

      const seasonResult = await configService.updateGuildDefaultConfig(testGuildId, {
        turnPattern: testPattern
      });

      const gameResult = await gameConfigService.updateGuildDefaultConfig(testGuildId, {
        turnPattern: testPattern
      });

      // Both should fail with the same type of error
      expect(seasonResult.type).toBe('error');
      expect(gameResult.type).toBe('error');
      expect(seasonResult.key).toBe(gameResult.key);
    });

    it('should accept the same valid patterns across both services', async () => {
      const testPattern = 'writing,drawing,writing';

      const seasonResult = await configService.updateGuildDefaultConfig(testGuildId, {
        turnPattern: testPattern
      });

      const gameResult = await gameConfigService.updateGuildDefaultConfig(testGuildId, {
        turnPattern: testPattern
      });

      // Both should succeed
      expect(seasonResult.type).toBe('success');
      expect(gameResult.type).toBe('success');
      expect(seasonResult.key).toBe(gameResult.key);
    });
  });
}); 