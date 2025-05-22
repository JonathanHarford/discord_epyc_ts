import { PrismaClient, Game, Player, Turn, Season, SeasonConfig } from '@prisma/client';
import { Client as DiscordClient } from 'discord.js';
import { TurnService } from '../../src/services/TurnService.js';
import { nanoid } from 'nanoid';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// Use a separate Prisma client for tests to manage lifecycle
const prisma = new PrismaClient();

describe('TurnService Integration Tests', () => {
  let turnService: TurnService;
  let mockDiscordClient: any;
  let testPlayer: Player;
  let testGame: Game;
  let testSeason: Season;
  let testSeasonConfig: SeasonConfig;

  // Clear the database before each test
  beforeEach(async () => {
    await prisma.$transaction([
      // Corrected order for foreign key constraints
      prisma.playersOnSeasons.deleteMany(),
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.player.deleteMany(),
      prisma.seasonConfig.deleteMany(),
    ]);

    // Create a mock Discord client
    mockDiscordClient = {
      users: {
        fetch: vi.fn().mockImplementation((userId) => {
          return Promise.resolve({
            id: userId,
            send: vi.fn().mockResolvedValue({}),
          });
        }),
      },
    };

    // Create actual TurnService
    turnService = new TurnService(prisma, mockDiscordClient as unknown as DiscordClient);

    // Create test data
    testPlayer = await prisma.player.create({
      data: {
        discordUserId: `test-player-${nanoid()}`,
        name: 'Test Player',
      },
    });

    testSeasonConfig = await prisma.seasonConfig.create({
      data: {
        maxPlayers: 5,
        minPlayers: 2,
        openDuration: '1d',
        turnPattern: 'writing,drawing',
      },
    });

    testSeason = await prisma.season.create({
      data: {
        status: 'ACTIVE',
        creatorId: testPlayer.id,
        configId: testSeasonConfig.id,
      },
    });

    testGame = await prisma.game.create({
      data: {
        status: 'ACTIVE',
        seasonId: testSeason.id,
      },
    });
  });

  // Disconnect Prisma client after all tests
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('offerInitialTurn', () => {
    it('should create and offer initial turn successfully', async () => {
      // Act
      const result = await turnService.offerInitialTurn(testGame, testPlayer, testSeason.id);

      // Assert
      expect(result.success).toBe(true);
      expect(result.turn).toBeDefined();
      expect(result.turn?.status).toBe('OFFERED');
      expect(result.turn?.type).toBe('WRITING');
      expect(result.turn?.turnNumber).toBe(1);
      expect(result.turn?.gameId).toBe(testGame.id);
      expect(result.turn?.playerId).toBe(testPlayer.id);

      // Verify in database
      const turnInDb = await prisma.turn.findUnique({
        where: { id: result.turn!.id },
        include: { player: true, game: true },
      });
      expect(turnInDb).not.toBeNull();
      expect(turnInDb!.status).toBe('OFFERED');
      expect(turnInDb!.offeredAt).not.toBeNull();

      // Verify Discord DM was sent
      expect(mockDiscordClient.users.fetch).toHaveBeenCalledWith(testPlayer.discordUserId);
    });

    it('should handle Discord user fetch failure gracefully', async () => {
      // Arrange
      mockDiscordClient.users.fetch.mockRejectedValue(new Error('User not found'));

      // Act
      const result = await turnService.offerInitialTurn(testGame, testPlayer, testSeason.id);

      // Assert
      expect(result.success).toBe(true); // Should still succeed even if DM fails
      expect(result.turn).toBeDefined();
      expect(result.turn?.status).toBe('OFFERED');

      // Verify turn was still created in database
      const turnInDb = await prisma.turn.findUnique({
        where: { id: result.turn!.id },
      });
      expect(turnInDb).not.toBeNull();
    });
  });

  describe('claimTurn', () => {
    let offeredTurn: Turn;

    beforeEach(async () => {
      // Create an offered turn for testing
      offeredTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayer.id,
          turnNumber: 1,
          status: 'OFFERED',
          type: 'WRITING',
          offeredAt: new Date(),
        },
      });
    });

    it('should claim offered turn successfully', async () => {
      // Act
      const result = await turnService.claimTurn(offeredTurn.id, testPlayer.id);

      // Assert
      expect(result.success).toBe(true);
      expect(result.turn).toBeDefined();
      expect(result.turn?.status).toBe('PENDING');
      expect(result.turn?.claimedAt).not.toBeNull();

      // Verify in database
      const turnInDb = await prisma.turn.findUnique({
        where: { id: offeredTurn.id },
      });
      expect(turnInDb!.status).toBe('PENDING');
      expect(turnInDb!.claimedAt).not.toBeNull();
    });

    it('should fail when turn not found', async () => {
      // Act
      const result = await turnService.claimTurn('non-existent-turn', testPlayer.id);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Turn not found.');
    });

    it('should fail when turn not in OFFERED state', async () => {
      // Arrange - update turn to PENDING
      await prisma.turn.update({
        where: { id: offeredTurn.id },
        data: { status: 'PENDING' },
      });

      // Act
      const result = await turnService.claimTurn(offeredTurn.id, testPlayer.id);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Turn is not in OFFERED state. Current status: PENDING');
    });

    it('should fail when turn not offered to this player', async () => {
      // Arrange - create another player
      const otherPlayer = await prisma.player.create({
        data: {
          discordUserId: `other-player-${nanoid()}`,
          name: 'Other Player',
        },
      });

      // Act
      const result = await turnService.claimTurn(offeredTurn.id, otherPlayer.id);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Turn is not offered to this player.');
    });
  });

  describe('submitTurn', () => {
    let pendingTurn: Turn;

    beforeEach(async () => {
      // Create a pending turn for testing
      pendingTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayer.id,
          turnNumber: 1,
          status: 'PENDING',
          type: 'WRITING',
          offeredAt: new Date(),
          claimedAt: new Date(),
        },
      });
    });

    it('should submit text content successfully', async () => {
      // Act
      const result = await turnService.submitTurn(
        pendingTurn.id,
        testPlayer.id,
        'Test story content',
        'text'
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.turn).toBeDefined();
      expect(result.turn?.status).toBe('COMPLETED');
      expect(result.turn?.textContent).toBe('Test story content');
      expect(result.turn?.completedAt).not.toBeNull();

      // Verify in database
      const turnInDb = await prisma.turn.findUnique({
        where: { id: pendingTurn.id },
      });
      expect(turnInDb!.status).toBe('COMPLETED');
      expect(turnInDb!.textContent).toBe('Test story content');
      expect(turnInDb!.completedAt).not.toBeNull();
    });

    it('should submit image content successfully', async () => {
      // Act
      const result = await turnService.submitTurn(
        pendingTurn.id,
        testPlayer.id,
        'https://example.com/image.jpg',
        'image'
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.turn).toBeDefined();
      expect(result.turn?.status).toBe('COMPLETED');
      expect(result.turn?.imageUrl).toBe('https://example.com/image.jpg');
      expect(result.turn?.completedAt).not.toBeNull();

      // Verify in database
      const turnInDb = await prisma.turn.findUnique({
        where: { id: pendingTurn.id },
      });
      expect(turnInDb!.status).toBe('COMPLETED');
      expect(turnInDb!.imageUrl).toBe('https://example.com/image.jpg');
      expect(turnInDb!.completedAt).not.toBeNull();
    });

    it('should fail when turn not in PENDING state', async () => {
      // Arrange - update turn to OFFERED
      await prisma.turn.update({
        where: { id: pendingTurn.id },
        data: { status: 'OFFERED' },
      });

      // Act
      const result = await turnService.submitTurn(
        pendingTurn.id,
        testPlayer.id,
        'Test content',
        'text'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Turn is not in PENDING state. Current status: OFFERED');
    });

    it('should fail when turn belongs to different player', async () => {
      // Arrange - create another player
      const otherPlayer = await prisma.player.create({
        data: {
          discordUserId: `other-player-${nanoid()}`,
          name: 'Other Player',
        },
      });

      // Act
      const result = await turnService.submitTurn(
        pendingTurn.id,
        otherPlayer.id,
        'Test content',
        'text'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Turn does not belong to this player.');
    });
  });

  describe('dismissOffer', () => {
    let offeredTurn: Turn;

    beforeEach(async () => {
      // Create an offered turn for testing
      offeredTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayer.id,
          turnNumber: 1,
          status: 'OFFERED',
          type: 'WRITING',
          offeredAt: new Date(),
        },
      });
    });

    it('should dismiss offered turn successfully', async () => {
      // Act
      const result = await turnService.dismissOffer(offeredTurn.id);

      // Assert
      expect(result.success).toBe(true);
      expect(result.turn).toBeDefined();
      expect(result.turn?.status).toBe('AVAILABLE');
      expect(result.turn?.playerId).toBeNull();
      expect(result.turn?.offeredAt).toBeNull();

      // Verify in database
      const turnInDb = await prisma.turn.findUnique({
        where: { id: offeredTurn.id },
      });
      expect(turnInDb!.status).toBe('AVAILABLE');
      expect(turnInDb!.playerId).toBeNull();
      expect(turnInDb!.offeredAt).toBeNull();
    });

    it('should fail when turn not in OFFERED state', async () => {
      // Arrange - update turn to PENDING
      await prisma.turn.update({
        where: { id: offeredTurn.id },
        data: { status: 'PENDING' },
      });

      // Act
      const result = await turnService.dismissOffer(offeredTurn.id);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Turn is not in OFFERED state. Current status: PENDING');
    });
  });

  describe('skipTurn', () => {
    let pendingTurn: Turn;

    beforeEach(async () => {
      // Create a pending turn for testing
      pendingTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayer.id,
          turnNumber: 1,
          status: 'PENDING',
          type: 'WRITING',
          offeredAt: new Date(),
          claimedAt: new Date(),
        },
      });
    });

    it('should skip pending turn successfully', async () => {
      // Act
      const result = await turnService.skipTurn(pendingTurn.id);

      // Assert
      expect(result.success).toBe(true);
      expect(result.turn).toBeDefined();
      expect(result.turn?.status).toBe('SKIPPED');
      expect(result.turn?.skippedAt).not.toBeNull();

      // Verify in database
      const turnInDb = await prisma.turn.findUnique({
        where: { id: pendingTurn.id },
      });
      expect(turnInDb!.status).toBe('SKIPPED');
      expect(turnInDb!.skippedAt).not.toBeNull();
    });

    it('should fail when turn not in PENDING state', async () => {
      // Arrange - update turn to OFFERED
      await prisma.turn.update({
        where: { id: pendingTurn.id },
        data: { status: 'OFFERED' },
      });

      // Act
      const result = await turnService.skipTurn(pendingTurn.id);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Turn is not in PENDING state. Current status: OFFERED');
    });
  });

  describe('offerTurn', () => {
    let availableTurn: Turn;

    beforeEach(async () => {
      // Create an available turn for testing
      availableTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          turnNumber: 1,
          status: 'AVAILABLE',
          type: 'WRITING',
        },
      });
    });

    it('should offer available turn to player successfully', async () => {
      // Act
      const result = await turnService.offerTurn(availableTurn.id, testPlayer.id);

      // Assert
      expect(result.success).toBe(true);
      expect(result.turn).toBeDefined();
      expect(result.turn?.status).toBe('OFFERED');
      expect(result.turn?.playerId).toBe(testPlayer.id);
      expect(result.turn?.offeredAt).not.toBeNull();

      // Verify in database
      const turnInDb = await prisma.turn.findUnique({
        where: { id: availableTurn.id },
      });
      expect(turnInDb!.status).toBe('OFFERED');
      expect(turnInDb!.playerId).toBe(testPlayer.id);
      expect(turnInDb!.offeredAt).not.toBeNull();
    });

    it('should fail when turn not in AVAILABLE state', async () => {
      // Arrange - update turn to OFFERED
      await prisma.turn.update({
        where: { id: availableTurn.id },
        data: { status: 'OFFERED', playerId: testPlayer.id },
      });

      // Act
      const result = await turnService.offerTurn(availableTurn.id, testPlayer.id);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Turn is not in AVAILABLE state. Current status: OFFERED');
    });

    it('should fail when player not found', async () => {
      // Act
      const result = await turnService.offerTurn(availableTurn.id, 'non-existent-player');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Player not found.');
    });
  });

  describe('updateTurnStatus', () => {
    let testTurn: Turn;

    beforeEach(async () => {
      // Create a turn for testing
      testTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          turnNumber: 1,
          status: 'AVAILABLE',
          type: 'WRITING',
        },
      });
    });

    it('should update status with valid transition', async () => {
      // Act
      const result = await turnService.updateTurnStatus(testTurn.id, 'OFFERED');

      // Assert
      expect(result.success).toBe(true);
      expect(result.turn).toBeDefined();
      expect(result.turn?.status).toBe('OFFERED');

      // Verify in database
      const turnInDb = await prisma.turn.findUnique({
        where: { id: testTurn.id },
      });
      expect(turnInDb!.status).toBe('OFFERED');
    });

    it('should fail with invalid state transition', async () => {
      // Arrange - update turn to COMPLETED (terminal state)
      await prisma.turn.update({
        where: { id: testTurn.id },
        data: { status: 'COMPLETED' },
      });

      // Act
      const result = await turnService.updateTurnStatus(testTurn.id, 'PENDING');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid state transition from COMPLETED to PENDING');

      // Verify database unchanged
      const turnInDb = await prisma.turn.findUnique({
        where: { id: testTurn.id },
      });
      expect(turnInDb!.status).toBe('COMPLETED'); // Should remain unchanged
    });

    it('should update with additional data', async () => {
      // Arrange - set turn to PENDING first
      await prisma.turn.update({
        where: { id: testTurn.id },
        data: { status: 'PENDING' },
      });

      // Act
      const result = await turnService.updateTurnStatus(testTurn.id, 'COMPLETED', {
        textContent: 'Test content',
        completedAt: new Date(),
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.turn).toBeDefined();
      expect(result.turn?.status).toBe('COMPLETED');
      expect(result.turn?.textContent).toBe('Test content');

      // Verify in database
      const turnInDb = await prisma.turn.findUnique({
        where: { id: testTurn.id },
      });
      expect(turnInDb!.status).toBe('COMPLETED');
      expect(turnInDb!.textContent).toBe('Test content');
      expect(turnInDb!.completedAt).not.toBeNull();
    });
  });

  describe('State Transition Validation', () => {
    const testCases = [
      { from: 'AVAILABLE', to: 'OFFERED', valid: true },
      { from: 'AVAILABLE', to: 'PENDING', valid: false },
      { from: 'OFFERED', to: 'PENDING', valid: true },
      { from: 'OFFERED', to: 'AVAILABLE', valid: true },
      { from: 'OFFERED', to: 'COMPLETED', valid: false },
      { from: 'PENDING', to: 'COMPLETED', valid: true },
      { from: 'PENDING', to: 'SKIPPED', valid: true },
      { from: 'PENDING', to: 'OFFERED', valid: false },
      { from: 'COMPLETED', to: 'PENDING', valid: false },
      { from: 'SKIPPED', to: 'PENDING', valid: false },
    ];

    testCases.forEach(({ from, to, valid }) => {
      it(`should ${valid ? 'allow' : 'reject'} transition from ${from} to ${to}`, async () => {
        // Arrange - create turn in initial state
        const turn = await prisma.turn.create({
          data: {
            gameId: testGame.id,
            turnNumber: 1,
            status: from,
            type: 'WRITING',
          },
        });

        // Act
        const result = await turnService.updateTurnStatus(turn.id, to);

        // Assert
        if (valid) {
          expect(result.success).toBe(true);
          expect(result.turn?.status).toBe(to);

          // Verify in database
          const turnInDb = await prisma.turn.findUnique({
            where: { id: turn.id },
          });
          expect(turnInDb!.status).toBe(to);
        } else {
          expect(result.success).toBe(false);
          expect(result.error).toBe(`Invalid state transition from ${from} to ${to}`);

          // Verify database unchanged
          const turnInDb = await prisma.turn.findUnique({
            where: { id: turn.id },
          });
          expect(turnInDb!.status).toBe(from);
        }
      });
    });
  });

  describe('Query Methods', () => {
    let turn1: Turn;
    let turn2: Turn;
    let otherPlayer: Player;
    let otherGame: Game;

    beforeEach(async () => {
      // Create additional test data
      otherPlayer = await prisma.player.create({
        data: {
          discordUserId: `other-player-${nanoid()}`,
          name: 'Other Player',
        },
      });

      otherGame = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: testSeason.id,
        },
      });

      // Create test turns
      turn1 = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayer.id,
          turnNumber: 1,
          status: 'COMPLETED',
          type: 'WRITING',
          textContent: 'First turn content',
        },
      });

      turn2 = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: otherPlayer.id,
          turnNumber: 2,
          status: 'PENDING',
          type: 'DRAWING',
        },
      });
    });

         describe('getTurn', () => {
       it('should return turn with full details', async () => {
         // Act
         const result = await turnService.getTurn(turn1.id);

         // Assert
         expect(result).not.toBeNull();
         expect(result!.id).toBe(turn1.id);
         expect((result as any).player).toBeDefined();
         expect((result as any).player!.id).toBe(testPlayer.id);
         expect((result as any).game).toBeDefined();
         expect((result as any).game.id).toBe(testGame.id);
         expect((result as any).game.season).toBeDefined();
         expect((result as any).game.season.id).toBe(testSeason.id);
       });

      it('should return null when turn not found', async () => {
        // Act
        const result = await turnService.getTurn('non-existent-turn');

        // Assert
        expect(result).toBeNull();
      });
    });

    describe('getTurnsForGame', () => {
      it('should return turns for game ordered by turn number', async () => {
        // Act
        const result = await turnService.getTurnsForGame(testGame.id);

        // Assert
        expect(result).toHaveLength(2);
        expect(result[0].turnNumber).toBe(1);
        expect(result[1].turnNumber).toBe(2);
        expect(result[0].id).toBe(turn1.id);
        expect(result[1].id).toBe(turn2.id);
      });

      it('should filter by status when provided', async () => {
        // Act
        const result = await turnService.getTurnsForGame(testGame.id, 'PENDING');

        // Assert
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(turn2.id);
        expect(result[0].status).toBe('PENDING');
      });

      it('should return empty array for non-existent game', async () => {
        // Act
        const result = await turnService.getTurnsForGame('non-existent-game');

        // Assert
        expect(result).toHaveLength(0);
      });
    });

         describe('getTurnsForPlayer', () => {
       it('should return turns for player ordered by creation date', async () => {
         // Act
         const result = await turnService.getTurnsForPlayer(testPlayer.id);

         // Assert
         expect(result).toHaveLength(1);
         expect(result[0].id).toBe(turn1.id);
         expect((result[0] as any).player).toBeDefined();
         expect((result[0] as any).player!.id).toBe(testPlayer.id);
       });

      it('should filter by status when provided', async () => {
        // Act
        const result = await turnService.getTurnsForPlayer(testPlayer.id, 'COMPLETED');

        // Assert
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(turn1.id);
        expect(result[0].status).toBe('COMPLETED');
      });

      it('should return empty array for non-existent player', async () => {
        // Act
        const result = await turnService.getTurnsForPlayer('non-existent-player');

        // Assert
        expect(result).toHaveLength(0);
      });
    });
  });

  describe('Complex State Transition Scenarios', () => {
    it('should handle complete turn lifecycle', async () => {
      // 1. Offer initial turn
      const offerResult = await turnService.offerInitialTurn(testGame, testPlayer, testSeason.id);
      expect(offerResult.success).toBe(true);
      const turnId = offerResult.turn!.id;

      // 2. Claim the turn
      const claimResult = await turnService.claimTurn(turnId, testPlayer.id);
      expect(claimResult.success).toBe(true);
      expect(claimResult.turn!.status).toBe('PENDING');

      // 3. Submit the turn
      const submitResult = await turnService.submitTurn(
        turnId,
        testPlayer.id,
        'Complete story',
        'text'
      );
      expect(submitResult.success).toBe(true);
      expect(submitResult.turn!.status).toBe('COMPLETED');

      // Verify final state in database
      const finalTurn = await prisma.turn.findUnique({
        where: { id: turnId },
      });
      expect(finalTurn!.status).toBe('COMPLETED');
      expect(finalTurn!.textContent).toBe('Complete story');
      expect(finalTurn!.offeredAt).not.toBeNull();
      expect(finalTurn!.claimedAt).not.toBeNull();
      expect(finalTurn!.completedAt).not.toBeNull();
    });

    it('should handle turn timeout scenario', async () => {
      // 1. Offer initial turn
      const offerResult = await turnService.offerInitialTurn(testGame, testPlayer, testSeason.id);
      expect(offerResult.success).toBe(true);
      const turnId = offerResult.turn!.id;

      // 2. Claim the turn
      const claimResult = await turnService.claimTurn(turnId, testPlayer.id);
      expect(claimResult.success).toBe(true);

      // 3. Skip the turn (timeout scenario)
      const skipResult = await turnService.skipTurn(turnId);
      expect(skipResult.success).toBe(true);
      expect(skipResult.turn!.status).toBe('SKIPPED');

      // Verify final state in database
      const finalTurn = await prisma.turn.findUnique({
        where: { id: turnId },
      });
      expect(finalTurn!.status).toBe('SKIPPED');
      expect(finalTurn!.skippedAt).not.toBeNull();
    });

    it('should handle offer dismissal scenario', async () => {
      // 1. Offer initial turn
      const offerResult = await turnService.offerInitialTurn(testGame, testPlayer, testSeason.id);
      expect(offerResult.success).toBe(true);
      const turnId = offerResult.turn!.id;

      // 2. Dismiss the offer (claim timeout scenario)
      const dismissResult = await turnService.dismissOffer(turnId);
      expect(dismissResult.success).toBe(true);
      expect(dismissResult.turn!.status).toBe('AVAILABLE');
      expect(dismissResult.turn!.playerId).toBeNull();

      // Verify final state in database
      const finalTurn = await prisma.turn.findUnique({
        where: { id: turnId },
      });
      expect(finalTurn!.status).toBe('AVAILABLE');
      expect(finalTurn!.playerId).toBeNull();
      expect(finalTurn!.offeredAt).toBeNull();
    });
  });
}); 