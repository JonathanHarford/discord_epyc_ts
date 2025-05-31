import { Game, Player, Season } from '@prisma/client';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import * as pureGameLogic from '../../src/game/pureGameLogic.js';
import { GameCreationResult, GameService, GameStatusResult } from '../../src/services/GameService.js';

// Mock the pure game logic module
vi.mock('../../src/game/pureGameLogic.js', () => ({
  checkGameCompletionPure: vi.fn()
}));

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test-game-id')
}));

describe('GameService', () => {
  let gameService: GameService;
  let mockPrisma: {
    season: {
      findUnique: Mock;
    };
    game: {
      create: Mock;
      findUnique: Mock;
      findMany: Mock;
      update: Mock;
      updateMany: Mock;
    };
    turn: {
      findUnique: Mock;
      findMany: Mock;
    };
    player: {
      findMany: Mock;
    };
  };

  const mockSeason: Season = {
    id: 'test-season',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    configId: 'config-1',
    creatorId: 'creator-1',
    guildId: 'guild-1',
    channelId: 'channel-1'
  };

  const mockGame: Game = {
    id: 'test-game-id',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    seasonId: 'test-season',
    configId: null,
    creatorId: null,
    guildId: null,
    lastActivityAt: new Date()
  };

  const mockPlayer: Player = {
    id: 'player-1',
    discordUserId: '123456789',
    name: 'Test Player',
    bannedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    mockPrisma = {
      season: {
        findUnique: vi.fn()
      },
      game: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn()
      },
      turn: {
        findUnique: vi.fn(),
        findMany: vi.fn()
      },
      player: {
        findMany: vi.fn()
      }
    };

    gameService = new GameService(mockPrisma as any);
    vi.clearAllMocks();
  });

  describe('createGamesForSeason', () => {
    it('should successfully create games for a season', async () => {
      const seasonWithPlayers = {
        ...mockSeason,
        players: [
          { player: mockPlayer },
          { player: { ...mockPlayer, id: 'player-2', discordUserId: '987654321' } }
        ]
      };

      mockPrisma.season.findUnique.mockResolvedValue(seasonWithPlayers);
      mockPrisma.game.create.mockResolvedValue(mockGame);

      const result: GameCreationResult = await gameService.createGamesForSeason('test-season');

      expect(result.success).toBe(true);
      expect(result.games).toHaveLength(2);
      expect(mockPrisma.season.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-season' },
        include: {
          players: {
            include: {
              player: true
            }
          }
        }
      });
      expect(mockPrisma.game.create).toHaveBeenCalledTimes(2);
    });

    it('should fail when season does not exist', async () => {
      mockPrisma.season.findUnique.mockResolvedValue(null);

      const result: GameCreationResult = await gameService.createGamesForSeason('nonexistent-season');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Season not found');
      expect(mockPrisma.game.create).not.toHaveBeenCalled();
    });

    it('should fail when season has no players', async () => {
      const seasonWithoutPlayers = {
        ...mockSeason,
        players: []
      };

      mockPrisma.season.findUnique.mockResolvedValue(seasonWithoutPlayers);

      const result: GameCreationResult = await gameService.createGamesForSeason('test-season');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Season has no players');
      expect(mockPrisma.game.create).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.season.findUnique.mockRejectedValue(new Error('Database error'));

      const result: GameCreationResult = await gameService.createGamesForSeason('test-season');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('getGameStatus', () => {
    it('should successfully get game status with completion check', async () => {
      const gameWithDetails = {
        ...mockGame,
        season: mockSeason,
        turns: []
      };

      mockPrisma.game.findUnique.mockResolvedValue(gameWithDetails);
      mockPrisma.player.findMany.mockResolvedValue([mockPlayer]);
      mockPrisma.turn.findMany.mockResolvedValue([]);
      (pureGameLogic.checkGameCompletionPure as Mock).mockReturnValue({ isCompleted: true });

      const result: GameStatusResult = await gameService.getGameStatus('test-game-id');

      expect(result.success).toBe(true);
      expect(result.game?.id).toBe('test-game-id');
      expect(result.isCompleted).toBe(true);
      expect(pureGameLogic.checkGameCompletionPure).toHaveBeenCalled();
    });

    it('should fail when game does not exist', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(null);

      const result: GameStatusResult = await gameService.getGameStatus('nonexistent-game');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Game not found');
      expect(pureGameLogic.checkGameCompletionPure).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.game.findUnique.mockRejectedValue(new Error('Database error'));

      const result: GameStatusResult = await gameService.getGameStatus('test-game-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('activateGame', () => {
    it('should successfully activate a game', async () => {
      const activatedGame = { ...mockGame, status: 'ACTIVE' };
      mockPrisma.game.update.mockResolvedValue(activatedGame);

      const result = await gameService.activateGame('test-game-id');

      expect(result?.status).toBe('ACTIVE');
      expect(mockPrisma.game.update).toHaveBeenCalledWith({
        where: { id: 'test-game-id' },
        data: {
          status: 'ACTIVE',
          updatedAt: expect.any(Date)
        }
      });
    });

    it('should handle database errors and return null', async () => {
      mockPrisma.game.update.mockRejectedValue(new Error('Database error'));

      const result = await gameService.activateGame('test-game-id');

      expect(result).toBeNull();
    });
  });

  describe('completeGame', () => {
    it('should successfully complete a game', async () => {
      const completedGame = { ...mockGame, status: 'COMPLETED', completedAt: new Date() };
      mockPrisma.game.update.mockResolvedValue(completedGame);

      const result = await gameService.completeGame('test-game-id');

      expect(result?.status).toBe('COMPLETED');
      expect(result?.completedAt).toBeDefined();
      expect(mockPrisma.game.update).toHaveBeenCalledWith({
        where: { id: 'test-game-id' },
        data: {
          status: 'COMPLETED',
          completedAt: expect.any(Date),
          updatedAt: expect.any(Date)
        }
      });
    });

    it('should handle database errors and return null', async () => {
      mockPrisma.game.update.mockRejectedValue(new Error('Database error'));

      const result = await gameService.completeGame('test-game-id');

      expect(result).toBeNull();
    });
  });

  describe('getGamesForSeason', () => {
    it('should get all games for a season', async () => {
      const games = [mockGame, { ...mockGame, id: 'game-2' }];
      mockPrisma.game.findMany.mockResolvedValue(games);

      const result = await gameService.getGamesForSeason('test-season');

      expect(result).toHaveLength(2);
      expect(mockPrisma.game.findMany).toHaveBeenCalledWith({
        where: { seasonId: 'test-season' },
        orderBy: { createdAt: 'asc' }
      });
    });

    it('should filter games by status', async () => {
      const activeGames = [mockGame];
      mockPrisma.game.findMany.mockResolvedValue(activeGames);

      const result = await gameService.getGamesForSeason('test-season', 'ACTIVE');

      expect(result).toHaveLength(1);
      expect(mockPrisma.game.findMany).toHaveBeenCalledWith({
        where: { seasonId: 'test-season', status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' }
      });
    });

    it('should return empty array on database error', async () => {
      mockPrisma.game.findMany.mockRejectedValue(new Error('Database error'));

      const result = await gameService.getGamesForSeason('test-season');

      expect(result).toEqual([]);
    });
  });

  const mockTurn = {
    id: 'turn-1',
    gameId: 'test-game-id',
    turnNumber: 1,
    type: 'WRITING',
    status: 'COMPLETED',
    textContent: 'Test content',
    imageUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    offeredAt: null,
    claimedAt: null,
    completedAt: new Date(),
    skippedAt: null,
    playerId: 'player-1',
    previousTurnId: null
  };

  describe('handleTurnCompletion', () => {

    it('should handle turn completion and mark game as completed', async () => {
      const turnWithGame = {
        ...mockTurn,
        game: mockGame
      };

      mockPrisma.turn.findUnique.mockResolvedValue(turnWithGame);
      mockPrisma.player.findMany.mockResolvedValue([mockPlayer]);
      mockPrisma.turn.findMany.mockResolvedValue([mockTurn]);
      (pureGameLogic.checkGameCompletionPure as Mock).mockReturnValue({ isCompleted: true });
      mockPrisma.game.update.mockResolvedValue({ ...mockGame, status: 'COMPLETED' });

      const result = await gameService.handleTurnCompletion('turn-1');

      expect(result.success).toBe(true);
      expect(result.gameCompleted).toBe(true);
      expect(pureGameLogic.checkGameCompletionPure).toHaveBeenCalled();
    });

    it('should handle turn completion when game is not yet completed', async () => {
      const turnWithGame = {
        ...mockTurn,
        game: mockGame
      };

      mockPrisma.turn.findUnique.mockResolvedValue(turnWithGame);
      mockPrisma.player.findMany.mockResolvedValue([mockPlayer]);
      mockPrisma.turn.findMany.mockResolvedValue([]);
      (pureGameLogic.checkGameCompletionPure as Mock).mockReturnValue({ isCompleted: false });

      const result = await gameService.handleTurnCompletion('turn-1');

      expect(result.success).toBe(true);
      expect(result.gameCompleted).toBe(false);
      expect(mockPrisma.game.update).not.toHaveBeenCalled();
    });

    it('should fail when turn does not exist', async () => {
      mockPrisma.turn.findUnique.mockResolvedValue(null);

      const result = await gameService.handleTurnCompletion('nonexistent-turn');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Turn not found');
    });

    it('should handle errors during game completion', async () => {
      const turnWithGame = {
        ...mockTurn,
        game: mockGame
      };

      mockPrisma.turn.findUnique.mockResolvedValue(turnWithGame);
      mockPrisma.player.findMany.mockResolvedValue([mockPlayer]);
      mockPrisma.turn.findMany.mockResolvedValue([mockTurn]);
      (pureGameLogic.checkGameCompletionPure as Mock).mockReturnValue({ isCompleted: true });
      mockPrisma.game.update.mockResolvedValue(null); // Simulate completion failure

      const result = await gameService.handleTurnCompletion('turn-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to mark game as completed');
    });
  });

  describe('updateGameStatus', () => {
    it('should update game status', async () => {
      const updatedGame = { ...mockGame, status: 'TERMINATED' };
      mockPrisma.game.update.mockResolvedValue(updatedGame);

      const result = await gameService.updateGameStatus('test-game-id', 'TERMINATED');

      expect(result?.status).toBe('TERMINATED');
      expect(mockPrisma.game.update).toHaveBeenCalledWith({
        where: { id: 'test-game-id' },
        data: {
          status: 'TERMINATED',
          updatedAt: expect.any(Date)
        }
      });
    });

    it('should set completedAt when status is COMPLETED', async () => {
      const completedGame = { ...mockGame, status: 'COMPLETED', completedAt: new Date() };
      mockPrisma.game.update.mockResolvedValue(completedGame);

      const result = await gameService.updateGameStatus('test-game-id', 'COMPLETED');

      expect(result?.status).toBe('COMPLETED');
      expect(mockPrisma.game.update).toHaveBeenCalledWith({
        where: { id: 'test-game-id' },
        data: {
          status: 'COMPLETED',
          updatedAt: expect.any(Date),
          completedAt: expect.any(Date)
        }
      });
    });
  });

  describe('findGameById', () => {
    it('should find a game by ID', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(mockGame);

      const result = await gameService.findGameById('test-game-id');

      expect(result?.id).toBe('test-game-id');
      expect(mockPrisma.game.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-game-id' }
      });
    });

    it('should return null when game not found', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(null);

      const result = await gameService.findGameById('nonexistent-game');

      expect(result).toBeNull();
    });
  });

  describe('getGameStatistics', () => {
    it('should calculate game statistics correctly', async () => {
      const turns = [
        { ...mockTurn, status: 'COMPLETED' },
        { ...mockTurn, id: 'turn-2', status: 'COMPLETED' },
        { ...mockTurn, id: 'turn-3', status: 'SKIPPED' },
        { ...mockTurn, id: 'turn-4', status: 'PENDING' },
        { ...mockTurn, id: 'turn-5', status: 'OFFERED' }
      ];

      mockPrisma.turn.findMany.mockResolvedValue(turns);

      const result = await gameService.getGameStatistics('test-game-id');

      expect(result).toEqual({
        totalTurns: 5,
        completedTurns: 2,
        skippedTurns: 1,
        pendingTurns: 2, // PENDING + OFFERED
        completionPercentage: 60 // (2 + 1) / 5 * 100
      });
    });

    it('should handle zero turns gracefully', async () => {
      mockPrisma.turn.findMany.mockResolvedValue([]);

      const result = await gameService.getGameStatistics('test-game-id');

      expect(result).toEqual({
        totalTurns: 0,
        completedTurns: 0,
        skippedTurns: 0,
        pendingTurns: 0,
        completionPercentage: 0
      });
    });

    it('should return null on database error', async () => {
      mockPrisma.turn.findMany.mockRejectedValue(new Error('Database error'));

      const result = await gameService.getGameStatistics('test-game-id');

      expect(result).toBeNull();
    });
  });

  describe('getGameWithTurnsAndPlayers', () => {
    it('should get game with detailed turn and player information', async () => {
      const gameWithDetails = {
        ...mockGame,
        season: {
          players: [
            { player: mockPlayer }
          ]
        },
        turns: [
          {
            ...mockTurn,
            player: mockPlayer
          }
        ]
      };

      mockPrisma.game.findUnique.mockResolvedValue(gameWithDetails);

      const result = await gameService.getGameWithTurnsAndPlayers('test-game-id');

      expect(result?.id).toBe('test-game-id');
      expect(result?.season.players).toHaveLength(1);
      expect(result?.turns).toHaveLength(1);
      expect(mockPrisma.game.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-game-id' },
        include: {
          season: {
            include: {
              players: {
                include: {
                  player: true
                }
              }
            }
          },
          turns: {
            include: {
              player: true
            },
            orderBy: {
              turnNumber: 'asc'
            }
          }
        }
      });
    });

    it('should return null when game not found', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(null);

      const result = await gameService.getGameWithTurnsAndPlayers('nonexistent-game');

      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockPrisma.game.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await gameService.getGameWithTurnsAndPlayers('test-game-id');

      expect(result).toBeNull();
    });
  });
}); 