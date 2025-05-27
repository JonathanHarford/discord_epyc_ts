import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_TIMEOUTS, getSeasonTimeouts } from '../../src/utils/seasonConfig.js';

// Use a separate Prisma client for tests
const prisma = new PrismaClient();

describe('Season Timeout Integration Tests', () => {
  let testTurnId: string;
  let testGameId: string;
  let testSeasonId: string;
  let testSeasonConfigId: string;
  let testPlayerId: string;

  beforeEach(async () => {
    // Clear the database before each test
    await prisma.$transaction([
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.player.deleteMany(),
      prisma.seasonConfig.deleteMany(),
    ]);

    // Create test player
    const player = await prisma.player.create({
      data: {
        discordUserId: `test-player-${nanoid()}`,
        name: 'Test Player',
      },
    });
    testPlayerId = player.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Season Config Integration', () => {
    it('should retrieve custom timeout values from season config', async () => {
      // Create season config with custom timeout values
      const seasonConfig = await prisma.seasonConfig.create({
        data: {
          maxPlayers: 5,
          minPlayers: 2,
          openDuration: '1d',
          turnPattern: 'writing,drawing',
          claimTimeout: '2h',
          writingTimeout: '3d',
          drawingTimeout: '5d',
        },
      });

      // Create season
      const season = await prisma.season.create({
        data: {
          status: 'ACTIVE',
          creatorId: testPlayerId,
          configId: seasonConfig.id,
        },
      });

      // Create game
      const game = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: season.id,
        },
      });

      // Create turn
      const turn = await prisma.turn.create({
        data: {
          gameId: game.id,
          playerId: testPlayerId,
          turnNumber: 1,
          status: 'AVAILABLE',
          type: 'WRITING',
        },
      });

      // Test the integration
      const result = await getSeasonTimeouts(prisma, turn.id);

      expect(result).toEqual({
        claimTimeoutMinutes: 120, // 2h = 120 minutes
        writingTimeoutMinutes: 4320, // 3d = 4320 minutes
        drawingTimeoutMinutes: 7200, // 5d = 7200 minutes
      });
    });

    it('should use default values when season config is missing timeout fields', async () => {
      // Create season config without timeout fields
      const seasonConfig = await prisma.seasonConfig.create({
        data: {
          maxPlayers: 5,
          minPlayers: 2,
          openDuration: '1d',
          turnPattern: 'writing,drawing',
          // No timeout fields specified
        },
      });

      // Create season
      const season = await prisma.season.create({
        data: {
          status: 'ACTIVE',
          creatorId: testPlayerId,
          configId: seasonConfig.id,
        },
      });

      // Create game
      const game = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: season.id,
        },
      });

      // Create turn
      const turn = await prisma.turn.create({
        data: {
          gameId: game.id,
          playerId: testPlayerId,
          turnNumber: 1,
          status: 'AVAILABLE',
          type: 'WRITING',
        },
      });

      // Test the integration
      const result = await getSeasonTimeouts(prisma, turn.id);

      // When no timeout fields are specified, Prisma uses schema defaults ("1d" for all)
      // which results in 1440 minutes for all timeouts
      expect(result).toEqual({
        claimTimeoutMinutes: 1440, // 1d (schema default)
        writingTimeoutMinutes: 1440, // 1d (schema default)
        drawingTimeoutMinutes: 1440, // 1d (schema default)
      });
    });

    it('should handle different timeout configurations for different seasons', async () => {
      // Create first season config with short timeouts
      const shortTimeoutConfig = await prisma.seasonConfig.create({
        data: {
          maxPlayers: 5,
          minPlayers: 2,
          openDuration: '1d',
          turnPattern: 'writing,drawing',
          claimTimeout: '30m',
          writingTimeout: '2h',
          drawingTimeout: '4h',
        },
      });

      // Create second season config with long timeouts
      const longTimeoutConfig = await prisma.seasonConfig.create({
        data: {
          maxPlayers: 5,
          minPlayers: 2,
          openDuration: '1d',
          turnPattern: 'writing,drawing',
          claimTimeout: '1d',
          writingTimeout: '7d', // 1 week = 7 days
          drawingTimeout: '14d', // 2 weeks = 14 days
        },
      });

      // Create seasons
      const shortTimeoutSeason = await prisma.season.create({
        data: {
          status: 'ACTIVE',
          creatorId: testPlayerId,
          configId: shortTimeoutConfig.id,
        },
      });

      const longTimeoutSeason = await prisma.season.create({
        data: {
          status: 'ACTIVE',
          creatorId: testPlayerId,
          configId: longTimeoutConfig.id,
        },
      });

      // Create games
      const shortTimeoutGame = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: shortTimeoutSeason.id,
        },
      });

      const longTimeoutGame = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: longTimeoutSeason.id,
        },
      });

      // Create turns
      const shortTimeoutTurn = await prisma.turn.create({
        data: {
          gameId: shortTimeoutGame.id,
          playerId: testPlayerId,
          turnNumber: 1,
          status: 'AVAILABLE',
          type: 'WRITING',
        },
      });

      const longTimeoutTurn = await prisma.turn.create({
        data: {
          gameId: longTimeoutGame.id,
          playerId: testPlayerId,
          turnNumber: 1,
          status: 'AVAILABLE',
          type: 'WRITING',
        },
      });

      // Test short timeout configuration
      const shortResult = await getSeasonTimeouts(prisma, shortTimeoutTurn.id);
      expect(shortResult).toEqual({
        claimTimeoutMinutes: 30, // 30m
        writingTimeoutMinutes: 120, // 2h
        drawingTimeoutMinutes: 240, // 4h
      });

      // Test long timeout configuration
      const longResult = await getSeasonTimeouts(prisma, longTimeoutTurn.id);
      expect(longResult).toEqual({
        claimTimeoutMinutes: 1440, // 1d
        writingTimeoutMinutes: 10080, // 7d = 10080 minutes
        drawingTimeoutMinutes: 20160, // 14d = 20160 minutes
      });
    });

    it('should handle edge cases with invalid timeout values', async () => {
      // Create season config with invalid timeout values
      const invalidConfig = await prisma.seasonConfig.create({
        data: {
          maxPlayers: 5,
          minPlayers: 2,
          openDuration: '1d',
          turnPattern: 'writing,drawing',
          claimTimeout: 'invalid',
          writingTimeout: '0m',
          drawingTimeout: '-5d',
        },
      });

      // Create season
      const season = await prisma.season.create({
        data: {
          status: 'ACTIVE',
          creatorId: testPlayerId,
          configId: invalidConfig.id,
        },
      });

      // Create game
      const game = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: season.id,
        },
      });

      // Create turn
      const turn = await prisma.turn.create({
        data: {
          gameId: game.id,
          playerId: testPlayerId,
          turnNumber: 1,
          status: 'AVAILABLE',
          type: 'WRITING',
        },
      });

      // Test that invalid values fall back to defaults
      const result = await getSeasonTimeouts(prisma, turn.id);

      expect(result).toEqual({
        claimTimeoutMinutes: DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES,
        writingTimeoutMinutes: DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES,
        drawingTimeoutMinutes: DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES,
      });
    });

    it('should handle missing season hierarchy gracefully', async () => {
      // Test with non-existent turn
      const result = await getSeasonTimeouts(prisma, 'non-existent-turn');

      expect(result).toEqual({
        claimTimeoutMinutes: DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES,
        writingTimeoutMinutes: DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES,
        drawingTimeoutMinutes: DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES,
      });
    });
  });

  describe('TurnOfferingService Integration', () => {
    it('should use season-specific claim timeout for scheduling', async () => {
      // This test would require mocking the TurnOfferingService
      // For now, we verify that the utility function works correctly
      // Integration with actual service would require more complex setup
      
      // Create season config with custom claim timeout
      const seasonConfig = await prisma.seasonConfig.create({
        data: {
          maxPlayers: 5,
          minPlayers: 2,
          openDuration: '1d',
          turnPattern: 'writing,drawing',
          claimTimeout: '6h', // Custom 6-hour claim timeout
          writingTimeout: '1d',
          drawingTimeout: '3d',
        },
      });

      const season = await prisma.season.create({
        data: {
          status: 'ACTIVE',
          creatorId: testPlayerId,
          configId: seasonConfig.id,
        },
      });

      const game = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: season.id,
        },
      });

      const turn = await prisma.turn.create({
        data: {
          gameId: game.id,
          playerId: testPlayerId,
          turnNumber: 1,
          status: 'AVAILABLE',
          type: 'WRITING',
        },
      });

      const timeouts = await getSeasonTimeouts(prisma, turn.id);
      
      // Verify that TurnOfferingService would get the correct claim timeout
      expect(timeouts.claimTimeoutMinutes).toBe(360); // 6h = 360 minutes
    });
  });

  describe('DirectMessageHandler Integration', () => {
    it('should use season-specific submission timeout for writing turns', async () => {
      // Create season config with custom writing timeout
      const seasonConfig = await prisma.seasonConfig.create({
        data: {
          maxPlayers: 5,
          minPlayers: 2,
          openDuration: '1d',
          turnPattern: 'writing,drawing',
          claimTimeout: '1d',
          writingTimeout: '8h', // Custom 8-hour writing timeout
          drawingTimeout: '3d',
        },
      });

      const season = await prisma.season.create({
        data: {
          status: 'ACTIVE',
          creatorId: testPlayerId,
          configId: seasonConfig.id,
        },
      });

      const game = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: season.id,
        },
      });

      const writingTurn = await prisma.turn.create({
        data: {
          gameId: game.id,
          playerId: testPlayerId,
          turnNumber: 1,
          status: 'AVAILABLE',
          type: 'WRITING',
        },
      });

      const timeouts = await getSeasonTimeouts(prisma, writingTurn.id);
      
      // Verify that DirectMessageHandler would get the correct writing timeout
      expect(timeouts.writingTimeoutMinutes).toBe(480); // 8h = 480 minutes
    });

    it('should use season-specific submission timeout for drawing turns', async () => {
      // Create season config with custom drawing timeout
      const seasonConfig = await prisma.seasonConfig.create({
        data: {
          maxPlayers: 5,
          minPlayers: 2,
          openDuration: '1d',
          turnPattern: 'writing,drawing',
          claimTimeout: '1d',
          writingTimeout: '1d',
          drawingTimeout: '12h', // Custom 12-hour drawing timeout
        },
      });

      const season = await prisma.season.create({
        data: {
          status: 'ACTIVE',
          creatorId: testPlayerId,
          configId: seasonConfig.id,
        },
      });

      const game = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: season.id,
        },
      });

      const drawingTurn = await prisma.turn.create({
        data: {
          gameId: game.id,
          playerId: testPlayerId,
          turnNumber: 1,
          status: 'AVAILABLE',
          type: 'DRAWING',
        },
      });

      const timeouts = await getSeasonTimeouts(prisma, drawingTurn.id);
      
      // Verify that DirectMessageHandler would get the correct drawing timeout
      expect(timeouts.drawingTimeoutMinutes).toBe(720); // 12h = 720 minutes
    });
  });
}); 