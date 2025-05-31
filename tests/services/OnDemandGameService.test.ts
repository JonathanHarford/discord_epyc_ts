import { GameConfig, Player, PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OnDemandGameService } from '../../src/services/OnDemandGameService.js';
import { SchedulerService } from '../../src/services/SchedulerService.js';

const prisma = new PrismaClient();

// Mock Discord client
const _mockDiscordClient = {
  channels: {
    fetch: vi.fn()
  }
} as any;

// Mock SchedulerService
const _mockSchedulerService = {
  scheduleJob: vi.fn().mockResolvedValue(true),
  cancelJob: vi.fn().mockResolvedValue(true),
} as unknown as SchedulerService;

describe('OnDemandGameService', () => {
  let onDemandGameService: OnDemandGameService;
  let testPlayer: Player;
  let testGameConfig: GameConfig;
  let testGuildId: string;

  beforeEach(async () => {
    // Clean up any existing test data
    await prisma.$transaction([
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.gameConfig.deleteMany(),
      prisma.player.deleteMany(),
    ]);

    onDemandGameService = new OnDemandGameService(prisma, _mockDiscordClient, _mockSchedulerService);
    testGuildId = `test-guild-${nanoid()}`;

    // Create test player
    testPlayer = await prisma.player.create({
      data: {
        discordUserId: `test-user-${nanoid()}`,
        name: 'Test Player',
      },
    });

    // Create test game config
    testGameConfig = await prisma.gameConfig.create({
      data: {
        turnPattern: 'writing,drawing',
        writingTimeout: '5m',
        drawingTimeout: '20m',
        staleTimeout: '3d',
        minTurns: 6,
        maxTurns: 12,
      },
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.$transaction([
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.gameConfig.deleteMany(),
      prisma.player.deleteMany(),
    ]);
  });

  describe('listGamesByPlayerParticipation', () => {
    it('should categorize games correctly based on player participation', async () => {
      // Create another player for game creation
      const otherPlayer = await prisma.player.create({
        data: {
          discordUserId: `other-user-${nanoid()}`,
          name: 'Other Player',
        },
      });

      // Create game where test player hasn't played
      const gameNotPlayed = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          guildId: testGuildId,
          creatorId: otherPlayer.id,
          configId: testGameConfig.id,
        },
      });

      // Add a turn for the other player (not test player)
      await prisma.turn.create({
        data: {
          gameId: gameNotPlayed.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'COMPLETED',
          playerId: otherPlayer.id,
          textContent: 'Some content',
          completedAt: new Date(),
        },
      });

      // Create game where test player has played (ongoing)
      const gameHasPlayed = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          guildId: testGuildId,
          creatorId: otherPlayer.id,
          configId: testGameConfig.id,
        },
      });

      // Add a turn for the test player
      await prisma.turn.create({
        data: {
          gameId: gameHasPlayed.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'COMPLETED',
          playerId: testPlayer.id,
          textContent: 'Test player content',
          completedAt: new Date(),
        },
      });

      // Create finished game where test player has played
      const gameFinished = await prisma.game.create({
        data: {
          status: 'COMPLETED',
          guildId: testGuildId,
          creatorId: otherPlayer.id,
          configId: testGameConfig.id,
          completedAt: new Date(),
        },
      });

      // Add a turn for the test player in finished game
      await prisma.turn.create({
        data: {
          gameId: gameFinished.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'COMPLETED',
          playerId: testPlayer.id,
          textContent: 'Finished game content',
          completedAt: new Date(),
        },
      });

      // Test the categorization
      const result = await onDemandGameService.listGamesByPlayerParticipation(
        testPlayer.discordUserId,
        testGuildId
      );

      expect(result.success).toBe(true);
      expect(result.playerId).toEqual(expect.any(String));
      expect(result.haventPlayed).toHaveLength(1);
      expect(result.haventPlayed![0].id).toBe(gameNotPlayed.id);
      expect(result.havePlayed).toHaveLength(1);
      expect(result.havePlayed![0].id).toBe(gameHasPlayed.id);
      expect(result.finished).toHaveLength(1);
      expect(result.finished![0].id).toBe(gameFinished.id);
    });

    it('should handle player that does not exist yet', async () => {
      const nonExistentDiscordId = `non-existent-${nanoid()}`;

      const result = await onDemandGameService.listGamesByPlayerParticipation(
        nonExistentDiscordId,
        testGuildId
      );

      expect(result.success).toBe(true);
      expect(result.haventPlayed).toHaveLength(0);
      expect(result.havePlayed).toHaveLength(0);
      expect(result.finished).toHaveLength(0);
    });

    it('should only return games from the specified guild', async () => {
      const otherGuildId = `other-guild-${nanoid()}`;
      
      // Create another player for game creation
      const otherPlayer = await prisma.player.create({
        data: {
          discordUserId: `other-user-${nanoid()}`,
          name: 'Other Player',
        },
      });

      // Create game in test guild
      const gameInTestGuild = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          guildId: testGuildId,
          creatorId: otherPlayer.id,
          configId: testGameConfig.id,
        },
      });

      // Create game in other guild
      await prisma.game.create({
        data: {
          status: 'ACTIVE',
          guildId: otherGuildId,
          creatorId: otherPlayer.id,
          configId: testGameConfig.id,
        },
      });

      const result = await onDemandGameService.listGamesByPlayerParticipation(
        testPlayer.discordUserId,
        testGuildId
      );

      expect(result.success).toBe(true);
      expect(result.haventPlayed).toHaveLength(1);
      expect(result.haventPlayed![0].id).toBe(gameInTestGuild.id);
    });

    it('should include all finished games regardless of player participation', async () => {
      // Create another player for game creation
      const otherPlayer = await prisma.player.create({
        data: {
          discordUserId: `other-user-${nanoid()}`,
          name: 'Other Player',
        },
      });

      // Create finished game where test player has NOT played
      const finishedGameNotPlayed = await prisma.game.create({
        data: {
          status: 'COMPLETED',
          guildId: testGuildId,
          creatorId: otherPlayer.id,
          configId: testGameConfig.id,
          completedAt: new Date(),
        },
      });

      // Add a turn for the other player (not test player)
      await prisma.turn.create({
        data: {
          gameId: finishedGameNotPlayed.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'COMPLETED',
          playerId: otherPlayer.id,
          textContent: 'Other player content',
          completedAt: new Date(),
        },
      });

      // Test that finished games include games the player didn't participate in
      const result = await onDemandGameService.listGamesByPlayerParticipation(
        testPlayer.discordUserId,
        testGuildId
      );

      expect(result.success).toBe(true);
      expect(result.finished).toHaveLength(1);
      expect(result.finished![0].id).toBe(finishedGameNotPlayed.id);
    });
  });
}); 