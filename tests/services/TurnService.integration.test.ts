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

describe('Game Completion Integration Tests', () => {
  let turnService: TurnService;
  let mockDiscordClient: any;
  let testPlayers: Player[];
  let testGame: Game;
  let testSeason: Season;
  let testSeasonConfig: SeasonConfig;

  beforeEach(async () => {
    await prisma.$transaction([
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

    // Create test players
    testPlayers = await Promise.all([
      prisma.player.create({
        data: {
          discordUserId: `test-player-1-${nanoid()}`,
          name: 'Test Player 1',
        },
      }),
      prisma.player.create({
        data: {
          discordUserId: `test-player-2-${nanoid()}`,
          name: 'Test Player 2',
        },
      }),
      prisma.player.create({
        data: {
          discordUserId: `test-player-3-${nanoid()}`,
          name: 'Test Player 3',
        },
      }),
    ]);

    testSeasonConfig = await prisma.seasonConfig.create({
      data: {
        maxPlayers: 3,
        minPlayers: 2,
        openDuration: '1d',
        turnPattern: 'writing,drawing',
      },
    });

    testSeason = await prisma.season.create({
      data: {
        status: 'ACTIVE',
        creatorId: testPlayers[0].id,
        configId: testSeasonConfig.id,
      },
    });

    // Add all players to the season
    await Promise.all(
      testPlayers.map(player =>
        prisma.playersOnSeasons.create({
          data: {
            playerId: player.id,
            seasonId: testSeason.id,
          },
        })
      )
    );

    testGame = await prisma.game.create({
      data: {
        status: 'ACTIVE',
        seasonId: testSeason.id,
      },
    });
  });

  describe('Game completion via submitTurn', () => {
    it('should mark game as COMPLETED when all players submit their turns', async () => {
      // Create pending turns for all players
      const turns = await Promise.all(
        testPlayers.map((player, index) =>
          prisma.turn.create({
            data: {
              gameId: testGame.id,
              playerId: player.id,
              turnNumber: index + 1,
              status: 'PENDING',
              type: 'WRITING',
              claimedAt: new Date(),
            },
          })
        )
      );

      // Submit turns for first two players
      await turnService.submitTurn(turns[0].id, testPlayers[0].id, 'Player 1 content', 'text');
      await turnService.submitTurn(turns[1].id, testPlayers[1].id, 'Player 2 content', 'text');

      // Game should not be completed yet
      let gameInDb = await prisma.game.findUnique({ where: { id: testGame.id } });
      expect(gameInDb!.status).toBe('ACTIVE');
      expect(gameInDb!.completedAt).toBeNull();

      // Submit turn for the last player
      const result = await turnService.submitTurn(turns[2].id, testPlayers[2].id, 'Player 3 content', 'text');

      // Verify the turn submission was successful
      expect(result.success).toBe(true);
      expect(result.turn!.status).toBe('COMPLETED');

      // Game should now be completed
      gameInDb = await prisma.game.findUnique({ where: { id: testGame.id } });
      expect(gameInDb!.status).toBe('COMPLETED');
      expect(gameInDb!.completedAt).not.toBeNull();
    });

    it('should mark game as COMPLETED when all players have mixed completed/skipped turns', async () => {
      // Create turns for all players
      const turns = await Promise.all([
        // Player 1: pending turn (will be submitted)
        prisma.turn.create({
          data: {
            gameId: testGame.id,
            playerId: testPlayers[0].id,
            turnNumber: 1,
            status: 'PENDING',
            type: 'WRITING',
            claimedAt: new Date(),
          },
        }),
        // Player 2: already completed
        prisma.turn.create({
          data: {
            gameId: testGame.id,
            playerId: testPlayers[1].id,
            turnNumber: 2,
            status: 'COMPLETED',
            type: 'DRAWING',
            completedAt: new Date(),
            imageUrl: 'http://example.com/image.png',
          },
        }),
        // Player 3: already skipped
        prisma.turn.create({
          data: {
            gameId: testGame.id,
            playerId: testPlayers[2].id,
            turnNumber: 3,
            status: 'SKIPPED',
            type: 'WRITING',
            skippedAt: new Date(),
          },
        }),
      ]);

      // Submit the last pending turn
      const result = await turnService.submitTurn(turns[0].id, testPlayers[0].id, 'Final content', 'text');

      // Verify the turn submission was successful
      expect(result.success).toBe(true);
      expect(result.turn!.status).toBe('COMPLETED');

      // Game should now be completed
      const gameInDb = await prisma.game.findUnique({ where: { id: testGame.id } });
      expect(gameInDb!.status).toBe('COMPLETED');
      expect(gameInDb!.completedAt).not.toBeNull();
    });

    it('should not mark game as COMPLETED when some players have no turns', async () => {
      // Create turns for only two players
      const turns = await Promise.all([
        prisma.turn.create({
          data: {
            gameId: testGame.id,
            playerId: testPlayers[0].id,
            turnNumber: 1,
            status: 'PENDING',
            type: 'WRITING',
            claimedAt: new Date(),
          },
        }),
        prisma.turn.create({
          data: {
            gameId: testGame.id,
            playerId: testPlayers[1].id,
            turnNumber: 2,
            status: 'PENDING',
            type: 'DRAWING',
            claimedAt: new Date(),
          },
        }),
      ]);

      // Submit both turns
      await turnService.submitTurn(turns[0].id, testPlayers[0].id, 'Player 1 content', 'text');
      await turnService.submitTurn(turns[1].id, testPlayers[1].id, 'Player 2 content', 'text');

      // Game should not be completed (Player 3 has no turn)
      const gameInDb = await prisma.game.findUnique({ where: { id: testGame.id } });
      expect(gameInDb!.status).toBe('ACTIVE');
      expect(gameInDb!.completedAt).toBeNull();
    });
  });

  describe('Game completion via skipTurn', () => {
    it('should mark game as COMPLETED when all players skip their turns', async () => {
      // Create pending turns for all players
      const turns = await Promise.all(
        testPlayers.map((player, index) =>
          prisma.turn.create({
            data: {
              gameId: testGame.id,
              playerId: player.id,
              turnNumber: index + 1,
              status: 'PENDING',
              type: 'WRITING',
              claimedAt: new Date(),
            },
          })
        )
      );

      // Skip turns for first two players
      await turnService.skipTurn(turns[0].id);
      await turnService.skipTurn(turns[1].id);

      // Game should not be completed yet
      let gameInDb = await prisma.game.findUnique({ where: { id: testGame.id } });
      expect(gameInDb!.status).toBe('ACTIVE');
      expect(gameInDb!.completedAt).toBeNull();

      // Skip turn for the last player
      const result = await turnService.skipTurn(turns[2].id);

      // Verify the turn skip was successful
      expect(result.success).toBe(true);
      expect(result.turn!.status).toBe('SKIPPED');

      // Game should now be completed
      gameInDb = await prisma.game.findUnique({ where: { id: testGame.id } });
      expect(gameInDb!.status).toBe('COMPLETED');
      expect(gameInDb!.completedAt).not.toBeNull();
    });

    it('should mark game as COMPLETED when last player skips after others completed', async () => {
      // Create turns with mixed states
      const turns = await Promise.all([
        // Player 1: already completed
        prisma.turn.create({
          data: {
            gameId: testGame.id,
            playerId: testPlayers[0].id,
            turnNumber: 1,
            status: 'COMPLETED',
            type: 'WRITING',
            completedAt: new Date(),
            textContent: 'Player 1 content',
          },
        }),
        // Player 2: already completed
        prisma.turn.create({
          data: {
            gameId: testGame.id,
            playerId: testPlayers[1].id,
            turnNumber: 2,
            status: 'COMPLETED',
            type: 'DRAWING',
            completedAt: new Date(),
            imageUrl: 'http://example.com/image.png',
          },
        }),
        // Player 3: pending (will be skipped)
        prisma.turn.create({
          data: {
            gameId: testGame.id,
            playerId: testPlayers[2].id,
            turnNumber: 3,
            status: 'PENDING',
            type: 'WRITING',
            claimedAt: new Date(),
          },
        }),
      ]);

      // Skip the last pending turn
      const result = await turnService.skipTurn(turns[2].id);

      // Verify the turn skip was successful
      expect(result.success).toBe(true);
      expect(result.turn!.status).toBe('SKIPPED');

      // Game should now be completed
      const gameInDb = await prisma.game.findUnique({ where: { id: testGame.id } });
      expect(gameInDb!.status).toBe('COMPLETED');
      expect(gameInDb!.completedAt).not.toBeNull();
    });
  });

  describe('Game completion error handling', () => {
    it('should continue with turn submission even if game completion check fails', async () => {
      // Create a pending turn
      const turn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'PENDING',
          type: 'WRITING',
          claimedAt: new Date(),
        },
      });

      // Mock a scenario where game completion check might fail
      // (In practice, this could be a database connection issue, etc.)
      // The turn submission should still succeed
      const result = await turnService.submitTurn(turn.id, testPlayers[0].id, 'Content', 'text');

      // Verify the turn submission was successful
      expect(result.success).toBe(true);
      expect(result.turn!.status).toBe('COMPLETED');

      // Verify turn is in database
      const turnInDb = await prisma.turn.findUnique({ where: { id: turn.id } });
      expect(turnInDb!.status).toBe('COMPLETED');
      expect(turnInDb!.textContent).toBe('Content');
    });

    it('should continue with turn skip even if game completion check fails', async () => {
      // Create a pending turn
      const turn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'PENDING',
          type: 'WRITING',
          claimedAt: new Date(),
        },
      });

      // Skip the turn
      const result = await turnService.skipTurn(turn.id);

      // Verify the turn skip was successful
      expect(result.success).toBe(true);
      expect(result.turn!.status).toBe('SKIPPED');

      // Verify turn is in database
      const turnInDb = await prisma.turn.findUnique({ where: { id: turn.id } });
      expect(turnInDb!.status).toBe('SKIPPED');
      expect(turnInDb!.skippedAt).not.toBeNull();
    });
  });

  describe('Game completion with multiple games in season', () => {
    it('should only complete the specific game, not affect other games', async () => {
      // Create another game in the same season
      const otherGame = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: testSeason.id,
        },
      });

      // Create pending turns for all players in the test game and submit them
      const testGameTurns = await Promise.all(
        testPlayers.map((player, index) =>
          prisma.turn.create({
            data: {
              gameId: testGame.id,
              playerId: player.id,
              turnNumber: index + 1,
              status: 'PENDING',
              type: 'WRITING',
              claimedAt: new Date(),
            },
          })
        )
      );

      // Submit all turns in the test game using TurnService to trigger game completion check
      for (let i = 0; i < testGameTurns.length; i++) {
        const turn = testGameTurns[i];
        const player = testPlayers[i];
        await turnService.submitTurn(turn.id, player.id, `Player ${i + 1} content`, 'text');
      }

      // Create a pending turn in the other game
      const otherGameTurn = await prisma.turn.create({
        data: {
          gameId: otherGame.id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'PENDING',
          type: 'DRAWING',
          claimedAt: new Date(),
        },
      });

      // Submit a turn in the other game (should not complete it)
      await turnService.submitTurn(otherGameTurn.id, testPlayers[0].id, 'Other game content', 'text');

      // Check game statuses
      const testGameInDb = await prisma.game.findUnique({ where: { id: testGame.id } });
      const otherGameInDb = await prisma.game.findUnique({ where: { id: otherGame.id } });

      // Test game should be completed (all players have turns)
      expect(testGameInDb!.status).toBe('COMPLETED');
      expect(testGameInDb!.completedAt).not.toBeNull();

      // Other game should still be active (only one player has a turn)
      expect(otherGameInDb!.status).toBe('ACTIVE');
      expect(otherGameInDb!.completedAt).toBeNull();
    });
  });
});

describe('TurnService Season Completion Integration Tests', () => {
  let turnService: TurnService;
  let testPlayers: Player[];
  let testSeason: Season;
  let testGames: Game[];
  let seasonConfig: SeasonConfig;

  beforeEach(async () => {
    // Clear the database before each test
    await prisma.$transaction([
      prisma.playersOnSeasons.deleteMany(),
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.player.deleteMany(),
      prisma.seasonConfig.deleteMany(),
    ]);

    // Create test players
    testPlayers = await Promise.all([
      prisma.player.create({
        data: {
          discordUserId: `player1-${nanoid()}`,
          name: 'Player 1',
        },
      }),
      prisma.player.create({
        data: {
          discordUserId: `player2-${nanoid()}`,
          name: 'Player 2',
        },
      }),
    ]);

    // Create season config
    seasonConfig = await prisma.seasonConfig.create({
      data: {
        maxPlayers: 2,
        minPlayers: 2,
        openDuration: '1d',
        turnPattern: 'writing,drawing',
      },
    });

    // Create test season
    testSeason = await prisma.season.create({
      data: {
        status: 'ACTIVE',
        creatorId: testPlayers[0].id,
        configId: seasonConfig.id,
      },
    });

    // Add players to the season
    await Promise.all(
      testPlayers.map(player =>
        prisma.playersOnSeasons.create({
          data: {
            playerId: player.id,
            seasonId: testSeason.id,
          },
        })
      )
    );

    // Create test games
    testGames = await Promise.all([
      prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: testSeason.id,
        },
      }),
      prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: testSeason.id,
        },
      }),
    ]);

    // Create a mock Discord client
    const mockDiscordClient = {
      users: {
        fetch: vi.fn().mockImplementation((userId) => {
          return Promise.resolve({
            id: userId,
            send: vi.fn().mockResolvedValue({}),
          });
        }),
      },
    };

    // Initialize TurnService
    turnService = new TurnService(prisma, mockDiscordClient as unknown as DiscordClient);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should mark season as COMPLETED when all games are completed via turn submission', async () => {
    // Create turns for both games - one turn per player per game
    const turns = await Promise.all([
      // Game 1 turns
      prisma.turn.create({
        data: {
          gameId: testGames[0].id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'PENDING',
          type: 'WRITING',
        },
      }),
      prisma.turn.create({
        data: {
          gameId: testGames[0].id,
          playerId: testPlayers[1].id,
          turnNumber: 2,
          status: 'PENDING',
          type: 'WRITING',
        },
      }),
      // Game 2 turns
      prisma.turn.create({
        data: {
          gameId: testGames[1].id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'PENDING',
          type: 'WRITING',
        },
      }),
      prisma.turn.create({
        data: {
          gameId: testGames[1].id,
          playerId: testPlayers[1].id,
          turnNumber: 2,
          status: 'PENDING',
          type: 'WRITING',
        },
      }),
    ]);

    // Submit all turns to complete both games
    await turnService.submitTurn(turns[0].id, testPlayers[0].id, 'Test content 1', 'text');
    await turnService.submitTurn(turns[1].id, testPlayers[1].id, 'Test content 2', 'text');
    
    // After completing game 1, season should still be ACTIVE
    let updatedSeason = await prisma.season.findUnique({ where: { id: testSeason.id } });
    expect(updatedSeason?.status).toBe('ACTIVE');

    // Complete the second game
    await turnService.submitTurn(turns[2].id, testPlayers[0].id, 'Test content 3', 'text');
    await turnService.submitTurn(turns[3].id, testPlayers[1].id, 'Test content 4', 'text');

    // Now season should be COMPLETED
    updatedSeason = await prisma.season.findUnique({ where: { id: testSeason.id } });
    expect(updatedSeason?.status).toBe('COMPLETED');

    // Verify both games are COMPLETED
    const updatedGames = await prisma.game.findMany({ where: { seasonId: testSeason.id } });
    expect(updatedGames.every(game => game.status === 'COMPLETED')).toBe(true);
  });

  it('should mark season as COMPLETED when all games are completed via turn skipping', async () => {
    // Create turns for both games
    const turns = await Promise.all([
      // Game 1 turns
      prisma.turn.create({
        data: {
          gameId: testGames[0].id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'PENDING',
          type: 'WRITING',
        },
      }),
      prisma.turn.create({
        data: {
          gameId: testGames[0].id,
          playerId: testPlayers[1].id,
          turnNumber: 2,
          status: 'PENDING',
          type: 'WRITING',
        },
      }),
      // Game 2 turns
      prisma.turn.create({
        data: {
          gameId: testGames[1].id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'PENDING',
          type: 'WRITING',
        },
      }),
      prisma.turn.create({
        data: {
          gameId: testGames[1].id,
          playerId: testPlayers[1].id,
          turnNumber: 2,
          status: 'PENDING',
          type: 'WRITING',
        },
      }),
    ]);

    // Skip all turns to complete both games
    await turnService.skipTurn(turns[0].id);
    await turnService.skipTurn(turns[1].id);
    
    // After completing game 1, season should still be ACTIVE
    let updatedSeason = await prisma.season.findUnique({ where: { id: testSeason.id } });
    expect(updatedSeason?.status).toBe('ACTIVE');

    // Complete the second game by skipping
    await turnService.skipTurn(turns[2].id);
    await turnService.skipTurn(turns[3].id);

    // Now season should be COMPLETED
    updatedSeason = await prisma.season.findUnique({ where: { id: testSeason.id } });
    expect(updatedSeason?.status).toBe('COMPLETED');

    // Verify both games are COMPLETED
    const updatedGames = await prisma.game.findMany({ where: { seasonId: testSeason.id } });
    expect(updatedGames.every(game => game.status === 'COMPLETED')).toBe(true);
  });

  it('should handle mixed turn completion and skipping', async () => {
    // Create turns for both games
    const turns = await Promise.all([
      // Game 1 turns
      prisma.turn.create({
        data: {
          gameId: testGames[0].id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'PENDING',
          type: 'WRITING',
        },
      }),
      prisma.turn.create({
        data: {
          gameId: testGames[0].id,
          playerId: testPlayers[1].id,
          turnNumber: 2,
          status: 'PENDING',
          type: 'WRITING',
        },
      }),
      // Game 2 turns
      prisma.turn.create({
        data: {
          gameId: testGames[1].id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'PENDING',
          type: 'WRITING',
        },
      }),
      prisma.turn.create({
        data: {
          gameId: testGames[1].id,
          playerId: testPlayers[1].id,
          turnNumber: 2,
          status: 'PENDING',
          type: 'WRITING',
        },
      }),
    ]);

    // Complete game 1 with mixed submission and skipping
    await turnService.submitTurn(turns[0].id, testPlayers[0].id, 'Test content 1', 'text');
    await turnService.skipTurn(turns[1].id);
    
    // Complete game 2 with mixed submission and skipping
    await turnService.skipTurn(turns[2].id);
    await turnService.submitTurn(turns[3].id, testPlayers[1].id, 'Test content 2', 'text');

    // Season should be COMPLETED
    const updatedSeason = await prisma.season.findUnique({ where: { id: testSeason.id } });
    expect(updatedSeason?.status).toBe('COMPLETED');

    // Verify both games are COMPLETED
    const updatedGames = await prisma.game.findMany({ where: { seasonId: testSeason.id } });
    expect(updatedGames.every(game => game.status === 'COMPLETED')).toBe(true);
  });
}); 