import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient, Player } from '@prisma/client';
import { SeasonService, NewSeasonOptions } from '../../src/services/SeasonService.js';
import { nanoid } from 'nanoid';

// Mock the logger to prevent console output during tests
vi.mock('../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));


describe('SeasonService', () => {
  let prisma: PrismaClient;
  let seasonService: SeasonService;
  let testPlayer: Player;

  beforeEach(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    });
    seasonService = new SeasonService(prisma);

    // Clean up database before each test
    await prisma.season.deleteMany({});
    await prisma.seasonConfig.deleteMany({});
    await prisma.player.deleteMany({});


    // Create a test player for creator context
    testPlayer = await prisma.player.create({
      data: {
        discordUserId: `test-user-${nanoid()}`,
        name: 'Test User',
      },
    });
  });

  afterEach(async () => {
    // Clean up any created data
    // Cascading deletes should handle related PlayersOnSeasons, Games, Turns
    // but SeasonConfig needs to be deleted separately if not cascaded from Season
    // and if Seasons are not deleted, then Player needs to be deleted last
    // if it was a creator.
    // For simplicity, explicitly delete what we know we created or might have created.
    
    // The order is important due to foreign key constraints.
    // Seasons depend on SeasonConfig and Player (creator)
    // PlayersOnSeasons depends on Player and Season
    
    // 1. Delete records that depend on Seasons or Players
    await prisma.playersOnSeasons.deleteMany({}); // In case any players joined seasons

    // 2. Delete Seasons (which should cascade to Games and Turns if schema is set up correctly)
    // but SeasonConfig is NOT set to cascade delete when Season is deleted.
    // However, Season has a required relation to SeasonConfig via configId,
    // and SeasonConfig is created *by* the SeasonService.createSeason method.
    // The service creates a config then a season.
    // If we delete season, the config it points to remains.
    // If we delete config, and a season points to it, that will fail.

    // Let's delete in the reverse order of creation or by what has fewest dependencies
    
    await prisma.season.deleteMany({});
    await prisma.seasonConfig.deleteMany({});
    await prisma.player.deleteMany({}); // Clean up the test player

    await prisma.$disconnect();
  });

  it('should create a new season successfully with minimal options', async () => {
    const seasonName = `Test Season ${nanoid()}`;
    const options: NewSeasonOptions = {
      name: seasonName,
      creatorDiscordId: testPlayer.discordUserId,
    };

    const result = await seasonService.createSeason(options);

    expect(result.type).toBe('success');
    expect(result.key).toBe('season_create_success');
    expect(result.data).toBeDefined();
    expect(result.data?.seasonName).toBe(seasonName);
    expect(result.data?.status).toBe('SETUP');

    const dbSeason = await prisma.season.findUnique({
      where: { id: result.data?.seasonId },
      include: { config: true, creator: true },
    });

    expect(dbSeason).not.toBeNull();
    expect(dbSeason?.name).toBe(seasonName);
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
    const seasonName = `Full Options Season ${nanoid()}`;
    const options: NewSeasonOptions = {
      name: seasonName,
      creatorDiscordId: testPlayer.discordUserId,
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
    expect(dbSeason?.name).toBe(seasonName);
    expect(dbSeason?.config.openDuration).toBe('3d');
    expect(dbSeason?.config.minPlayers).toBe(3);
    expect(dbSeason?.config.maxPlayers).toBe(10);
    expect(dbSeason?.config.turnPattern).toBe('drawing,writing,drawing');
    expect(dbSeason?.config.claimTimeout).toBe('6h');
    expect(dbSeason?.config.writingTimeout).toBe('12h');
    expect(dbSeason?.config.drawingTimeout).toBe('24h');
  });

  it('should return error if season name is taken', async () => {
    const seasonName = `Taken Name Season ${nanoid()}`;
    // Create a season first
    await seasonService.createSeason({
      name: seasonName,
      creatorDiscordId: testPlayer.discordUserId,
    });

    // Attempt to create another with the same name
    const options: NewSeasonOptions = {
      name: seasonName,
      creatorDiscordId: testPlayer.discordUserId,
    };
    const result = await seasonService.createSeason(options);

    expect(result.type).toBe('error');
    expect(result.key).toBe('season_create_error_name_taken');
    expect(result.data?.name).toBe(seasonName);
  });

  it('should return error if creator discord ID is not found', async () => {
    const nonExistentDiscordId = `non-existent-${nanoid()}`;
    const options: NewSeasonOptions = {
      name: `Test Season ${nanoid()}`,
      creatorDiscordId: nonExistentDiscordId,
    };

    const result = await seasonService.createSeason(options);

    expect(result.type).toBe('error');
    expect(result.key).toBe('season_create_error_creator_not_found');
    expect(result.data?.discordUserId).toBe(nonExistentDiscordId);
  });

  it('should return error if maxPlayers is less than minPlayers', async () => {
    const options: NewSeasonOptions = {
      name: `MinMax Test Season ${nanoid()}`,
      creatorDiscordId: testPlayer.discordUserId,
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
    const seasonName = `Equal MinMax Season ${nanoid()}`;
    const options: NewSeasonOptions = {
      name: seasonName,
      creatorDiscordId: testPlayer.discordUserId,
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
    const seasonName = `Default Config Season ${nanoid()}`;
    const options: NewSeasonOptions = {
      name: seasonName,
      creatorDiscordId: testPlayer.discordUserId,
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

}); 