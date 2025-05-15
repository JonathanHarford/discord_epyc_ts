import { describe, it, expect, beforeEach, afterEach, vi, afterAll, beforeAll } from 'vitest';
import { ChatInputCommandInteraction } from 'discord.js';
import { JoinSeasonCommand } from '../../../src/commands/chat/joinSeason.js';
import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { Lang } from '../../../src/services/lang.js';

// Mock Lang service
vi.mock('../../../src/services/lang.js', () => ({
  Lang: {
    getRef: vi.fn().mockReturnValue('Mock response message')
  },
  Language: {
    Default: 'en-US'
  }
}));

describe('JoinSeasonCommand - Integration Tests', () => {
  let interaction: any; // Using any type for the mock interaction
  let prisma: PrismaClient;
  let testSeasonId: string;
  let closedSeasonId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    
    // Clean database and set up test data
    await prisma.$transaction([
      prisma.playersOnSeasons.deleteMany(),
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.seasonConfig.deleteMany(),
      prisma.player.deleteMany(),
    ]);

    // Create test seasons
    const seasonConfig = await prisma.seasonConfig.create({
      data: { id: nanoid() }
    });
    
    const closedSeasonConfig = await prisma.seasonConfig.create({
      data: { id: nanoid() }
    });

    // Create a test player for creating seasons
    const creator = await prisma.player.create({
      data: {
        id: nanoid(),
        discordUserId: `creator-${nanoid()}`,
        name: 'Creator'
      }
    });

    // Create an open season for testing
    const testSeason = await prisma.season.create({
      data: {
        id: nanoid(),
        name: 'Test Open Season',
        status: 'OPEN',
        configId: seasonConfig.id,
        creatorId: creator.id
      }
    });
    testSeasonId = testSeason.id;

    // Create a closed season for testing
    const closedSeason = await prisma.season.create({
      data: {
        id: nanoid(),
        name: 'Test Closed Season',
        status: 'ACTIVE', // Not joinable
        configId: closedSeasonConfig.id,
        creatorId: creator.id
      }
    });
    closedSeasonId = closedSeason.id;
  });

  afterAll(async () => {
    // Clean up after all tests
    await prisma.$transaction([
      prisma.playersOnSeasons.deleteMany(),
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.seasonConfig.deleteMany(),
      prisma.player.deleteMany(),
    ]);
    await prisma.$disconnect();
  });

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    
    // Create a mock interaction object directly
    interaction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      options: {
        getString: vi.fn()
      },
      user: {
        id: 'mock-discord-id',
        username: 'MockUser'
      }
    };
  });

  it('should successfully join an open season for a new player', async () => {
    // Set up mock for getString to return our test season ID
    interaction.options.getString = vi.fn().mockReturnValue(testSeasonId);

    // Make sure the Discord user doesn't exist yet
    const discordUserId = 'new-player-discord-id';
    interaction.user.id = discordUserId;
    interaction.user.username = 'NewPlayer';

    // Execute the command
    await JoinSeasonCommand.execute(interaction);

    // Verify the command called deferReply and editReply
    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.editReply).toHaveBeenCalled();

    // Verify the player was created and added to the season
    const player = await prisma.player.findUnique({
      where: { discordUserId }
    });
    expect(player).not.toBeNull();

    const playerOnSeason = await prisma.playersOnSeasons.findUnique({
      where: {
        playerId_seasonId: {
          playerId: player!.id,
          seasonId: testSeasonId
        }
      }
    });
    expect(playerOnSeason).not.toBeNull();
  });

  it('should successfully join an open season for an existing player', async () => {
    // Create an existing player first
    const discordUserId = 'existing-player-discord-id';
    const existingPlayer = await prisma.player.create({
      data: {
        id: nanoid(),
        discordUserId,
        name: 'ExistingPlayer'
      }
    });

    // Set up mock for getString to return our test season ID
    interaction.options.getString = vi.fn().mockReturnValue(testSeasonId);
    interaction.user.id = discordUserId;

    // Execute the command
    await JoinSeasonCommand.execute(interaction);

    // Verify the command called deferReply and editReply
    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.editReply).toHaveBeenCalled();

    // Verify the player was added to the season
    const playerOnSeason = await prisma.playersOnSeasons.findUnique({
      where: {
        playerId_seasonId: {
          playerId: existingPlayer.id,
          seasonId: testSeasonId
        }
      }
    });
    expect(playerOnSeason).not.toBeNull();
  });

  it('should return an error for a non-existent season', async () => {
    // Set up mock for getString to return a non-existent season ID
    const nonExistentSeasonId = 'non-existent-season-id';
    interaction.options.getString = vi.fn().mockReturnValue(nonExistentSeasonId);

    // Execute the command
    await JoinSeasonCommand.execute(interaction);

    // Verify Lang.getRef was called with the correct error key
    expect(Lang.getRef).toHaveBeenCalledWith(
      'joinCommand.join_season_error_not_found',
      expect.any(String),
      expect.objectContaining({ seasonId: nonExistentSeasonId })
    );
  });

  it('should return an error for a closed season', async () => {
    // Set up mock for getString to return our closed season ID
    interaction.options.getString = vi.fn().mockReturnValue(closedSeasonId);

    // Execute the command
    await JoinSeasonCommand.execute(interaction);

    // Verify Lang.getRef was called with the correct error key
    expect(Lang.getRef).toHaveBeenCalledWith(
      'joinCommand.join_season_error_not_open',
      expect.any(String),
      expect.objectContaining({ 
        seasonId: closedSeasonId,
        status: 'ACTIVE'
      })
    );
  });

  it('should return an error if player already joined the season', async () => {
    // Create a player who has already joined the test season
    const discordUserId = 'already-joined-discord-id';
    const player = await prisma.player.create({
      data: {
        id: nanoid(),
        discordUserId,
        name: 'AlreadyJoinedPlayer'
      }
    });

    // Add the player to the season
    await prisma.playersOnSeasons.create({
      data: {
        playerId: player.id,
        seasonId: testSeasonId
      }
    });

    // Set up mock for getString to return our test season ID
    interaction.options.getString = vi.fn().mockReturnValue(testSeasonId);
    interaction.user.id = discordUserId;

    // Execute the command
    await JoinSeasonCommand.execute(interaction);

    // Verify that the Lang.getRef was called with the already joined error key
    expect(Lang.getRef).toHaveBeenCalledWith(
      expect.stringContaining('season_join_error_already_joined'),
      expect.any(String),
      expect.any(Object)
    );
  });
}); 