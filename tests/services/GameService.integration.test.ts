import { Game, Player, PrismaClient, Season, SeasonConfig } from '@prisma/client';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GameService } from '../../src/services/GameService.js';
import { truncateTables } from '../utils/testUtils.js';

describe('GameService Integration Tests', () => {
  let prisma: PrismaClient;
  let gameService: GameService;
  let testSeason: Season;
  let testPlayers: Player[];
  let testConfig: SeasonConfig;

  beforeEach(async () => {
    // Initialize PrismaClient for integration tests
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL // Ensure this is set for tests
        }
      }
    });
    gameService = new GameService(prisma);

    // Clean up any existing test data
    await truncateTables(prisma);

    // Create test config
    testConfig = await prisma.seasonConfig.create({
      data: {
        turnPattern: 'writing,drawing',
        claimTimeout: '1d',
        writingTimeout: '2d',
        drawingTimeout: '2d',
        openDuration: '7d',
        minPlayers: 2,
        maxPlayers: 10
      }
    });

    // Create test players
    testPlayers = await Promise.all([
      prisma.player.create({
        data: {
          discordUserId: '123456789',
          name: 'Test Player 1'
        }
      }),
      prisma.player.create({
        data: {
          discordUserId: '987654321',
          name: 'Test Player 2'
        }
      }),
      prisma.player.create({
        data: {
          discordUserId: '555666777',
          name: 'Test Player 3'
        }
      })
    ]);

    // Create test season
    testSeason = await prisma.season.create({
      data: {
        status: 'ACTIVE',
        creatorId: testPlayers[0].id,
        configId: testConfig.id,
        guildId: 'test-guild',
        channelId: 'test-channel'
      }
    });

    // Add players to season
    await Promise.all(
      testPlayers.map(player =>
        prisma.playersOnSeasons.create({
          data: {
            playerId: player.id,
            seasonId: testSeason.id
          }
        })
      )
    );
  });

  afterEach(async () => {
    // Clean up test data
    await truncateTables(prisma);
  });

  afterAll(async () => {
    // Disconnect PrismaClient
    await prisma.$disconnect();
  });

  describe('createGamesForSeason', () => {
    it('should create correct number of games for a season', async () => {
      const result = await gameService.createGamesForSeason(testSeason.id);

      expect(result.success).toBe(true);
      expect(result.games).toHaveLength(3); // One game per player

      // Verify games are actually in the database
      const gamesInDb = await prisma.game.findMany({
        where: { seasonId: testSeason.id }
      });
      expect(gamesInDb).toHaveLength(3);
      expect(gamesInDb.every(game => game.status === 'SETUP')).toBe(true);
    });

    it('should work within a transaction', async () => {
      const result = await prisma.$transaction(async (tx) => {
        return await gameService.createGamesForSeason(testSeason.id, tx);
      });

      expect(result.success).toBe(true);
      expect(result.games).toHaveLength(3);

      // Verify games are committed to the database
      const gamesInDb = await prisma.game.findMany({
        where: { seasonId: testSeason.id }
      });
      expect(gamesInDb).toHaveLength(3);
    });

    it('should fail for non-existent season', async () => {
      const result = await gameService.createGamesForSeason('non-existent-season');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Season not found');

      // Verify no games were created
      const gamesInDb = await prisma.game.findMany();
      expect(gamesInDb).toHaveLength(0);
    });
  });

  describe('getGameStatus', () => {
    let testGame: Game;

    beforeEach(async () => {
      testGame = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: testSeason.id
        }
      });
    });

    it('should get game status with season and turns data', async () => {
      // Create some turns for the game
      await prisma.turn.createMany({
        data: [
          {
            gameId: testGame.id,
            turnNumber: 1,
            type: 'WRITING',
            status: 'COMPLETED',
            playerId: testPlayers[0].id,
            textContent: 'Test content'
          },
          {
            gameId: testGame.id,
            turnNumber: 2,
            type: 'DRAWING',
            status: 'PENDING',
            playerId: testPlayers[1].id
          }
        ]
      });

      const result = await gameService.getGameStatus(testGame.id);

      expect(result.success).toBe(true);
      expect(result.game?.id).toBe(testGame.id);
      expect(result.game?.season.id).toBe(testSeason.id);
      expect(result.game?.turns).toHaveLength(2);
      expect(result.isCompleted).toBe(false); // Game not completed yet
    });

    it('should detect when game is completed', async () => {
      // Create completed turns for all players
      await prisma.turn.createMany({
        data: testPlayers.map((player, index) => ({
          gameId: testGame.id,
          turnNumber: index + 1,
          type: index % 2 === 0 ? 'WRITING' : 'DRAWING',
          status: 'COMPLETED',
          playerId: player.id,
          textContent: `Content ${index + 1}`
        }))
      });

      const result = await gameService.getGameStatus(testGame.id);

      expect(result.success).toBe(true);
      expect(result.isCompleted).toBe(true);
    });
  });

  describe('activateGame and completeGame', () => {
    let testGame: Game;

    beforeEach(async () => {
      testGame = await prisma.game.create({
        data: {
          status: 'SETUP',
          seasonId: testSeason.id
        }
      });
    });

    it('should activate a game', async () => {
      const result = await gameService.activateGame(testGame.id);

      expect(result?.status).toBe('ACTIVE');

      // Verify in database
      const gameInDb = await prisma.game.findUnique({
        where: { id: testGame.id }
      });
      expect(gameInDb?.status).toBe('ACTIVE');
    });

    it('should complete a game', async () => {
      const result = await gameService.completeGame(testGame.id);

      expect(result?.status).toBe('COMPLETED');
      expect(result?.completedAt).toBeDefined();

      // Verify in database
      const gameInDb = await prisma.game.findUnique({
        where: { id: testGame.id }
      });
      expect(gameInDb?.status).toBe('COMPLETED');
      expect(gameInDb?.completedAt).toBeDefined();
    });
  });

  describe('getGamesForSeason', () => {
    beforeEach(async () => {
      // Create games with different statuses
      await prisma.game.createMany({
        data: [
          { status: 'SETUP', seasonId: testSeason.id },
          { status: 'ACTIVE', seasonId: testSeason.id },
          { status: 'COMPLETED', seasonId: testSeason.id }
        ]
      });
    });

    it('should get all games for a season', async () => {
      const games = await gameService.getGamesForSeason(testSeason.id);

      expect(games).toHaveLength(3);
      expect(games.map(g => g.status)).toEqual(['SETUP', 'ACTIVE', 'COMPLETED']);
    });

    it('should filter games by status', async () => {
      const activeGames = await gameService.getGamesForSeason(testSeason.id, 'ACTIVE');

      expect(activeGames).toHaveLength(1);
      expect(activeGames[0].status).toBe('ACTIVE');
    });
  });

  describe('handleTurnCompletion', () => {
    let testGame: Game;
    let testTurn: any;

    beforeEach(async () => {
      testGame = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: testSeason.id
        }
      });

      testTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'PENDING',
          playerId: testPlayers[0].id
        }
      });
    });

    it('should handle turn completion without marking game as completed', async () => {
      // Complete the turn first
      await prisma.turn.update({
        where: { id: testTurn.id },
        data: { status: 'COMPLETED', textContent: 'Test content' }
      });

      const result = await gameService.handleTurnCompletion(testTurn.id);

      expect(result.success).toBe(true);
      expect(result.gameCompleted).toBe(false);

      // Game should still be ACTIVE
      const gameInDb = await prisma.game.findUnique({
        where: { id: testGame.id }
      });
      expect(gameInDb?.status).toBe('ACTIVE');
    });

    it('should mark game as completed when all players have completed turns', async () => {
      // Create and complete turns for all players
      await prisma.turn.createMany({
        data: testPlayers.map((player, index) => ({
          gameId: testGame.id,
          turnNumber: index + 1,
          type: 'WRITING',
          status: 'COMPLETED',
          playerId: player.id,
          textContent: `Content ${index + 1}`
        }))
      });

      // Handle completion of the last turn
      const lastTurn = await prisma.turn.findFirst({
        where: { gameId: testGame.id, turnNumber: testPlayers.length }
      });

      const result = await gameService.handleTurnCompletion(lastTurn!.id);

      expect(result.success).toBe(true);
      expect(result.gameCompleted).toBe(true);

      // Game should be marked as COMPLETED
      const gameInDb = await prisma.game.findUnique({
        where: { id: testGame.id }
      });
      expect(gameInDb?.status).toBe('COMPLETED');
      expect(gameInDb?.completedAt).toBeDefined();
    });
  });

  describe('getGameStatistics', () => {
    let testGame: Game;

    beforeEach(async () => {
      testGame = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: testSeason.id
        }
      });

      // Create turns with various statuses
      await prisma.turn.createMany({
        data: [
          {
            gameId: testGame.id,
            turnNumber: 1,
            type: 'WRITING',
            status: 'COMPLETED',
            playerId: testPlayers[0].id,
            textContent: 'Completed turn'
          },
          {
            gameId: testGame.id,
            turnNumber: 2,
            type: 'DRAWING',
            status: 'COMPLETED',
            playerId: testPlayers[1].id,
            textContent: 'Another completed turn'
          },
          {
            gameId: testGame.id,
            turnNumber: 3,
            type: 'WRITING',
            status: 'SKIPPED',
            playerId: testPlayers[2].id
          },
          {
            gameId: testGame.id,
            turnNumber: 4,
            type: 'DRAWING',
            status: 'PENDING',
            playerId: testPlayers[0].id
          },
          {
            gameId: testGame.id,
            turnNumber: 5,
            type: 'WRITING',
            status: 'OFFERED',
            playerId: testPlayers[1].id
          }
        ]
      });
    });

    it('should calculate accurate game statistics', async () => {
      const stats = await gameService.getGameStatistics(testGame.id);

      expect(stats).toEqual({
        totalTurns: 5,
        completedTurns: 2,
        skippedTurns: 1,
        pendingTurns: 2, // PENDING + OFFERED
        completionPercentage: 60 // (2 + 1) / 5 * 100
      });
    });
  });

  describe('getGameWithTurnsAndPlayers', () => {
    let testGame: Game;

    beforeEach(async () => {
      testGame = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: testSeason.id
        }
      });

      await prisma.turn.create({
        data: {
          gameId: testGame.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'COMPLETED',
          playerId: testPlayers[0].id,
          textContent: 'Test content'
        }
      });
    });

    it('should get game with all related data', async () => {
      const result = await gameService.getGameWithTurnsAndPlayers(testGame.id);

      expect(result?.id).toBe(testGame.id);
      expect(result?.season.players).toHaveLength(3);
      expect(result?.turns).toHaveLength(1);
      expect(result?.turns[0].player?.name).toBe('Test Player 1');
      expect(result?.season.players[0].player.discordUserId).toBeTruthy();
    });
  });

  describe('updateGameStatus', () => {
    let testGame: Game;

    beforeEach(async () => {
      testGame = await prisma.game.create({
        data: {
          status: 'SETUP',
          seasonId: testSeason.id
        }
      });
    });

    it('should update game status', async () => {
      const result = await gameService.updateGameStatus(testGame.id, 'TERMINATED');

      expect(result?.status).toBe('TERMINATED');

      // Verify in database
      const gameInDb = await prisma.game.findUnique({
        where: { id: testGame.id }
      });
      expect(gameInDb?.status).toBe('TERMINATED');
    });

    it('should set completedAt when status is COMPLETED', async () => {
      const result = await gameService.updateGameStatus(testGame.id, 'COMPLETED');

      expect(result?.status).toBe('COMPLETED');
      expect(result?.completedAt).toBeDefined();

      // Verify in database
      const gameInDb = await prisma.game.findUnique({
        where: { id: testGame.id }
      });
      expect(gameInDb?.status).toBe('COMPLETED');
      expect(gameInDb?.completedAt).toBeDefined();
    });
  });

  describe('findGameById', () => {
    let testGame: Game;

    beforeEach(async () => {
      testGame = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: testSeason.id
        }
      });
    });

    it('should find existing game', async () => {
      const result = await gameService.findGameById(testGame.id);

      expect(result?.id).toBe(testGame.id);
      expect(result?.status).toBe('ACTIVE');
    });

    it('should return null for non-existent game', async () => {
      const result = await gameService.findGameById('non-existent-id');

      expect(result).toBeNull();
    });
  });
}); 