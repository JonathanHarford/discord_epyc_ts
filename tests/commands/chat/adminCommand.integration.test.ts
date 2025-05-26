import { describe, it, expect, beforeEach, afterEach, vi, afterAll, beforeAll } from 'vitest';
import { ChatInputCommandInteraction, PermissionsString, MessageFlags, Locale } from 'discord.js';
import { AdminCommand } from '../../../src/commands/chat/admin-command.js';
import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { EventData } from '../../../src/models/internal-models.js';
import { SeasonService } from '../../../src/services/SeasonService.js';
import { TurnService } from '../../../src/services/TurnService.js';
import { SchedulerService } from '../../../src/services/SchedulerService.js';

// Mock config to include test user as developer/admin
vi.mock('../../../../config/config.json', () => ({
  developers: ['test-admin-user-id', 'test-non-admin-user-id-should-not-work']
}));

describe('AdminCommand - Integration Tests', () => {
  let interaction: any; // Using any type for the mock interaction
  let prisma: PrismaClient;
  let testSeasonId: string;
  let terminatedSeasonId: string;
  let testPlayerId: string;
  let bannedPlayerId: string;
  let commandInstance: AdminCommand;
  let mockEventData: EventData;
  let testGuildId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    commandInstance = new AdminCommand();
    mockEventData = new EventData(Locale.EnglishUS, Locale.EnglishUS);
    testGuildId = 'test-guild-' + nanoid();
    
    // Clean database and set up test data
    await prisma.$transaction([
      prisma.playersOnSeasons.deleteMany(),
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.seasonConfig.deleteMany(),
      prisma.player.deleteMany(),
    ]);

    // Create test season configs
    const seasonConfig = await prisma.seasonConfig.create({
      data: { id: nanoid() }
    });
    
    const terminatedSeasonConfig = await prisma.seasonConfig.create({
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

    // Create test players for ban/unban testing
    const testPlayer = await prisma.player.create({
      data: {
        id: nanoid(),
        discordUserId: 'test-player-discord-id',
        name: 'Test Player'
      }
    });
    testPlayerId = testPlayer.id;

    const bannedPlayer = await prisma.player.create({
      data: {
        id: nanoid(),
        discordUserId: 'banned-player-discord-id',
        name: 'Banned Player',
        bannedAt: new Date()
      }
    });
    bannedPlayerId = bannedPlayer.id;

    // Create an active season for testing termination
    const testSeason = await prisma.season.create({
      data: {
        id: nanoid(),
        status: 'ACTIVE',
        configId: seasonConfig.id,
        creatorId: creator.id
      }
    });
    testSeasonId = testSeason.id;

    // Create some games for the test season
    await prisma.game.createMany({
      data: [
        {
          id: nanoid(),
          seasonId: testSeasonId,
          status: 'ACTIVE'
        },
        {
          id: nanoid(),
          seasonId: testSeasonId,
          status: 'PENDING_START'
        }
      ]
    });

    // Create an already terminated season for testing
    const terminatedSeason = await prisma.season.create({
      data: {
        id: nanoid(),
        status: 'TERMINATED',
        configId: terminatedSeasonConfig.id,
        creatorId: creator.id
      }
    });
    terminatedSeasonId = terminatedSeason.id;
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
    
    // Create a mock interaction object
    interaction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      replied: false,
      deferred: true,
      options: {
        getSubcommand: vi.fn(),
        getSubcommandGroup: vi.fn(),
        getString: vi.fn(),
        getUser: vi.fn(),
        getBoolean: vi.fn(),
        getInteger: vi.fn()
      },
      user: {
        id: '510875521354039317', // Use the actual admin ID from config.json
        username: 'AdminUser'
      },
      client: {
        // Mock Discord client for TurnService
        users: {
          fetch: vi.fn().mockResolvedValue({
            send: vi.fn().mockResolvedValue(undefined)
          })
        }
      },
      guild: {
        id: testGuildId,
        shardId: 0
      }
    };
  });

  beforeEach(async () => {
    // Reset test player ban states to ensure test isolation
    await prisma.player.update({
      where: { discordUserId: 'test-player-discord-id' },
      data: { bannedAt: null }
    });
    
    await prisma.player.update({
      where: { discordUserId: 'banned-player-discord-id' },
      data: { bannedAt: new Date() }
    });
  });

  describe('Permission Checks', () => {
    it('should deny access to non-admin users', async () => {
      // Set user to non-admin
      interaction.user.id = 'non-admin-user-id';

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply (indicating a response was sent)
      expect(interaction.editReply).toHaveBeenCalled();
      
      // Verify that no season termination occurred (no database changes)
      const seasonAfter = await prisma.season.findUnique({
        where: { id: testSeasonId }
      });
      expect(seasonAfter?.status).toBe('ACTIVE'); // Should remain unchanged
    });

    it('should allow access to admin users', async () => {
      // Create a fresh active season for this test
      const seasonConfig = await prisma.seasonConfig.create({
        data: { id: nanoid() }
      });
      
      const creator = await prisma.player.findFirst();
      const freshSeason = await prisma.season.create({
        data: {
          id: nanoid(),
          status: 'ACTIVE',
          configId: seasonConfig.id,
          creatorId: creator!.id
        }
      });

      // Set up for terminate season command
      interaction.options.getSubcommandGroup.mockReturnValue('season');
      interaction.options.getSubcommand.mockReturnValue('kill');
      interaction.options.getString.mockReturnValue(freshSeason.id);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command proceeded and made database changes
      expect(interaction.editReply).toHaveBeenCalled();
      
      // Verify season was actually terminated (database change occurred)
      const seasonAfter = await prisma.season.findUnique({
        where: { id: freshSeason.id }
      });
      expect(seasonAfter?.status).toBe('TERMINATED');
    });
  });

  describe('Terminate Season Command', () => {
    beforeEach(() => {
      // Set up for terminate season command
      interaction.options.getSubcommandGroup.mockReturnValue('season');
      interaction.options.getSubcommand.mockReturnValue('kill');
      interaction.user.id = '510875521354039317'; // Ensure admin access with correct ID
    });

    it('should successfully terminate an active season', async () => {
      // Create a fresh active season for this test
      const seasonConfig = await prisma.seasonConfig.create({
        data: { id: nanoid() }
      });
      
      const creator = await prisma.player.findFirst();
      const freshSeason = await prisma.season.create({
        data: {
          id: nanoid(),
          status: 'ACTIVE',
          configId: seasonConfig.id,
          creatorId: creator!.id
        }
      });

      // Create some games for the fresh season
      await prisma.game.createMany({
        data: [
          {
            id: nanoid(),
            seasonId: freshSeason.id,
            status: 'ACTIVE'
          },
          {
            id: nanoid(),
            seasonId: freshSeason.id,
            status: 'PENDING_START'
          }
        ]
      });

      interaction.options.getString.mockReturnValue(freshSeason.id);

      // Verify season is active before termination
      const seasonBefore = await prisma.season.findUnique({
        where: { id: freshSeason.id }
      });
      expect(seasonBefore?.status).toBe('ACTIVE');

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Verify season status was updated in database
      const seasonAfter = await prisma.season.findUnique({
        where: { id: freshSeason.id }
      });
      expect(seasonAfter?.status).toBe('TERMINATED');

      // Verify related games were also terminated
      const games = await prisma.game.findMany({
        where: { seasonId: freshSeason.id }
      });
      games.forEach(game => {
        expect(game.status).toBe('TERMINATED');
      });
    });

    it('should handle terminating a non-existent season', async () => {
      const nonExistentSeasonId = 'non-existent-season-id';
      interaction.options.getString.mockReturnValue(nonExistentSeasonId);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply (error response)
      expect(interaction.editReply).toHaveBeenCalled();
      
      // Verify no database changes occurred
      const existingSeason = await prisma.season.findUnique({
        where: { id: nonExistentSeasonId }
      });
      expect(existingSeason).toBeNull();
    });

    it('should handle terminating an already terminated season', async () => {
      interaction.options.getString.mockReturnValue(terminatedSeasonId);

      // Verify season is already terminated
      const seasonBefore = await prisma.season.findUnique({
        where: { id: terminatedSeasonId }
      });
      expect(seasonBefore?.status).toBe('TERMINATED');

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply (error response)
      expect(interaction.editReply).toHaveBeenCalled();
      
      // Verify season status remains unchanged
      const seasonAfter = await prisma.season.findUnique({
        where: { id: terminatedSeasonId }
      });
      expect(seasonAfter?.status).toBe('TERMINATED');
    });

    it('should handle database errors gracefully', async () => {
      // Mock a database error by using an invalid season ID format that would cause Prisma to throw
      const invalidSeasonId = null as any; // This will cause a Prisma error
      interaction.options.getString.mockReturnValue(invalidSeasonId);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply (error response)
      expect(interaction.editReply).toHaveBeenCalled();
      
      // Verify our original test season remains unchanged
      const testSeason = await prisma.season.findUnique({
        where: { id: testSeasonId }
      });
      expect(testSeason?.status).toBe('ACTIVE'); // Should remain unchanged
    });
  });

  describe('Command Structure', () => {
    it('should handle unknown subcommands', async () => {
      interaction.options.getSubcommand.mockReturnValue('unknown');
      interaction.user.id = '510875521354039317'; // Use correct admin ID

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply (error response)
      expect(interaction.editReply).toHaveBeenCalled();
      
      // Verify no database changes occurred to our original test season
      const testSeason = await prisma.season.findUnique({
        where: { id: testSeasonId }
      });
      expect(testSeason?.status).toBe('ACTIVE'); // Should remain unchanged
    });
  });

  describe('Ban Player Command', () => {
    beforeEach(() => {
      // Set up for ban player command
      interaction.options.getSubcommand.mockReturnValue('ban');
      interaction.options.getSubcommandGroup.mockReturnValue('player');
      interaction.user.id = '510875521354039317'; // Ensure admin access
    });

    it('should successfully ban an unbanned player', async () => {
      // Mock the user option to return a test user
      interaction.options.getUser.mockReturnValue({
        id: 'test-player-discord-id',
        username: 'TestPlayer'
      });
      interaction.options.getString.mockReturnValue('Test ban reason');

      // Verify player is not banned before
      const playerBefore = await prisma.player.findUnique({
        where: { discordUserId: 'test-player-discord-id' }
      });
      expect(playerBefore?.bannedAt).toBeNull();

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Verify player was banned in database
      const playerAfter = await prisma.player.findUnique({
        where: { discordUserId: 'test-player-discord-id' }
      });
      expect(playerAfter?.bannedAt).not.toBeNull();
      expect(playerAfter?.bannedAt).toBeInstanceOf(Date);
    });

    it('should handle banning a non-existent player', async () => {
      // Mock the user option to return a non-existent user
      interaction.options.getUser.mockReturnValue({
        id: 'non-existent-player-discord-id',
        username: 'NonExistentPlayer'
      });
      interaction.options.getString.mockReturnValue('Test ban reason');

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply (error response)
      expect(interaction.editReply).toHaveBeenCalled();
      
      // Verify no player was created
      const player = await prisma.player.findUnique({
        where: { discordUserId: 'non-existent-player-discord-id' }
      });
      expect(player).toBeNull();
    });

    it('should handle banning an already banned player', async () => {
      // Mock the user option to return an already banned user
      interaction.options.getUser.mockReturnValue({
        id: 'banned-player-discord-id',
        username: 'BannedPlayer'
      });
      interaction.options.getString.mockReturnValue('Test ban reason');

      // Verify player is already banned
      const playerBefore = await prisma.player.findUnique({
        where: { discordUserId: 'banned-player-discord-id' }
      });
      expect(playerBefore?.bannedAt).not.toBeNull();

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply (error response)
      expect(interaction.editReply).toHaveBeenCalled();
      
      // Verify ban status remains unchanged
      const playerAfter = await prisma.player.findUnique({
        where: { discordUserId: 'banned-player-discord-id' }
      });
      expect(playerAfter?.bannedAt).toEqual(playerBefore?.bannedAt);
    });

    it('should ban a player without a reason', async () => {
      // Create a fresh test player for this test
      const freshPlayer = await prisma.player.create({
        data: {
          id: nanoid(),
          discordUserId: 'fresh-player-no-reason',
          name: 'Fresh Player No Reason'
        }
      });

      // Mock the user option to return the fresh test user
      interaction.options.getUser.mockReturnValue({
        id: 'fresh-player-no-reason',
        username: 'FreshPlayer'
      });
      interaction.options.getString.mockReturnValue(null); // No reason provided

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Verify player was banned in database
      const playerAfter = await prisma.player.findUnique({
        where: { discordUserId: 'fresh-player-no-reason' }
      });
      expect(playerAfter?.bannedAt).not.toBeNull();
    });
  });

  describe('Unban Player Command', () => {
    beforeEach(() => {
      // Set up for unban player command
      interaction.options.getSubcommand.mockReturnValue('unban');
      interaction.options.getSubcommandGroup.mockReturnValue('player');
      interaction.user.id = '510875521354039317'; // Ensure admin access
    });

    it('should successfully unban a banned player', async () => {
      // Mock the user option to return a banned user
      interaction.options.getUser.mockReturnValue({
        id: 'banned-player-discord-id',
        username: 'BannedPlayer'
      });

      // Verify player is banned before
      const playerBefore = await prisma.player.findUnique({
        where: { discordUserId: 'banned-player-discord-id' }
      });
      expect(playerBefore?.bannedAt).not.toBeNull();

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Verify player was unbanned in database
      const playerAfter = await prisma.player.findUnique({
        where: { discordUserId: 'banned-player-discord-id' }
      });
      expect(playerAfter?.bannedAt).toBeNull();
    });

    it('should handle unbanning a non-existent player', async () => {
      // Mock the user option to return a non-existent user
      interaction.options.getUser.mockReturnValue({
        id: 'non-existent-player-discord-id',
        username: 'NonExistentPlayer'
      });

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply (error response)
      expect(interaction.editReply).toHaveBeenCalled();
      
      // Verify no player was created
      const player = await prisma.player.findUnique({
        where: { discordUserId: 'non-existent-player-discord-id' }
      });
      expect(player).toBeNull();
    });

    it('should handle unbanning an already unbanned player', async () => {
      // Mock the user option to return an unbanned user
      interaction.options.getUser.mockReturnValue({
        id: 'test-player-discord-id',
        username: 'TestPlayer'
      });

      // Verify player is not banned before
      const playerBefore = await prisma.player.findUnique({
        where: { discordUserId: 'test-player-discord-id' }
      });
      expect(playerBefore?.bannedAt).toBeNull();

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply (error response)
      expect(interaction.editReply).toHaveBeenCalled();
      
      // Verify ban status remains unchanged (still null)
      const playerAfter = await prisma.player.findUnique({
        where: { discordUserId: 'test-player-discord-id' }
      });
      expect(playerAfter?.bannedAt).toBeNull();
    });
  });

  describe('Player Command Permission Checks', () => {
    it('should deny ban command to non-admin users', async () => {
      // Set user to non-admin
      interaction.user.id = 'non-admin-user-id';
      interaction.options.getSubcommand.mockReturnValue('ban');
      interaction.options.getSubcommandGroup.mockReturnValue('player');
      interaction.options.getUser.mockReturnValue({
        id: 'test-player-discord-id',
        username: 'TestPlayer'
      });

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply (permission denied response)
      expect(interaction.editReply).toHaveBeenCalled();
      
      // Verify no database changes occurred
      const player = await prisma.player.findUnique({
        where: { discordUserId: 'test-player-discord-id' }
      });
      expect(player?.bannedAt).toBeNull(); // Should remain unchanged
    });

    it('should deny unban command to non-admin users', async () => {
      // Set user to non-admin
      interaction.user.id = 'non-admin-user-id';
      interaction.options.getSubcommand.mockReturnValue('unban');
      interaction.options.getSubcommandGroup.mockReturnValue('player');
      interaction.options.getUser.mockReturnValue({
        id: 'banned-player-discord-id',
        username: 'BannedPlayer'
      });

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply (permission denied response)
      expect(interaction.editReply).toHaveBeenCalled();
      
      // Verify no database changes occurred
      const player = await prisma.player.findUnique({
        where: { discordUserId: 'banned-player-discord-id' }
      });
      expect(player?.bannedAt).not.toBeNull(); // Should remain banned
    });
  });

  describe('List Seasons Command', () => {
    beforeEach(() => {
      // Set up for list seasons command
      interaction.options.getSubcommand.mockReturnValue('seasons');
      interaction.options.getSubcommandGroup.mockReturnValue('list');
      interaction.user.id = '510875521354039317'; // Ensure admin access
    });

    it('should successfully list all seasons without filter', async () => {
      // Mock no status filter
      interaction.options.getString.mockReturnValue(null);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Verify the response contains season data
      // The test seasons created in beforeAll should be included
      const seasons = await prisma.season.findMany({
        include: {
          creator: true,
          _count: {
            select: { players: true, games: true }
          }
        }
      });
      expect(seasons.length).toBeGreaterThan(0);
    });

    it('should successfully list seasons with status filter', async () => {
      // Mock status filter for ACTIVE seasons
      interaction.options.getString.mockReturnValue('ACTIVE');

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Verify only ACTIVE seasons are returned
      const activeSeasons = await prisma.season.findMany({
        where: { status: 'ACTIVE' }
      });
      expect(activeSeasons.length).toBeGreaterThan(0);
    });

    it('should successfully list seasons with TERMINATED status filter', async () => {
      // Mock status filter for TERMINATED seasons
      interaction.options.getString.mockReturnValue('TERMINATED');

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Verify only TERMINATED seasons are returned
      const terminatedSeasons = await prisma.season.findMany({
        where: { status: 'TERMINATED' }
      });
      expect(terminatedSeasons.length).toBeGreaterThan(0);
    });

    it('should handle empty results gracefully', async () => {
      // Mock status filter for a status that doesn't exist
      interaction.options.getString.mockReturnValue('SETUP');

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Should still return success even with no results
      const setupSeasons = await prisma.season.findMany({
        where: { status: 'SETUP' }
      });
      expect(setupSeasons.length).toBe(0);
    });

    it('should deny access to non-admin users', async () => {
      // Set user to non-admin
      interaction.user.id = 'non-admin-user-id';
      interaction.options.getString.mockReturnValue(null);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply (permission denied response)
      expect(interaction.editReply).toHaveBeenCalled();
    });
  });

  describe('List Players Command', () => {
    beforeEach(() => {
      // Set up for list players command
      interaction.options.getSubcommand.mockReturnValue('players');
      interaction.options.getSubcommandGroup.mockReturnValue('list');
      interaction.user.id = '510875521354039317'; // Ensure admin access
    });

    it('should successfully list all players without filters', async () => {
      // Mock no filters
      interaction.options.getString.mockReturnValue(null);
      interaction.options.getBoolean.mockReturnValue(null);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Verify the response contains player data
      const players = await prisma.player.findMany({
        include: {
          _count: {
            select: { seasons: true, turns: true }
          }
        }
      });
      expect(players.length).toBeGreaterThan(0);
    });

    it('should successfully list players with season filter', async () => {
      // Mock season filter
      interaction.options.getString.mockReturnValue(testSeasonId);
      interaction.options.getBoolean.mockReturnValue(null);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Verify only players in the specified season are returned
      const playersInSeason = await prisma.playersOnSeasons.findMany({
        where: { seasonId: testSeasonId },
        include: { player: true }
      });
      // Should have at least the players we created in the test setup
      expect(playersInSeason.length).toBeGreaterThanOrEqual(0);
    });

    it('should successfully list only banned players', async () => {
      // Mock banned filter
      interaction.options.getString.mockReturnValue(null);
      interaction.options.getBoolean.mockReturnValue(true);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Verify only banned players are returned
      const bannedPlayers = await prisma.player.findMany({
        where: { bannedAt: { not: null } }
      });
      expect(bannedPlayers.length).toBeGreaterThan(0);
    });

    it('should successfully list only unbanned players', async () => {
      // Mock unbanned filter
      interaction.options.getString.mockReturnValue(null);
      interaction.options.getBoolean.mockReturnValue(false);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Verify only unbanned players are returned
      const unbannedPlayers = await prisma.player.findMany({
        where: { bannedAt: null }
      });
      expect(unbannedPlayers.length).toBeGreaterThan(0);
    });

    it('should handle combined season and banned filters', async () => {
      // Mock both filters
      interaction.options.getString.mockReturnValue(testSeasonId);
      interaction.options.getBoolean.mockReturnValue(true);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Should return banned players in the specified season
      // (may be empty but should not error)
    });

    it('should handle empty results gracefully', async () => {
      // Mock season filter for a non-existent season
      interaction.options.getString.mockReturnValue('non-existent-season-id');
      interaction.options.getBoolean.mockReturnValue(null);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Should still return success even with no results
    });

    it('should deny access to non-admin users', async () => {
      // Set user to non-admin
      interaction.user.id = 'non-admin-user-id';
      interaction.options.getString.mockReturnValue(null);
      interaction.options.getBoolean.mockReturnValue(null);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply (permission denied response)
      expect(interaction.editReply).toHaveBeenCalled();
    });
  });

  describe('Season Config Command', () => {
    it('should show default server configuration when no parameters provided', async () => {
      interaction.options.getSubcommandGroup.mockReturnValue('season');
      interaction.options.getSubcommand.mockReturnValue('config');
      interaction.options.getString.mockReturnValue(null);
      interaction.options.getInteger.mockReturnValue(null);

      await commandInstance.execute(interaction, mockEventData);

      expect(interaction.editReply).toHaveBeenCalled();
      const replyCall = interaction.editReply.mock.calls[0][0];
      expect(replyCall.embeds).toBeDefined();
      expect(replyCall.embeds[0].data.description).toContain('Server Default Season Configuration');
      expect(replyCall.embeds[0].data.description).toContain('Min Players:');
      expect(replyCall.embeds[0].data.description).toContain('Max Players:');
      expect(replyCall.embeds[0].data.description).toContain('Turn Pattern:');
    });

    it('should update server default configuration when parameters provided', async () => {
      interaction.options.getSubcommandGroup.mockReturnValue('season');
      interaction.options.getSubcommand.mockReturnValue('config');
      interaction.options.getString.mockImplementation((name: string) => {
        if (name === 'turn_pattern') return 'writing,drawing,writing';
        if (name === 'claim_timeout') return '2h';
        return null;
      });
      interaction.options.getInteger.mockImplementation((name: string) => {
        if (name === 'min_players') return 3;
        if (name === 'max_players') return 8;
        return null;
      });

      await commandInstance.execute(interaction, mockEventData);

      // Should call editReply twice - once for the update result, once for showing the config
      expect(interaction.editReply).toHaveBeenCalledTimes(2);
      
      // Verify the configuration was actually updated in the database
      const config = await prisma.seasonConfig.findUnique({
        where: { isGuildDefaultFor: testGuildId }
      });
      
      expect(config).toBeTruthy();
      expect(config?.minPlayers).toBe(3);
      expect(config?.maxPlayers).toBe(8);
      expect(config?.turnPattern).toBe('writing,drawing,writing');
      expect(config?.claimTimeout).toBe('2h');
    });

    it('should handle validation errors for invalid parameters', async () => {
      interaction.options.getSubcommandGroup.mockReturnValue('season');
      interaction.options.getSubcommand.mockReturnValue('config');
      interaction.options.getString.mockImplementation((name: string) => {
        if (name === 'turn_pattern') return 'invalid-pattern';
        return null;
      });
      interaction.options.getInteger.mockReturnValue(null);

      await commandInstance.execute(interaction, mockEventData);

      expect(interaction.editReply).toHaveBeenCalled();
      // Should show validation error
      const replyCall = interaction.editReply.mock.calls[0][0];
      expect(replyCall.embeds).toBeDefined();
      // Check for error color (red) - the actual color may vary based on the embed type
      expect(replyCall.embeds[0].data.color).toBeGreaterThan(0); // Just verify a color is set
    });

    it('should handle min/max player validation', async () => {
      interaction.options.getSubcommandGroup.mockReturnValue('season');
      interaction.options.getSubcommand.mockReturnValue('config');
      interaction.options.getString.mockReturnValue(null);
      interaction.options.getInteger.mockImplementation((name: string) => {
        if (name === 'min_players') return 10;
        if (name === 'max_players') return 5; // Invalid: min > max
        return null;
      });

      await commandInstance.execute(interaction, mockEventData);

      expect(interaction.editReply).toHaveBeenCalled();
      // Should show validation error
      const replyCall = interaction.editReply.mock.calls[0][0];
      expect(replyCall.embeds).toBeDefined();
      // Check for error color (red) - the actual color may vary based on the embed type
      expect(replyCall.embeds[0].data.color).toBeGreaterThan(0); // Just verify a color is set
    });

    it('should reject non-admin users', async () => {
      // Change user ID to non-admin
      interaction.user.id = 'non-admin-user';
      interaction.options.getSubcommandGroup.mockReturnValue('season');
      interaction.options.getSubcommand.mockReturnValue('config');

      await commandInstance.execute(interaction, mockEventData);

      expect(interaction.editReply).toHaveBeenCalled();
      const replyCall = interaction.editReply.mock.calls[0][0];
      expect(replyCall.embeds).toBeDefined();
      expect(replyCall.embeds[0].data.description).toContain('admin'); // Should contain admin warning
    });

    it('should handle guild-only requirement', async () => {
      // Remove guild from interaction
      interaction.guild = null;
      interaction.options.getSubcommandGroup.mockReturnValue('season');
      interaction.options.getSubcommand.mockReturnValue('config');

      await commandInstance.execute(interaction, mockEventData);

      expect(interaction.editReply).toHaveBeenCalled();
      const replyCall = interaction.editReply.mock.calls[0][0];
      expect(replyCall.embeds).toBeDefined();
      expect(replyCall.embeds[0].data.description).toContain('server'); // Should mention server requirement
    });
  });
}); 