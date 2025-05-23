import { describe, it, expect, beforeEach, afterEach, vi, afterAll, beforeAll } from 'vitest';
import { ChatInputCommandInteraction, PermissionsString, MessageFlags } from 'discord.js';
import { AdminCommand } from '../../../src/commands/chat/admin-command.js';
import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { Lang } from '../../../src/services/lang.js';
import { Language } from '../../../src/models/enum-helpers/language.js';
import { EventData } from '../../../src/models/internal-models.js';
import { SeasonService } from '../../../src/services/SeasonService.js';
import { TurnService } from '../../../src/services/TurnService.js';
import { SchedulerService } from '../../../src/services/SchedulerService.js';

// Mock Lang service
vi.mock('../../../src/services/lang.js', () => ({
  Lang: {
    getRef: vi.fn().mockReturnValue('admin'),
    getRefLocalizationMap: vi.fn().mockReturnValue({})
  },
  Language: {
    Default: 'en-US'
  }
}));

// Mock config to include test user as developer/admin
vi.mock('../../../../config/config.json', () => ({
  developers: ['test-admin-user-id', 'test-non-admin-user-id-should-not-work']
}));

describe('AdminCommand - Integration Tests', () => {
  let interaction: any; // Using any type for the mock interaction
  let prisma: PrismaClient;
  let testSeasonId: string;
  let terminatedSeasonId: string;
  let commandInstance: AdminCommand;
  let mockEventData: EventData;

  beforeAll(async () => {
    prisma = new PrismaClient();
    commandInstance = new AdminCommand();
    mockEventData = { lang: Language.Default, langGuild: Language.Default };
    
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
        getString: vi.fn()
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
        id: 'test-guild-id',
        shardId: 0
      }
    };
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
      interaction.options.getSubcommand.mockReturnValue('season');
      interaction.options.getSubcommandGroup.mockReturnValue('terminate');
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
      interaction.options.getSubcommand.mockReturnValue('season');
      interaction.options.getSubcommandGroup.mockReturnValue('terminate');
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
}); 