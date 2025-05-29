import { Game, Player, PrismaClient, Season } from '@prisma/client';
import { nanoid } from 'nanoid';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PlayerTurnService } from '../../src/services/PlayerTurnService.js';

const prisma = new PrismaClient();

describe('PlayerTurnService', () => {
  let playerTurnService: PlayerTurnService;
  let testPlayer: Player;
  let testSeason: Season;
  let testGame: Game;

  beforeEach(async () => {
    // Clean up any existing test data
    await prisma.$transaction([
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.gameConfig.deleteMany(),
      prisma.seasonConfig.deleteMany(),
      prisma.player.deleteMany(),
    ]);

    playerTurnService = new PlayerTurnService(prisma);

    // Create test player
    testPlayer = await prisma.player.create({
      data: {
        discordUserId: `test-user-${nanoid()}`,
        name: 'Test Player',
      },
    });

    // Create test season config
    const seasonConfig = await prisma.seasonConfig.create({
      data: {
        turnPattern: 'writing,drawing',
        claimTimeout: '1d',
        writingTimeout: '1d',
        drawingTimeout: '1d',
        openDuration: '7d',
        minPlayers: 2,
        maxPlayers: 10,
      },
    });

    // Create test season
    testSeason = await prisma.season.create({
      data: {
        status: 'ACTIVE',
        configId: seasonConfig.id,
        creatorId: testPlayer.id,
      },
    });

    // Create test game
    testGame = await prisma.game.create({
      data: {
        status: 'ACTIVE',
        seasonId: testSeason.id,
      },
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.$transaction([
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.gameConfig.deleteMany(),
      prisma.seasonConfig.deleteMany(),
      prisma.player.deleteMany(),
    ]);
  });

  describe('checkPlayerPendingTurns', () => {
    it('should return false when player has no pending turns', async () => {
      const result = await playerTurnService.checkPlayerPendingTurns(testPlayer.discordUserId);
      
      expect(result.hasPendingTurn).toBe(false);
      expect(result.pendingTurn).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('should return false when player does not exist', async () => {
      const result = await playerTurnService.checkPlayerPendingTurns('non-existent-user');
      
      expect(result.hasPendingTurn).toBe(false);
      expect(result.pendingTurn).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('should return true when player has a PENDING turn', async () => {
      // Create a pending turn for the player
      const pendingTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayer.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'PENDING',
          claimedAt: new Date(),
        },
      });

      const result = await playerTurnService.checkPlayerPendingTurns(testPlayer.discordUserId);
      
      expect(result.hasPendingTurn).toBe(true);
      expect(result.pendingTurn).toBeDefined();
      expect(result.pendingTurn?.id).toBe(pendingTurn.id);
      expect(result.pendingTurn?.status).toBe('PENDING');
      expect(result.error).toBeUndefined();
    });

    it('should return true when player has an OFFERED turn', async () => {
      // Create an offered turn for the player
      const offeredTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayer.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'OFFERED',
          offeredAt: new Date(),
        },
      });

      const result = await playerTurnService.checkPlayerPendingTurns(testPlayer.discordUserId);
      
      expect(result.hasPendingTurn).toBe(true);
      expect(result.pendingTurn).toBeDefined();
      expect(result.pendingTurn?.id).toBe(offeredTurn.id);
      expect(result.pendingTurn?.status).toBe('OFFERED');
      expect(result.error).toBeUndefined();
    });

    it('should return false when player only has COMPLETED turns', async () => {
      // Create a completed turn for the player
      await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayer.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'COMPLETED',
          completedAt: new Date(),
          textContent: 'Test content',
        },
      });

      const result = await playerTurnService.checkPlayerPendingTurns(testPlayer.discordUserId);
      
      expect(result.hasPendingTurn).toBe(false);
      expect(result.pendingTurn).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('should include game details with season information', async () => {
      // Create a pending turn for the player
      await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayer.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'PENDING',
          claimedAt: new Date(),
        },
      });

      const result = await playerTurnService.checkPlayerPendingTurns(testPlayer.discordUserId);
      
      expect(result.hasPendingTurn).toBe(true);
      expect(result.pendingTurn?.game).toBeDefined();
      expect(result.pendingTurn?.game.id).toBe(testGame.id);
      expect(result.pendingTurn?.game.season).toBeDefined();
      expect(result.pendingTurn?.game.season?.id).toBe(testSeason.id);
    });

    it('should work with on-demand games (no season)', async () => {
      // Create game config for on-demand game
      const gameConfig = await prisma.gameConfig.create({
        data: {
          turnPattern: 'writing,drawing',
          writingTimeout: '5m',
          drawingTimeout: '20m',
          staleTimeout: '3d',
          minTurns: 6,
        },
      });

      // Create on-demand game (no season)
      const onDemandGame = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          creatorId: testPlayer.id,
          configId: gameConfig.id,
          guildId: 'test-guild',
        },
      });

      // Create a pending turn for the player in the on-demand game
      await prisma.turn.create({
        data: {
          gameId: onDemandGame.id,
          playerId: testPlayer.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'PENDING',
          claimedAt: new Date(),
        },
      });

      const result = await playerTurnService.checkPlayerPendingTurns(testPlayer.discordUserId);
      
      expect(result.hasPendingTurn).toBe(true);
      expect(result.pendingTurn?.game).toBeDefined();
      expect(result.pendingTurn?.game.id).toBe(onDemandGame.id);
      expect(result.pendingTurn?.game.season).toBeNull();
      expect(result.pendingTurn?.game.creator).toBeDefined();
      expect(result.pendingTurn?.game.creator?.name).toBe(testPlayer.name);
    });

    it('should return the oldest pending turn when multiple exist', async () => {
      const now = new Date();
      const olderDate = new Date(now.getTime() - 60000); // 1 minute ago

      // Create two pending turns with different creation times
      const olderTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayer.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'PENDING',
          claimedAt: olderDate,
          createdAt: olderDate,
        },
      });

      await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayer.id,
          turnNumber: 2,
          type: 'DRAWING',
          status: 'PENDING',
          claimedAt: now,
          createdAt: now,
        },
      });

      const result = await playerTurnService.checkPlayerPendingTurns(testPlayer.discordUserId);
      
      expect(result.hasPendingTurn).toBe(true);
      expect(result.pendingTurn?.id).toBe(olderTurn.id);
    });

    it('should provide proper game information for command error messages', async () => {
      // Create a pending turn for the player
      await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayer.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'PENDING',
          claimedAt: new Date(),
        },
      });

      const result = await playerTurnService.checkPlayerPendingTurns(testPlayer.discordUserId);
      
      expect(result.hasPendingTurn).toBe(true);
      expect(result.pendingTurn).toBeDefined();
      
      // Verify the structure needed for command error messages
      const turn = result.pendingTurn!;
      expect(turn.game).toBeDefined();
      expect(turn.game.season).toBeDefined();
      expect(turn.game.season?.id).toBe(testSeason.id);
      
      // Test the logic that would be used in commands
      const gameType = turn.game.season ? 'seasonal' : 'on-demand';
      const gameIdentifier = turn.game.season 
        ? `Season ${turn.game.season.id}` 
        : `Game #${turn.game.id}`;
      
      expect(gameType).toBe('seasonal');
      expect(gameIdentifier).toBe(`Season ${testSeason.id}`);
    });
  });

  describe('getPlayerPendingTurns', () => {
    it('should return empty array when player has no pending turns', async () => {
      const result = await playerTurnService.getPlayerPendingTurns(testPlayer.discordUserId);
      
      expect(result.pendingTurns).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it('should return all pending and offered turns', async () => {
      // Create multiple turns with different statuses
      const pendingTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayer.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'PENDING',
          claimedAt: new Date(),
        },
      });

      const offeredTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayer.id,
          turnNumber: 2,
          type: 'DRAWING',
          status: 'OFFERED',
          offeredAt: new Date(),
        },
      });

      // Create a completed turn (should not be included)
      await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayer.id,
          turnNumber: 3,
          type: 'WRITING',
          status: 'COMPLETED',
          completedAt: new Date(),
          textContent: 'Test content',
        },
      });

      const result = await playerTurnService.getPlayerPendingTurns(testPlayer.discordUserId);
      
      expect(result.pendingTurns).toHaveLength(2);
      expect(result.pendingTurns.map(t => t.id)).toContain(pendingTurn.id);
      expect(result.pendingTurns.map(t => t.id)).toContain(offeredTurn.id);
      expect(result.error).toBeUndefined();
    });
  });
}); 