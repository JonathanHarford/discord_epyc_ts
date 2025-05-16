import { PrismaClient } from '@prisma/client';
import { SeasonService } from '../../src/services/SeasonService.js';
import { nanoid } from 'nanoid';
import { describe, it, expect, beforeEach, afterAll } from 'vitest'; // Import Vitest globals

// Use a separate Prisma client for tests to manage lifecycle
const prisma = new PrismaClient();

describe('SeasonService Integration Tests', () => {
  let seasonService: SeasonService;

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
    seasonService = new SeasonService(prisma);
  });

  // Disconnect Prisma client after all tests
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Test case for successfully joining a season
  it('should successfully add a player to an open season', async () => {
    // Create a test player and season first
    const creator = await prisma.player.create({
      data: { discordUserId: `creator-${nanoid()}`, name: 'Creator' },
    });

    const joiningPlayer = await prisma.player.create({
      data: { discordUserId: `joining-${nanoid()}`, name: 'Joining Player' },
    });

    // Create a SeasonConfig first, then connect it
    const seasonConfig = await prisma.seasonConfig.create({
      data: {
        id: nanoid(),
        // Add any default/required config fields here if necessary
      }
    });

    const season = await prisma.season.create({
      data: {
        id: nanoid(),
        status: 'SETUP', // Should be joinable in SETUP or OPEN
        creatorId: creator.id,
        configId: seasonConfig.id, // Connect to the created config
      },
    });

    const result = await seasonService.addPlayerToSeason(joiningPlayer.id, season.id);
    if (result.type === 'error') {
      console.error('addPlayerToSeason failed in test:', result.key, result.data); // Log if it fails
    }
    expect(result.type).toBe('success');
    expect(result.key).toBe('season_join_success'); 

    // Verify the player was added to the season in the database
    const updatedSeason = await prisma.season.findUnique({
      where: { id: season.id },
      include: { players: { include: { player: true } } }, // Include player details
    });

    expect(updatedSeason?.players.length).toBe(1);
    // Check against the internal player ID now
    expect(updatedSeason?.players[0]?.playerId).toBe(joiningPlayer.id);
  });

  it('should return "season_join_error_season_not_found" when trying to join a non-existent season', async () => {
    const player = await prisma.player.create({ data: { discordUserId: `test-${nanoid()}`, name: 'Test Player' } });
    const result = await seasonService.addPlayerToSeason(player.id, 'non-existent-season-id');
    expect(result.type).toBe('error');
    expect(result.key).toBe('season_join_error_season_not_found');
  });

  it('should return "season_join_error_not_open" when trying to join a season that is not in SETUP or OPEN state', async () => {
    const creator = await prisma.player.create({ data: { discordUserId: `creator-${nanoid()}`, name: 'Creator' } });
    const joiningPlayer = await prisma.player.create({ data: { discordUserId: `joining-${nanoid()}`, name: 'Joining Player' } });
    const seasonConfig = await prisma.seasonConfig.create({ data: { id: nanoid() } });
    const season = await prisma.season.create({
      data: {
        id: nanoid(),
        status: 'ACTIVE', // Not joinable
        creatorId: creator.id,
        configId: seasonConfig.id,
      },
    });
    const result = await seasonService.addPlayerToSeason(joiningPlayer.id, season.id);
    expect(result.type).toBe('error');
    expect(result.key).toBe('season_join_error_not_open');
  });

  it('should return "season_join_error_already_joined" when a player tries to join a season they are already in', async () => {
    const creator = await prisma.player.create({ data: { discordUserId: `creator-${nanoid()}`, name: 'Creator' } });
    const seasonConfig = await prisma.seasonConfig.create({ data: { id: nanoid() } });
    const joiningPlayer = await prisma.player.create({ data: { discordUserId: `joining-${nanoid()}`, name: 'Joined Player'} });
    const season = await prisma.season.create({
      data: {
        id: nanoid(),
        status: 'SETUP',
        creatorId: creator.id,
        configId: seasonConfig.id,
        players: { create: { playerId: joiningPlayer.id } } // Player already in the season
      },
    });

    const result = await seasonService.addPlayerToSeason(joiningPlayer.id, season.id);
    expect(result.type).toBe('error');
    expect(result.key).toBe('season_join_error_already_joined');
  });

  it('should return "season_join_error_full" when trying to join a season that has reached its max player limit', async () => {
    const creator = await prisma.player.create({ data: { discordUserId: `creator-${nanoid()}`, name: 'Creator' } });
    const seasonConfig = await prisma.seasonConfig.create({ data: { id: nanoid(), maxPlayers: 1 } }); // Max players set to 1
    const existingPlayer = await prisma.player.create({ data: { discordUserId: `existing-${nanoid()}`, name: 'Existing Player' } });
    const joiningPlayer = await prisma.player.create({ data: { discordUserId: `joining-${nanoid()}`, name: 'Joining Player' } });
    const season = await prisma.season.create({
      data: {
        id: nanoid(),
        status: 'SETUP',
        creatorId: creator.id,
        configId: seasonConfig.id,
        players: { create: { playerId: existingPlayer.id } }, // Season is full with this player
      },
    });

    const result = await seasonService.addPlayerToSeason(joiningPlayer.id, season.id);
    expect(result.type).toBe('error');
    expect(result.key).toBe('season_join_error_full');
  });

  it('should return "season_join_error_player_not_found" when trying to join with a non-existent player ID', async () => {
    // Create a season for the test
    const creator = await prisma.player.create({ data: { discordUserId: `creator-${nanoid()}`, name: 'Creator' } });
    const seasonConfig = await prisma.seasonConfig.create({ data: { id: nanoid() } });
    const season = await prisma.season.create({
      data: {
        id: nanoid(),
        status: 'SETUP',
        creatorId: creator.id,
        configId: seasonConfig.id,
      },
    });

    const result = await seasonService.addPlayerToSeason('non-existent-player-id', season.id);
    expect(result.type).toBe('error');
    expect(result.key).toBe('season_join_error_player_not_found');
  });

  // TODO: Add unit tests for any extracted logic functions related to season joining (Subtask 703)
  // TODO: Manually test the /join season command in a test Discord server (Subtask 704)
}); 