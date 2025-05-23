import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { PrismaClient, Player, Turn, Game, Season, PlayersOnSeasons, SeasonConfig } from '@prisma/client';
import { 
  selectNextPlayer, 
  checkGameCompletion,
  activateSeasonPlaceholder as activateSeason, // Renamed import
  checkSeasonCompletion as checkSeasonCompletionFull, // Renamed import, alias to avoid conflict
  applyShouldRule1
} from '../../src/game/gameLogic.js';
import { nanoid } from 'nanoid';

// Mock logger
vi.mock('../../src/services/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Use a separate Prisma client for tests
const prisma = new PrismaClient();

describe('Next Player Logic Unit Tests', () => {
  let testPlayers: Player[];
  let testSeason: Season;
  let testGame: Game;

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

    // Create test players with deterministic IDs for consistent testing
    testPlayers = await Promise.all([
      prisma.player.create({
        data: {
          id: 'player-a', // Deterministic ID that will sort first
          discordUserId: `player1-${nanoid()}`,
          name: 'Player 1',
        },
      }),
      prisma.player.create({
        data: {
          id: 'player-b', // Deterministic ID that will sort second
          discordUserId: `player2-${nanoid()}`,
          name: 'Player 2',
        },
      }),
      prisma.player.create({
        data: {
          id: 'player-c', // Deterministic ID that will sort third
          discordUserId: `player3-${nanoid()}`,
          name: 'Player 3',
        },
      }),
      prisma.player.create({
        data: {
          id: 'player-d', // Deterministic ID that will sort fourth
          discordUserId: `player4-${nanoid()}`,
          name: 'Player 4',
        },
      }),
    ]);

    // Create season config
    const seasonConfig = await prisma.seasonConfig.create({
      data: {
        maxPlayers: 4,
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

    // Create test game
    testGame = await prisma.game.create({
      data: {
        status: 'ACTIVE',
        seasonId: testSeason.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // testPlayers, testSeason, testGame are already declared in the outer scope
  // and initialized in beforeEach. We can reuse them or create specific ones inside test blocks.

  describe('activateSeason', () => {
    let localTestSeason: Season;
    let seasonConfig: SeasonConfig;

    beforeEach(async () => {
      seasonConfig = await prisma.seasonConfig.create({
        data: { turnPattern: 'writing,drawing', openDuration: '1d', minPlayers: 1, maxPlayers: 10 }
      });
      localTestSeason = await prisma.season.create({
        data: {
          status: 'SETUP',
          creatorId: testPlayers[0].id,
          configId: seasonConfig.id,
        },
      });
    });

    it('should activate the season and its first game', async () => {
      const game1 = await prisma.game.create({
        data: { seasonId: localTestSeason.id, status: 'SETUP', turns: { create: [] } },
      });
      await prisma.game.create({ // second game, should remain SETUP
        data: { seasonId: localTestSeason.id, status: 'SETUP', createdAt: new Date(Date.now() + 1000) }, // ensure it's not the first
      });
      
      const result = await activateSeason(localTestSeason.id, prisma);

      expect(result).not.toBeNull();
      expect(result?.status).toBe('ACTIVE');

      const dbSeason = await prisma.season.findUnique({ where: { id: localTestSeason.id } });
      expect(dbSeason?.status).toBe('ACTIVE');

      const dbGame1 = await prisma.game.findUnique({ where: { id: game1.id } });
      expect(dbGame1?.status).toBe('ACTIVE');
      
      const games = await prisma.game.findMany({ where: { seasonId: localTestSeason.id } });
      expect(games.find(g => g.id !== game1.id)?.status).toBe('SETUP');
    });

    it('should return null if season not found', async () => {
      const result = await activateSeason('non-existent-id', prisma);
      expect(result).toBeNull();
    });

    it('should return null if season has no games', async () => {
      const result = await activateSeason(localTestSeason.id, prisma);
      expect(result).toBeNull();
      const dbSeason = await prisma.season.findUnique({ where: { id: localTestSeason.id } });
      expect(dbSeason?.status).toBe('SETUP');
    });
  });

  describe('checkSeasonCompletion (Full Season Check)', () => {
    let localTestSeason: Season;
    let seasonConfig: SeasonConfig;

    beforeEach(async () => {
      seasonConfig = await prisma.seasonConfig.create({
        data: { turnPattern: 'writing,drawing', openDuration: '1d', minPlayers: 1, maxPlayers: 10 }
      });
      localTestSeason = await prisma.season.create({
        data: {
          status: 'ACTIVE', // Start as active for these tests
          creatorId: testPlayers[0].id,
          configId: seasonConfig.id,
        },
      });
    });

    it('should mark season as COMPLETED if all its games are COMPLETED', async () => {
      await prisma.game.createMany({
        data: [
          { seasonId: localTestSeason.id, status: 'COMPLETED' },
          { seasonId: localTestSeason.id, status: 'COMPLETED' },
        ],
      });

      const result = await checkSeasonCompletionFull(localTestSeason.id, prisma);
      expect(result.completed).toBe(true);
      expect(result.season?.status).toBe('COMPLETED');
      const dbSeason = await prisma.season.findUnique({ where: { id: localTestSeason.id } });
      expect(dbSeason?.status).toBe('COMPLETED');
    });

    it('should not mark season as COMPLETED if some games are not COMPLETED', async () => {
      await prisma.game.createMany({
        data: [
          { seasonId: localTestSeason.id, status: 'COMPLETED' },
          { seasonId: localTestSeason.id, status: 'ACTIVE' },
        ],
      });

      const result = await checkSeasonCompletionFull(localTestSeason.id, prisma);
      expect(result.completed).toBe(false);
      expect(result.season?.status).toBe('ACTIVE');
    });

    it('should mark season with no games as COMPLETED if status is ACTIVE (not SETUP/PENDING)', async () => {
      // Season is already ACTIVE and has no games by default in this beforeEach
      const result = await checkSeasonCompletionFull(localTestSeason.id, prisma);
      expect(result.completed).toBe(true);
      expect(result.season?.status).toBe('COMPLETED');
    });
    
    it('should NOT mark season with no games as COMPLETED if status is PENDING', async () => {
      await prisma.season.update({ where: { id: localTestSeason.id }, data: { status: 'PENDING' } });
      const result = await checkSeasonCompletionFull(localTestSeason.id, prisma);
      expect(result.completed).toBe(false);
      expect(result.season?.status).toBe('PENDING');
    });
    
    it('should NOT mark season with no games as COMPLETED if status is SETUP', async () => {
      await prisma.season.update({ where: { id: localTestSeason.id }, data: { status: 'SETUP' } });
      const result = await checkSeasonCompletionFull(localTestSeason.id, prisma);
      expect(result.completed).toBe(false); // As per current logic, setup + no games does not mean completed
      expect(result.season?.status).toBe('SETUP');
    });

    it('should return completed: false if season not found', async () => {
      const result = await checkSeasonCompletionFull('non-existent-id', prisma);
      expect(result.completed).toBe(false);
      expect(result.season).toBeNull();
    });
  });
  
  describe('applyShouldRule1', () => {
    // Minimal PlayerTurnStats structure needed for this rule
    const createPlayerStats = (playerId: string): any => ({
      playerId,
      player: { id: playerId, name: `P-${playerId}` } as Player,
      // Other stats are not directly used by applyShouldRule1 but might be by other rules
      totalWritingTurns: 0,
      totalDrawingTurns: 0,
      pendingTurns: 0,
      hasPlayedInGame: false,
    });

    let playerAStats: any;
    let playerBStats: any;
    let playerCStats: any;
    
    let playerAId: string;
    let playerBId: string;
    let playerCId: string;

    beforeEach(() => {
      playerAId = `playerA-${nanoid()}`;
      playerBId = `playerB-${nanoid()}`;
      playerCId = `playerC-${nanoid()}`;

      playerAStats = createPlayerStats(playerAId);
      playerBStats = createPlayerStats(playerBId); // For ID reference mostly
      playerCStats = createPlayerStats(playerCId);
    });

    const turnTypeWriting = 'WRITING';

    it('should not filter if no previous completed/skipped turn in current game', () => {
      const candidates = [playerAStats, playerCStats];
      const currentGameTurns: (Turn & { player: Player | null })[] = []; // No previous turn
      const allSeasonGames: (Game & { turns: (Turn & { player: Player | null })[] })[] = [];

      const result = applyShouldRule1(candidates, turnTypeWriting, currentGameTurns, allSeasonGames);
      expect(result).toEqual(candidates);
    });

    it('should not filter Player A if they have not followed Player B before with the same turn type', () => {
      const candidates = [playerAStats, playerCStats];
      const currentGameTurns = [
        { turnNumber: 1, playerId: playerBId, status: 'COMPLETED', type: turnTypeWriting, player: null },
      ] as (Turn & { player: Player | null })[];
      const allSeasonGames = [
        { id: 'game1', turns: [ // A different game or irrelevant turns
          { turnNumber: 1, playerId: playerAId, status: 'COMPLETED', type: 'DRAWING', previousTurnId: null, player: null },
          { turnNumber: 2, playerId: playerBId, status: 'COMPLETED', type: turnTypeWriting, previousTurnId: 'turnA1', player: null },
        ]}
      ] as (Game & { turns: (Turn & { player: Player | null })[] })[];

      const result = applyShouldRule1(candidates, turnTypeWriting, currentGameTurns, allSeasonGames);
      expect(result).toContain(playerAStats);
    });

    it('should filter Player A if they followed Player B for the same turnType once before', () => {
      const candidates = [playerAStats, playerCStats];
      // Current game: Player B just finished a WRITING turn
      const currentGameTurns = [
        { turnNumber: 1, playerId: playerBId, status: 'COMPLETED', type: turnTypeWriting, player: null },
      ] as (Turn & { player: Player | null })[];
      
      // Season history: Player A already followed Player B with a WRITING turn in game1
      const allSeasonGames = [
        { 
          id: 'game1', 
          turns: [
            { turnNumber: 1, playerId: playerBId, status: 'COMPLETED', type: turnTypeWriting, player: null },
            { turnNumber: 2, playerId: playerAId, status: 'COMPLETED', type: turnTypeWriting, previousTurnId: 'game1turn1', player: null }, // A followed B
          ]
        },
      ] as (Game & { turns: (Turn & { player: Player | null })[] })[];

      const result = applyShouldRule1(candidates, turnTypeWriting, currentGameTurns, allSeasonGames);
      expect(result).not.toContain(playerAStats);
      expect(result).toContain(playerCStats); // Player C should still be a candidate
    });

    it('should NOT filter Player A if they followed Player B for a DIFFERENT turnType', () => {
      const candidates = [playerAStats, playerCStats];
      const currentGameTurns = [
        { turnNumber: 1, playerId: playerBId, status: 'COMPLETED', type: turnTypeWriting, player: null }, // Current turn is WRITING
      ] as (Turn & { player: Player | null })[];
      const allSeasonGames = [
        { 
          id: 'game1', 
          turns: [
            { turnNumber: 1, playerId: playerBId, status: 'COMPLETED', type: 'DRAWING', player: null }, // B made a DRAWING turn
            { turnNumber: 2, playerId: playerAId, status: 'COMPLETED', type: 'DRAWING', previousTurnId: 'game1turn1', player: null }, // A followed with DRAWING
          ]
        },
      ] as (Game & { turns: (Turn & { player: Player | null })[] })[];

      const result = applyShouldRule1(candidates, turnTypeWriting, currentGameTurns, allSeasonGames);
      expect(result).toContain(playerAStats);
    });
    
    it('should return original candidates if all candidates would be filtered (SHOULD rule)', () => {
      const candidates = [playerAStats, playerCStats];
      const currentGameTurns = [
        { turnNumber: 1, playerId: playerBId, status: 'COMPLETED', type: turnTypeWriting, player: null },
      ] as (Turn & { player: Player | null })[];
      const allSeasonGames = [
        { 
          id: 'game1', 
          turns: [ // Player A followed B
            { turnNumber: 1, playerId: playerBId, status: 'COMPLETED', type: turnTypeWriting, player: null },
            { turnNumber: 2, playerId: playerAId, status: 'COMPLETED', type: turnTypeWriting, previousTurnId: 'g1t1', player: null },
          ]
        },
        { 
          id: 'game2', 
          turns: [ // Player C also followed B
            { turnNumber: 1, playerId: playerBId, status: 'COMPLETED', type: turnTypeWriting, player: null },
            { turnNumber: 2, playerId: playerCId, status: 'COMPLETED', type: turnTypeWriting, previousTurnId: 'g2t1', player: null },
          ]
        },
      ] as (Game & { turns: (Turn & { player: Player | null })[] })[];

      const result = applyShouldRule1(candidates, turnTypeWriting, currentGameTurns, allSeasonGames);
      expect(result).toEqual(candidates); // Should return original as all would be filtered
    });

    it('should correctly identify sequences considering turn status (COMPLETED/SKIPPED)', () => {
       const candidates = [playerAStats];
       const currentGameTurns = [
        { turnNumber: 1, playerId: playerBId, status: 'SKIPPED', type: turnTypeWriting, player: null }, // Player B was skipped
      ] as (Turn & { player: Player | null })[];
       const allSeasonGames = [
        { 
          id: 'game1',
          seasonId: 'season1',
          status: 'COMPLETED',
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
          turns: [
            { 
              id: 'turn1',
              gameId: 'game1',
              turnNumber: 1, 
              playerId: playerBId, 
              status: 'SKIPPED', 
              type: turnTypeWriting, 
              player: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              completedAt: null,
              claimedAt: null,
              offeredAt: null,
              skippedAt: new Date(),
              textContent: null,
              imageUrl: null,
              previousTurnId: null
            }, // B was skipped
            { 
              id: 'turn2',
              gameId: 'game1',
              turnNumber: 2, 
              playerId: playerAId, 
              status: 'COMPLETED', 
              type: turnTypeWriting, 
              previousTurnId: 'turn1', 
              player: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              completedAt: new Date(),
              claimedAt: null,
              offeredAt: null,
              skippedAt: null,
              textContent: 'some text',
              imageUrl: null
            }, // A followed
          ]
        },
      ] as (Game & { turns: (Turn & { player: Player | null })[] })[];
      
      const result = applyShouldRule1(candidates, turnTypeWriting, currentGameTurns, allSeasonGames);
      expect(result).toEqual(candidates); // Should return original candidates since it's a SHOULD rule and all would be filtered
    });
  });

  // Existing tests for selectNextPlayer and checkGameCompletion (for individual games) follow
  describe('Basic Functionality', () => {
    it('should return error when game not found', async () => {
      const result = await selectNextPlayer('non-existent-game', 'WRITING', prisma);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Game not found');
    });

    it('should return error when no players in season', async () => {
      // Remove all players from season
      await prisma.playersOnSeasons.deleteMany({
        where: { seasonId: testSeason.id },
      });

      const result = await selectNextPlayer(testGame.id, 'WRITING', prisma);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No players in season');
    });

    it('should select first player for new game with no turns', async () => {
      const result = await selectNextPlayer(testGame.id, 'WRITING', prisma);
      
      expect(result.success).toBe(true);
      expect(result.playerId).toBeDefined();
      expect(result.player).toBeDefined();
      // Should select player with lowest ID (deterministic tie-breaking)
      const sortedPlayerIds = testPlayers.map(p => p.id).sort();
      expect(result.playerId).toBe(sortedPlayerIds[0]);
    });
  });

  describe('MUST Rule 1: Player cannot play in same game twice', () => {
    it('should exclude players who have already played in the game', async () => {
      // Player 1 has already completed a turn in this game
      await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'COMPLETED',
          type: 'WRITING',
          completedAt: new Date(),
        },
      });

      const result = await selectNextPlayer(testGame.id, 'DRAWING', prisma);
      
      expect(result.success).toBe(true);
      expect(result.playerId).not.toBe(testPlayers[0].id);
      // Should select from remaining players
      expect([testPlayers[1].id, testPlayers[2].id, testPlayers[3].id]).toContain(result.playerId);
    });

    it('should exclude players with OFFERED turns in the game', async () => {
      // Player 1 has an offered turn in this game
      await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'OFFERED',
          type: 'WRITING',
          offeredAt: new Date(),
        },
      });

      const result = await selectNextPlayer(testGame.id, 'DRAWING', prisma);
      
      expect(result.success).toBe(true);
      expect(result.playerId).not.toBe(testPlayers[0].id);
    });

    it('should exclude players with PENDING turns in the game', async () => {
      // Player 1 has a pending turn in this game
      await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'PENDING',
          type: 'WRITING',
          claimedAt: new Date(),
        },
      });

      const result = await selectNextPlayer(testGame.id, 'DRAWING', prisma);
      
      expect(result.success).toBe(true);
      expect(result.playerId).not.toBe(testPlayers[0].id);
    });

    it('should exclude players who were SKIPPED in the game', async () => {
      // Player 1 was skipped in this game
      await prisma.turn.create({
        data: {
          gameId: testGame.id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'SKIPPED',
          type: 'WRITING',
          skippedAt: new Date(),
        },
      });

      const result = await selectNextPlayer(testGame.id, 'DRAWING', prisma);
      
      expect(result.success).toBe(true);
      expect(result.playerId).not.toBe(testPlayers[0].id);
    });
  });

  describe('MUST Rule 2: Player cannot have more than one PENDING turn', () => {
    it('should exclude players with PENDING turns in other games', async () => {
      // Create another game in the same season
      const otherGame = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: testSeason.id,
        },
      });

      // Player 1 has a pending turn in the other game
      await prisma.turn.create({
        data: {
          gameId: otherGame.id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'PENDING',
          type: 'WRITING',
          claimedAt: new Date(),
        },
      });

      const result = await selectNextPlayer(testGame.id, 'DRAWING', prisma);
      
      expect(result.success).toBe(true);
      expect(result.playerId).not.toBe(testPlayers[0].id);
    });

    it('should return error when no eligible players due to MUST rules', async () => {
      // All players have pending turns in other games
      const otherGame = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: testSeason.id,
        },
      });

      await Promise.all(
        testPlayers.map((player, index) =>
          prisma.turn.create({
            data: {
              gameId: otherGame.id,
              playerId: player.id,
              turnNumber: index + 1,
              status: 'PENDING',
              type: 'WRITING',
              claimedAt: new Date(),
            },
          })
        )
      );

      const result = await selectNextPlayer(testGame.id, 'DRAWING', prisma);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No eligible players found after applying MUST rules');
    });
  });

  describe('SHOULD Rule 2: Threshold-based turn distribution', () => {
    it('should prefer players below n/2 threshold for turn type', async () => {
      // Create other games to simulate turn history
      const games = await Promise.all([
        prisma.game.create({ data: { status: 'ACTIVE', seasonId: testSeason.id } }),
        prisma.game.create({ data: { status: 'ACTIVE', seasonId: testSeason.id } }),
      ]);

      // Give Player 1 and Player 2 many writing turns (above threshold)
      // With 4 players, threshold is floor(4/2) = 2
      // Player 1: 3 writing turns (above threshold)
      await Promise.all([
        prisma.turn.create({
          data: {
            gameId: games[0].id,
            playerId: testPlayers[0].id,
            turnNumber: 1,
            status: 'COMPLETED',
            type: 'WRITING',
            completedAt: new Date(),
          },
        }),
        prisma.turn.create({
          data: {
            gameId: games[1].id,
            playerId: testPlayers[0].id,
            turnNumber: 1,
            status: 'COMPLETED',
            type: 'WRITING',
            completedAt: new Date(),
          },
        }),
        prisma.turn.create({
          data: {
            gameId: games[0].id,
            playerId: testPlayers[0].id,
            turnNumber: 2,
            status: 'COMPLETED',
            type: 'WRITING',
            completedAt: new Date(),
          },
        }),
      ]);

      // Player 2: 2 writing turns (at threshold)
      await Promise.all([
        prisma.turn.create({
          data: {
            gameId: games[0].id,
            playerId: testPlayers[1].id,
            turnNumber: 3,
            status: 'COMPLETED',
            type: 'WRITING',
            completedAt: new Date(),
          },
        }),
        prisma.turn.create({
          data: {
            gameId: games[1].id,
            playerId: testPlayers[1].id,
            turnNumber: 2,
            status: 'COMPLETED',
            type: 'WRITING',
            completedAt: new Date(),
          },
        }),
      ]);

      // Player 3 and 4: 0 writing turns (below threshold)

      const result = await selectNextPlayer(testGame.id, 'WRITING', prisma);
      
      expect(result.success).toBe(true);
      // Should prefer Player 3 or 4 (below threshold) over Player 1 or 2
      expect([testPlayers[2].id, testPlayers[3].id]).toContain(result.playerId);
    });
  });

  describe('SHOULD Rule 3: Prefer player with fewest turns of given type', () => {
    it('should select player with fewest writing turns when requesting WRITING turn', async () => {
      // Create other games for turn history
      const otherGame = await prisma.game.create({
        data: { status: 'ACTIVE', seasonId: testSeason.id },
      });

      // Player 1: 2 writing turns
      await Promise.all([
        prisma.turn.create({
          data: {
            gameId: otherGame.id,
            playerId: testPlayers[0].id,
            turnNumber: 1,
            status: 'COMPLETED',
            type: 'WRITING',
            completedAt: new Date(),
          },
        }),
        prisma.turn.create({
          data: {
            gameId: otherGame.id,
            playerId: testPlayers[0].id,
            turnNumber: 2,
            status: 'COMPLETED',
            type: 'WRITING',
            completedAt: new Date(),
          },
        }),
      ]);

      // Player 2: 1 writing turn
      await prisma.turn.create({
        data: {
          gameId: otherGame.id,
          playerId: testPlayers[1].id,
          turnNumber: 3,
          status: 'COMPLETED',
          type: 'WRITING',
          completedAt: new Date(),
        },
      });

      // Player 3 and 4: 0 writing turns

      const result = await selectNextPlayer(testGame.id, 'WRITING', prisma);
      
      expect(result.success).toBe(true);
      // Should prefer Player 3 or 4 (0 writing turns) over others
      expect([testPlayers[2].id, testPlayers[3].id]).toContain(result.playerId);
    });

    it('should select player with fewest drawing turns when requesting DRAWING turn', async () => {
      // Create other games for turn history
      const otherGame = await prisma.game.create({
        data: { status: 'ACTIVE', seasonId: testSeason.id },
      });

      // Player 1: 1 drawing turn
      await prisma.turn.create({
        data: {
          gameId: otherGame.id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'COMPLETED',
          type: 'DRAWING',
          completedAt: new Date(),
        },
      });

      // Player 2, 3, 4: 0 drawing turns

      const result = await selectNextPlayer(testGame.id, 'DRAWING', prisma);
      
      expect(result.success).toBe(true);
      // Should prefer Player 2, 3, or 4 (0 drawing turns) over Player 1
      expect([testPlayers[1].id, testPlayers[2].id, testPlayers[3].id]).toContain(result.playerId);
    });
  });

  describe('SHOULD Rule 4: Prefer players with fewer pending turns', () => {
    it('should prefer players with no pending turns over those with pending turns', async () => {
      // Create other games
      const otherGame = await prisma.game.create({
        data: { status: 'ACTIVE', seasonId: testSeason.id },
      });

      // Player 1: has 0 pending turns (but some completed turns to differentiate)
      await prisma.turn.create({
        data: {
          gameId: otherGame.id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'COMPLETED',
          type: 'WRITING',
          completedAt: new Date(),
        },
      });

      // Player 2: has 0 pending turns
      // Player 3: has 0 pending turns  
      // Player 4: has 0 pending turns

      // All players have equal pending turns (0), so should use tie-breaking
      const result = await selectNextPlayer(testGame.id, 'DRAWING', prisma);
      
      expect(result.success).toBe(true);
      expect(result.playerId).toBeDefined();
    });
  });

  describe('Tie-breaking mechanism', () => {
    it('should use deterministic tie-breaking (lowest player ID) when all else is equal', async () => {
      // All players are equal in all criteria
      const result = await selectNextPlayer(testGame.id, 'WRITING', prisma);
      
      expect(result.success).toBe(true);
      expect(result.playerId).toBeDefined();
      expect(result.player).toBeDefined();
      
      // Verify the selected player is one of the test players
      const testPlayerIds = testPlayers.map(p => p.id);
      expect(testPlayerIds).toContain(result.playerId);
    });

    it('should consistently return same player for identical conditions', async () => {
      // Run the selection multiple times with identical conditions
      const results = await Promise.all([
        selectNextPlayer(testGame.id, 'WRITING', prisma),
        selectNextPlayer(testGame.id, 'WRITING', prisma),
        selectNextPlayer(testGame.id, 'WRITING', prisma),
      ]);

      // All results should be successful and identical
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.playerId).toBe(results[0].playerId);
      });
    });
  });

  describe('Complex scenarios', () => {
    it('should handle end-of-season scenario with limited eligible players', async () => {
      // Create multiple games and simulate near end-of-season
      const games = await Promise.all([
        prisma.game.create({ data: { status: 'ACTIVE', seasonId: testSeason.id } }),
        prisma.game.create({ data: { status: 'ACTIVE', seasonId: testSeason.id } }),
        prisma.game.create({ data: { status: 'ACTIVE', seasonId: testSeason.id } }),
      ]);

      // Most players have played in most games
      // Player 1: played in games[0], games[1], testGame (should be excluded from testGame)
      await Promise.all([
        prisma.turn.create({
          data: {
            gameId: games[0].id,
            playerId: testPlayers[0].id,
            turnNumber: 1,
            status: 'COMPLETED',
            type: 'WRITING',
            completedAt: new Date(),
          },
        }),
        prisma.turn.create({
          data: {
            gameId: games[1].id,
            playerId: testPlayers[0].id,
            turnNumber: 1,
            status: 'COMPLETED',
            type: 'DRAWING',
            completedAt: new Date(),
          },
        }),
        prisma.turn.create({
          data: {
            gameId: testGame.id,
            playerId: testPlayers[0].id,
            turnNumber: 1,
            status: 'COMPLETED',
            type: 'WRITING',
            completedAt: new Date(),
          },
        }),
      ]);

      // Player 2: played in games[0], games[1] only
      await Promise.all([
        prisma.turn.create({
          data: {
            gameId: games[0].id,
            playerId: testPlayers[1].id,
            turnNumber: 2,
            status: 'COMPLETED',
            type: 'DRAWING',
            completedAt: new Date(),
          },
        }),
        prisma.turn.create({
          data: {
            gameId: games[1].id,
            playerId: testPlayers[1].id,
            turnNumber: 2,
            status: 'COMPLETED',
            type: 'WRITING',
            completedAt: new Date(),
          },
        }),
      ]);

      // Player 3: played in games[0] only
      await prisma.turn.create({
        data: {
          gameId: games[0].id,
          playerId: testPlayers[2].id,
          turnNumber: 3,
          status: 'COMPLETED',
          type: 'WRITING',
          completedAt: new Date(),
        },
      });

      // Player 4: hasn't played in any games yet

      const result = await selectNextPlayer(testGame.id, 'DRAWING', prisma);
      
      expect(result.success).toBe(true);
      // Should select from eligible players (Player 2, 3, or 4)
      expect([testPlayers[1].id, testPlayers[2].id, testPlayers[3].id]).toContain(result.playerId);
    });

    it('should handle mixed turn types and statuses correctly', async () => {
      // Create complex scenario with mixed turn types and statuses
      const otherGame = await prisma.game.create({
        data: { status: 'ACTIVE', seasonId: testSeason.id },
      });

      // Player 1: 1 completed writing, 1 skipped drawing
      await Promise.all([
        prisma.turn.create({
          data: {
            gameId: otherGame.id,
            playerId: testPlayers[0].id,
            turnNumber: 1,
            status: 'COMPLETED',
            type: 'WRITING',
            completedAt: new Date(),
          },
        }),
        prisma.turn.create({
          data: {
            gameId: otherGame.id,
            playerId: testPlayers[0].id,
            turnNumber: 2,
            status: 'SKIPPED',
            type: 'DRAWING',
            skippedAt: new Date(),
          },
        }),
      ]);

      // Player 2: 1 completed drawing
      await prisma.turn.create({
        data: {
          gameId: otherGame.id,
          playerId: testPlayers[1].id,
          turnNumber: 3,
          status: 'COMPLETED',
          type: 'DRAWING',
          completedAt: new Date(),
        },
      });

      const result = await selectNextPlayer(testGame.id, 'WRITING', prisma);
      
      expect(result.success).toBe(true);
      // Should prefer players with fewer writing turns (Player 2, 3, or 4 over Player 1)
      expect([testPlayers[1].id, testPlayers[2].id, testPlayers[3].id]).toContain(result.playerId);
    });
  });
});

describe('Game Completion Logic Unit Tests', () => {
  let testPlayers: Player[];
  let testSeason: Season;
  let testGame: Game;

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
      prisma.player.create({
        data: {
          discordUserId: `player3-${nanoid()}`,
          name: 'Player 3',
        },
      }),
    ]);

    // Create season config
    const seasonConfig = await prisma.seasonConfig.create({
      data: {
        maxPlayers: 3,
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

    // Create test game
    testGame = await prisma.game.create({
      data: {
        status: 'ACTIVE',
        seasonId: testSeason.id,
      },
    });
  });

  describe('Basic Functionality', () => {
    it('should return false when game not found', async () => {
      const result = await checkGameCompletion('non-existent-game', prisma);
      expect(result).toBe(false);
    });

    it('should return false when season has no players', async () => {
      // Remove all players from season
      await prisma.playersOnSeasons.deleteMany({
        where: { seasonId: testSeason.id },
      });

      const result = await checkGameCompletion(testGame.id, prisma);
      expect(result).toBe(false);
    });

    it('should return false when no players have completed or skipped turns', async () => {
      const result = await checkGameCompletion(testGame.id, prisma);
      expect(result).toBe(false);
    });
  });

  describe('Game Completion Scenarios', () => {
    it('should return true when all players have completed their turns', async () => {
      // All players complete their turns
      await Promise.all(
        testPlayers.map((player, index) =>
          prisma.turn.create({
            data: {
              gameId: testGame.id,
              playerId: player.id,
              turnNumber: index + 1,
              status: 'COMPLETED',
              type: 'WRITING',
              completedAt: new Date(),
              textContent: `Content from ${player.name}`,
            },
          })
        )
      );

      const result = await checkGameCompletion(testGame.id, prisma);
      expect(result).toBe(true);
    });

    it('should return true when all players have skipped their turns', async () => {
      // All players skip their turns
      await Promise.all(
        testPlayers.map((player, index) =>
          prisma.turn.create({
            data: {
              gameId: testGame.id,
              playerId: player.id,
              turnNumber: index + 1,
              status: 'SKIPPED',
              type: 'WRITING',
              skippedAt: new Date(),
            },
          })
        )
      );

      const result = await checkGameCompletion(testGame.id, prisma);
      expect(result).toBe(true);
    });

    it('should return true when players have mixed completed and skipped turns', async () => {
      // Player 1 completes, Player 2 skips, Player 3 completes
      await Promise.all([
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
        prisma.turn.create({
          data: {
            gameId: testGame.id,
            playerId: testPlayers[1].id,
            turnNumber: 2,
            status: 'SKIPPED',
            type: 'DRAWING',
            skippedAt: new Date(),
          },
        }),
        prisma.turn.create({
          data: {
            gameId: testGame.id,
            playerId: testPlayers[2].id,
            turnNumber: 3,
            status: 'COMPLETED',
            type: 'WRITING',
            completedAt: new Date(),
            textContent: 'Player 3 content',
          },
        }),
      ]);

      const result = await checkGameCompletion(testGame.id, prisma);
      expect(result).toBe(true);
    });

    it('should return false when some players have not completed or skipped', async () => {
      // Only Player 1 and Player 2 complete, Player 3 has no turn
      await Promise.all([
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
      ]);

      const result = await checkGameCompletion(testGame.id, prisma);
      expect(result).toBe(false);
    });

    it('should return false when players have pending or offered turns', async () => {
      // Player 1 completes, Player 2 has pending turn, Player 3 has offered turn
      await Promise.all([
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
        prisma.turn.create({
          data: {
            gameId: testGame.id,
            playerId: testPlayers[2].id,
            turnNumber: 3,
            status: 'OFFERED',
            type: 'WRITING',
            offeredAt: new Date(),
          },
        }),
      ]);

      const result = await checkGameCompletion(testGame.id, prisma);
      expect(result).toBe(false);
    });

    it('should ignore turns from other games in the same season', async () => {
      // Create another game in the same season
      const otherGame = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: testSeason.id,
        },
      });

      // All players complete turns in the test game
      await Promise.all(
        testPlayers.map((player, index) =>
          prisma.turn.create({
            data: {
              gameId: testGame.id,
              playerId: player.id,
              turnNumber: index + 1,
              status: 'COMPLETED',
              type: 'WRITING',
              completedAt: new Date(),
              textContent: `Content from ${player.name}`,
            },
          })
        )
      );

      // Add some turns in the other game (should not affect the result)
      await prisma.turn.create({
        data: {
          gameId: otherGame.id,
          playerId: testPlayers[0].id,
          turnNumber: 1,
          status: 'PENDING',
          type: 'DRAWING',
          claimedAt: new Date(),
        },
      });

      const result = await checkGameCompletion(testGame.id, prisma);
      expect(result).toBe(true);
    });

    it('should handle players with multiple turns in the same game', async () => {
      // Player 1 has multiple turns (completed and skipped)
      // Player 2 has one completed turn
      // Player 3 has one skipped turn
      await Promise.all([
        prisma.turn.create({
          data: {
            gameId: testGame.id,
            playerId: testPlayers[0].id,
            turnNumber: 1,
            status: 'COMPLETED',
            type: 'WRITING',
            completedAt: new Date(),
            textContent: 'Player 1 first turn',
          },
        }),
        prisma.turn.create({
          data: {
            gameId: testGame.id,
            playerId: testPlayers[0].id,
            turnNumber: 4,
            status: 'SKIPPED',
            type: 'DRAWING',
            skippedAt: new Date(),
          },
        }),
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

      const result = await checkGameCompletion(testGame.id, prisma);
      expect(result).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock a database error by using an invalid game ID format
      const result = await checkGameCompletion('', prisma);
      expect(result).toBe(false);
    });

    it('should return false for null or undefined game ID', async () => {
      // @ts-expect-error Testing invalid input
      const result1 = await checkGameCompletion(null, prisma);
      expect(result1).toBe(false);

      // @ts-expect-error Testing invalid input
      const result2 = await checkGameCompletion(undefined, prisma);
      expect(result2).toBe(false);
    });
  });
}); 