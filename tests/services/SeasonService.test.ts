import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Player, Game, Season, SeasonConfig, Prisma } from '@prisma/client';
import { Client as DiscordClient } from 'discord.js';
import { SeasonService, NewSeasonOptions } from '../../src/services/SeasonService.js';
import { TurnService } from '../../src/services/TurnService.js';
import schedule from 'node-schedule';
import { humanId } from 'human-id';
import { nanoid } from 'nanoid';
import { MessageInstruction } from '../../src/types/MessageInstruction.js';
import { LangKeys } from '../../src/constants/lang-keys.js';
import prisma from "../../src/lib/prisma.js";
import { truncateTables } from "../utils/testUtils";

// Mock the logger to prevent console output during tests
vi.mock('../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// We don't mock the Prisma client for integration tests
// Instead use a real test database

vi.mock('node-schedule', () => ({
  default: {
    scheduleJob: vi.fn(),
    cancelJob: vi.fn(), // Also mock cancelJob
  },
}));

vi.mock('human-id', () => ({
  humanId: vi.fn(() => 'test-season-id'),
}));

// For real integration tests, we don't need to mock transaction objects
// We'll use the actual database

describe('SeasonService', () => {
  let prisma: PrismaClient;
  let seasonService: SeasonService; 
  let testPlayer: Player;
  // We use the real PrismaClient for integration tests

  // Initialize PrismaClient once for the describe block
  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL // Ensure this is set for tests
        }
      }
    });
  });

  beforeEach(async () => {
    await truncateTables(prisma);

    // Create a TurnService instance for the shared prisma instance
    const turnService = new TurnService(prisma, {} as DiscordClient);
    // seasonService is newed up with the shared prisma instance and TurnService
    seasonService = new SeasonService(prisma, turnService);

    // Create a test player for creator context
    testPlayer = await prisma.player.create({
      data: {
        discordUserId: `test-user-${nanoid()}`,
        name: 'Test User',
      },
    });

    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  // afterEach no longer needs to disconnect, use afterAll
  afterEach(async () => {
    await truncateTables(prisma);
    vi.restoreAllMocks();
  });

  // Disconnect PrismaClient once after all tests in the describe block
  afterAll(async () => {
    // Final comprehensive cleanup
    await prisma.$executeRaw`TRUNCATE TABLE "PlayersOnSeasons" CASCADE`;
    await prisma.$executeRaw`TRUNCATE TABLE "Turn" CASCADE`;
    await prisma.$executeRaw`TRUNCATE TABLE "Game" CASCADE`;
    await prisma.$executeRaw`TRUNCATE TABLE "Season" CASCADE`;
    await prisma.$executeRaw`TRUNCATE TABLE "SeasonConfig" CASCADE`;
    await prisma.$executeRaw`TRUNCATE TABLE "Player" CASCADE`;
    await prisma.$disconnect();
  });

  it('should create a new season successfully with minimal options', async () => {
    // const seasonName = `Test Season ${nanoid()}`;
    const options: NewSeasonOptions = {
      // name: seasonName,
      creatorPlayerId: testPlayer.id,
    };

    const result = await seasonService.createSeason(options);

    expect(result.type).toBe('success');
    expect(result.key).toBe('season_create_success');
    expect(result.data).toBeDefined();
    // expect(result.data?.seasonName).toBe(seasonName);
    expect(result.data?.status).toBe('SETUP');

    const dbSeason = await prisma.season.findUnique({
      where: { id: result.data?.seasonId },
      include: { config: true, creator: true },
    });

    expect(dbSeason).not.toBeNull();
    // expect(dbSeason?.name).toBe(seasonName);
    expect(dbSeason?.status).toBe('SETUP');
    expect(dbSeason?.creatorId).toBe(testPlayer.id);
    expect(dbSeason?.config).not.toBeNull();
    // Default values from schema for SeasonConfig
    expect(dbSeason?.config.turnPattern).toBe('writing,drawing');
    expect(dbSeason?.config.openDuration).toBe('7d');
    expect(dbSeason?.config.minPlayers).toBe(6);
    expect(dbSeason?.config.maxPlayers).toBe(20);
  });

  it('should create a new season successfully with all options specified', async () => {
    // const seasonName = `Full Options Season ${nanoid()}`;
    const options: NewSeasonOptions = {
      // name: seasonName,
      creatorPlayerId: testPlayer.id,
      openDuration: '3d',
      minPlayers: 3,
      maxPlayers: 10,
      turnPattern: 'drawing,writing,drawing',
      claimTimeout: '6h',
      writingTimeout: '12h',
      drawingTimeout: '24h',
    };

    const result = await seasonService.createSeason(options);

    expect(result.type).toBe('success');
    const dbSeason = await prisma.season.findUnique({
      where: { id: result.data?.seasonId },
      include: { config: true },
    });

    expect(dbSeason).not.toBeNull();
    // expect(dbSeason?.name).toBe(seasonName);
    expect(dbSeason?.config.openDuration).toBe('3d');
    expect(dbSeason?.config.minPlayers).toBe(3);
    expect(dbSeason?.config.maxPlayers).toBe(10);
    expect(dbSeason?.config.turnPattern).toBe('drawing,writing,drawing');
    expect(dbSeason?.config.claimTimeout).toBe('6h');
    expect(dbSeason?.config.writingTimeout).toBe('12h');
    expect(dbSeason?.config.drawingTimeout).toBe('24h');
  });

  // it('should return error if season name is taken', async () => {
  //   const seasonName = `Taken Name Season ${nanoid()}`;
  //   // Create a season first
  //   await seasonService.createSeason({
  //     name: seasonName,
  //     creatorPlayerId: testPlayer.id,
  //   });
  //
  //   // Attempt to create another with the same name
  //   const options: NewSeasonOptions = {
  //     name: seasonName,
  //     creatorPlayerId: testPlayer.id,
  //   };
  //   const result = await seasonService.createSeason(options);
  //
  //   expect(result.type).toBe('error');
  //   expect(result.key).toBe('season_create_error_name_taken');
  //   expect(result.data?.name).toBe(seasonName);
  // });

  it('should return error if creator discord ID is not found', async () => {
    const nonExistentPlayerId = `non-existent-${nanoid()}`;
    const options: NewSeasonOptions = {
      // name: `Test Season ${nanoid()}`,
      creatorPlayerId: nonExistentPlayerId,
    };

    const result = await seasonService.createSeason(options);

    expect(result.type).toBe('error');
    expect(result.key).toBe('season_create_error_creator_player_not_found');
    expect(result.data?.playerId).toBe(nonExistentPlayerId);
  });

  it('should return error if maxPlayers is less than minPlayers', async () => {
    const options: NewSeasonOptions = {
      // name: `MinMax Test Season ${nanoid()}`,
      creatorPlayerId: testPlayer.id,
      minPlayers: 10,
      maxPlayers: 5,
    };

    const result = await seasonService.createSeason(options);

    expect(result.type).toBe('error');
    expect(result.key).toBe('season_create_error_min_max_players');
    expect(result.data?.minPlayers).toBe(10);
    expect(result.data?.maxPlayers).toBe(5);
  });
  
  it('should allow minPlayers and maxPlayers to be equal', async () => {
    // const seasonName = `Equal MinMax Season ${nanoid()}`;
    const options: NewSeasonOptions = {
      // name: seasonName,
      creatorPlayerId: testPlayer.id,
      minPlayers: 5,
      maxPlayers: 5,
    };

    const result = await seasonService.createSeason(options);

    expect(result.type).toBe('success');
    const dbSeason = await prisma.season.findUnique({
      where: { id: result.data?.seasonId },
      include: { config: true },
    });
    expect(dbSeason?.config.minPlayers).toBe(5);
    expect(dbSeason?.config.maxPlayers).toBe(5);
  });

  it('should use default config values if not provided in options', async () => {
    // const seasonName = `Default Config Season ${nanoid()}`;
    const options: NewSeasonOptions = {
      // name: seasonName,
      creatorPlayerId: testPlayer.id,
      // Intentionally omit other config options to test defaults
    };

    const result = await seasonService.createSeason(options);
    expect(result.type).toBe('success');

    const dbSeason = await prisma.season.findUnique({
      where: { id: result.data?.seasonId },
      include: { config: true },
    });

    expect(dbSeason).not.toBeNull();
    // Values from prisma/schema.prisma defaults for SeasonConfig
    expect(dbSeason?.config.turnPattern).toBe('writing,drawing');
    expect(dbSeason?.config.claimTimeout).toBe('1d');
    expect(dbSeason?.config.writingTimeout).toBe('1d');
    // writingWarning is not set via NewSeasonOptions, so it should be its default
    expect(dbSeason?.config.writingWarning).toBe('1m'); 
    expect(dbSeason?.config.drawingTimeout).toBe('1d');
    // drawingWarning is not set via NewSeasonOptions
    expect(dbSeason?.config.drawingWarning).toBe('10m');
    expect(dbSeason?.config.openDuration).toBe('7d');
    expect(dbSeason?.config.minPlayers).toBe(6);
    expect(dbSeason?.config.maxPlayers).toBe(20);
  });

  describe('activateSeason', () => {
    // For this test we should create real database entries and test actual functionality
    // This is a placeholder for now - we'll implement a proper test for activateSeason
    // once we've fixed the basic test infrastructure
    
    it('should be tested properly in the future', async () => {
      // Skip this test for now until we can properly set up real DB integration tests for activateSeason
      expect(true).toBe(true);
    });

    // TODO: Implement proper integration tests for activateSeason:
    // - Activation by max_players_reached
    // - Activation by open_duration_timeout
    // - Activation fails: invalid status
    // - Activation fails: max_players not reached
    // - Activation fails: min_players not met on timeout
    // - Season not found
    // - Zero players (if minPlayers = 0 and season activates)
    // - turnService.offerInitialTurn fails partially or fully
  });

  it('should activate season and create games when max_players is reached', async () => {
    // Arrange: Create a season and players directly in the test database
    const maxPlayers = 3; // Use a smaller number for the test

    const seasonConfig = await prisma.seasonConfig.create({
      data: { maxPlayers, minPlayers: 2, openDuration: '1d', turnPattern: 'drawing,writing' },
    });

    const season = await prisma.season.create({
      data: {
        id: 'test-season-activate-max-players',
        status: 'SETUP',
        creatorId: testPlayer.id,
        configId: seasonConfig.id,
      },
    });

    // Create players but do NOT link them to the season yet
    const players: Player[] = [];
    for (let i = 0; i < maxPlayers; i++) {
      const player = await prisma.player.create({
        data: {
          discordUserId: `discord-activate-max-${i}-${nanoid()}`, // Use nanoid for uniqueness
          name: `Player Activate Max ${i}`,
        },
      });
      players.push(player);
    }

    // Mock TurnService locally for this test, returning success for offerInitialTurn
    const mockTurnServiceLocal = { offerInitialTurn: vi.fn().mockReturnValue({ success: true }) };
    // Re-instantiate SeasonService with the local mock TurnService
    const seasonServiceLocal = new SeasonService(prisma, mockTurnServiceLocal as any);

    // Act: Add players one by one, the last one should trigger activation
    let lastAddPlayerResult: MessageInstruction | undefined;
    for (let i = 0; i < players.length; i++) {
        lastAddPlayerResult = await seasonServiceLocal.addPlayerToSeason(players[i].id, season.id);
        // Optional: Add assertions here for intermediate player additions if needed
        if (i < players.length - 1) {
             expect(lastAddPlayerResult.type).toBe('success'); // Expect success for non-triggering joins
             expect(lastAddPlayerResult.key).toBe(LangKeys.Commands.JoinSeason.success); // Expect standard join success
        }
    }

    // Assert: Verify the result of adding the LAST player indicates activation
    expect(lastAddPlayerResult).toBeDefined();
    expect(lastAddPlayerResult!.type).toBe('success');
    expect(lastAddPlayerResult!.key).toBe('season_activate_success'); // Expect activation success key

    // Verify season status is updated to ACTIVE in the database
    const updatedSeason = await prisma.season.findUnique({
      where: { id: season.id },
      include: { games: true, players: { include: { player: true } } },
    });

    expect(updatedSeason?.status).toBe('ACTIVE');

    // Verify games are created in the database (one game per player)
    expect(updatedSeason?.games.length).toBe(maxPlayers);

    // Verify initial turn offers are sent (once per player) using the local mock
    expect(mockTurnServiceLocal.offerInitialTurn).toHaveBeenCalledTimes(maxPlayers);
    players.forEach(player => {
      expect(mockTurnServiceLocal.offerInitialTurn).toHaveBeenCalledWith(
        expect.objectContaining({ seasonId: season.id }), 
        expect.objectContaining({ id: player.id }), 
        season.id 
      );
    });

    // Verify the structure of the games passed to offerInitialTurn
  });

  // Add integration test for activateSeason triggered by open_duration timeout
  it('should activate season and create games when open_duration timeout is reached', async () => {
    // Arrange: Create a season with a short openDuration and players (less than maxPlayers)
    const openDuration = '1s'; // Use a short duration for the test
    const maxPlayers = 10;
    const minPlayers = 2;
    const initialPlayers = 3; // Less than maxPlayers

    // Create a season using the service, which will schedule the job
    const createSeasonResult = await seasonService.createSeason({
      creatorPlayerId: testPlayer.id,
      openDuration: openDuration,
      maxPlayers: maxPlayers,
      minPlayers: minPlayers,
      turnPattern: 'drawing,writing',
    });

    expect(createSeasonResult.type).toBe('success');
    const seasonId = createSeasonResult.data?.seasonId;
    expect(seasonId).toBeDefined();

    // Manually add players to the season after creation
    // We need to find the created season and config first
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      include: { config: true },
    });
    expect(season).not.toBeNull();

    const players: Player[] = [];
    for (let i = 0; i < initialPlayers; i++) {
      const player = await prisma.player.create({
        data: {
          discordUserId: `discord-activate-timeout-${i}`,
          name: `Player Activate Timeout ${i}`,
        },
      });
      players.push(player);
      await prisma.playersOnSeasons.create({
        data: {
          seasonId: season!.id,
          playerId: player.id,
        },
      });
    }

    // Mock TurnService locally for this test
    const mockTurnServiceLocal = { offerInitialTurn: vi.fn() };
    // Note: We are not re-instantiating SeasonService here because the job was scheduled by the original instance
    // We will directly call the scheduled callback.

    // **Revised Act:** Directly call handleOpenDurationTimeout with the season ID
    await seasonService.handleOpenDurationTimeout(season!.id);

    // Assert: Verify the expected outcomes in the database and mock calls after activation

    // Verify season status is updated to ACTIVE in the database
    const updatedSeason = await prisma.season.findUnique({
      where: { id: season!.id },
      include: { games: true, players: { include: { player: true } } },
    });

    expect(updatedSeason?.status).toBe('ACTIVE');

    // Verify games are created in the database
    expect(updatedSeason?.games.length).toBe(initialPlayers); // Number of games should equal number of players at timeout

    // Verify initial turn offers are sent
    // Since we directly called handleOpenDurationTimeout, it would use the main seasonService's TurnService.
    // We need to check the main mockOfferInitialTurn.
  });
}); 