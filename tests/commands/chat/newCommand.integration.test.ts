import { describe, it, expect, beforeEach, afterEach, vi, afterAll, beforeAll } from 'vitest';
import { ChatInputCommandInteraction, PermissionsString, MessageFlags, Locale } from 'discord.js';
import { NewCommand } from '../../../src/commands/chat/new-command.js';
import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { EventData } from '../../../src/models/internal-models.js';
import { SeasonService } from '../../../src/services/SeasonService.js';
import { TurnService } from '../../../src/services/TurnService.js';
import { SchedulerService } from '../../../src/services/SchedulerService.js';
import { GameService } from '../../../src/services/GameService.js';

describe('NewCommand - Integration Tests', () => {
  let interaction: any; // Using any type for the mock interaction
  let prisma: PrismaClient;
  let commandInstance: NewCommand;
  let mockEventData: EventData;
  let seasonService: SeasonService;
  let turnService: TurnService;
  let mockSchedulerService: SchedulerService;
  let mockDiscordClient: any;

  beforeAll(async () => {
    prisma = new PrismaClient();
    
    // Create mock Discord client
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
    
    // Create mock scheduler service
    mockSchedulerService = {
      scheduleJob: vi.fn().mockReturnValue(true),
      cancelJob: vi.fn().mockReturnValue(true),
    } as unknown as SchedulerService;
    
    // Create the TurnService
    turnService = new TurnService(prisma, mockDiscordClient);
    
    // Create the SeasonService with proper dependencies
    const gameService = new GameService(prisma);
    seasonService = new SeasonService(prisma, turnService, mockSchedulerService, gameService);
    
    // Now create the command with proper dependencies
    commandInstance = new NewCommand(prisma, seasonService);
    
    mockEventData = new EventData(Locale.EnglishUS, Locale.EnglishUS);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean database before each test
    await prisma.$transaction([
      prisma.playersOnSeasons.deleteMany(),
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.seasonConfig.deleteMany(),
      prisma.player.deleteMany(),
    ]);

    // Reset mocks before each test
    vi.clearAllMocks();
    
    // Create a mock interaction object
    interaction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      replied: false,
      deferred: true, // Set to true to simulate deferred interaction
      options: {
        getSubcommand: vi.fn().mockReturnValue('season'),
        getString: vi.fn(),
        getInteger: vi.fn()
      },
      user: {
        id: 'mock-discord-id',
        username: 'MockUser',
        toString: vi.fn().mockReturnValue('<@mock-discord-id>')
      }
    };
  });

  describe('Successful season creation', () => {
    it('should successfully create a season for a new player with default options', async () => {
      const discordUserId = 'new-creator-discord-id';
      interaction.user.id = discordUserId;
      interaction.user.username = 'NewCreator';

      // Mock all options to return null (using defaults)
      interaction.options.getString = vi.fn().mockReturnValue(null);
      interaction.options.getInteger = vi.fn().mockReturnValue(null);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Verify the player was created
      const player = await prisma.player.findUnique({
        where: { discordUserId }
      });
      expect(player).not.toBeNull();
      expect(player!.name).toBe('NewCreator');

      // Verify the season was created
      const seasons = await prisma.season.findMany({
        where: { creatorId: player!.id },
        include: { config: true }
      });
      expect(seasons).toHaveLength(1);
      expect(seasons[0].status).toBe('OPEN');
      expect(seasons[0].creatorId).toBe(player!.id);
    });

    it('should successfully create a season for an existing player with custom options', async () => {
      // Create an existing player first
      const discordUserId = 'existing-creator-discord-id';
      const existingPlayer = await prisma.player.create({
        data: {
          id: nanoid(),
          discordUserId,
          name: 'ExistingCreator'
        }
      });

      interaction.user.id = discordUserId;
      interaction.user.username = 'ExistingCreator';

      // Mock custom options
      interaction.options.getString = vi.fn().mockImplementation((optionName) => {
        switch (optionName) {
          case 'open_duration': return '2d';
          case 'turn_pattern': return 'writing,drawing,writing';
          case 'claim_timeout': return '2h';
          case 'writing_timeout': return '6h';
          case 'drawing_timeout': return '2h';
          default: return null;
        }
      });
      interaction.options.getInteger = vi.fn().mockImplementation((optionName) => {
        switch (optionName) {
          case 'min_players': return 3;
          case 'max_players': return 8;
          default: return null;
        }
      });

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify the command called editReply
      expect(interaction.editReply).toHaveBeenCalled();

      // Verify the season was created with custom options
      const seasons = await prisma.season.findMany({
        where: { creatorId: existingPlayer.id },
        include: { config: true }
      });
      expect(seasons).toHaveLength(1);
      expect(seasons[0].config.minPlayers).toBe(3);
      expect(seasons[0].config.maxPlayers).toBe(8);
      expect(seasons[0].config.openDuration).toBe('2d');
      expect(seasons[0].config.turnPattern).toBe('writing,drawing,writing');
      expect(seasons[0].config.claimTimeout).toBe('2h');
      expect(seasons[0].config.writingTimeout).toBe('6h');
      expect(seasons[0].config.drawingTimeout).toBe('2h');
    });
  });

  describe('Error handling', () => {
    it('should handle player creation failure gracefully', async () => {
      const discordUserId = 'test-player-discord-id';
      interaction.user.id = discordUserId;
      interaction.user.username = 'TestPlayer';

      // Mock all options to return null
      interaction.options.getString = vi.fn().mockReturnValue(null);
      interaction.options.getInteger = vi.fn().mockReturnValue(null);

      // Mock Prisma to throw an error during player creation
      const originalCreate = prisma.player.create;
      prisma.player.create = vi.fn().mockRejectedValue(new Error('Database error'));

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify error response was sent
      expect(interaction.editReply).toHaveBeenCalled();

      // Restore original method
      prisma.player.create = originalCreate;
    });

    it('should handle invalid min/max players configuration', async () => {
      const discordUserId = 'invalid-config-discord-id';
      interaction.user.id = discordUserId;
      interaction.user.username = 'InvalidConfigUser';

      // Mock invalid options (min > max)
      interaction.options.getString = vi.fn().mockReturnValue(null);
      interaction.options.getInteger = vi.fn().mockImplementation((optionName) => {
        switch (optionName) {
          case 'min_players': return 10;
          case 'max_players': return 5; // Invalid: min > max
          default: return null;
        }
      });

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify error response was sent
      expect(interaction.editReply).toHaveBeenCalled();

      // Verify no season was created
      const seasons = await prisma.season.findMany();
      expect(seasons).toHaveLength(0);
    });

    it('should handle SeasonService errors gracefully', async () => {
      const discordUserId = 'service-error-discord-id';
      interaction.user.id = discordUserId;
      interaction.user.username = 'ServiceErrorUser';

      // Mock all options to return null
      interaction.options.getString = vi.fn().mockReturnValue(null);
      interaction.options.getInteger = vi.fn().mockReturnValue(null);

      // Mock SeasonService to throw an error
      const originalCreateSeason = seasonService.createSeason;
      seasonService.createSeason = vi.fn().mockRejectedValue(new Error('Service error'));

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify error response was sent
      expect(interaction.editReply).toHaveBeenCalled();

      // Restore original method
      seasonService.createSeason = originalCreateSeason;
    });

    it('should handle unknown subcommand gracefully', async () => {
      // Mock unknown subcommand
      interaction.options.getSubcommand = vi.fn().mockReturnValue('unknown');

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify error response was sent
      expect(interaction.editReply).toHaveBeenCalled();
    });
  });

  describe('Database interactions', () => {
    it('should create player record when Discord user does not exist', async () => {
      const discordUserId = 'new-user-discord-id';
      interaction.user.id = discordUserId;
      interaction.user.username = 'NewUser';

      // Mock all options to return null
      interaction.options.getString = vi.fn().mockReturnValue(null);
      interaction.options.getInteger = vi.fn().mockReturnValue(null);

      // Verify player doesn't exist before
      const playerBefore = await prisma.player.findUnique({
        where: { discordUserId }
      });
      expect(playerBefore).toBeNull();

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify player was created
      const playerAfter = await prisma.player.findUnique({
        where: { discordUserId }
      });
      expect(playerAfter).not.toBeNull();
      expect(playerAfter!.name).toBe('NewUser');
    });

    it('should use existing player record when Discord user already exists', async () => {
      // Create an existing player first
      const discordUserId = 'existing-user-discord-id';
      const existingPlayer = await prisma.player.create({
        data: {
          id: nanoid(),
          discordUserId,
          name: 'ExistingUser'
        }
      });

      interaction.user.id = discordUserId;
      interaction.user.username = 'ExistingUser';

      // Mock all options to return null
      interaction.options.getString = vi.fn().mockReturnValue(null);
      interaction.options.getInteger = vi.fn().mockReturnValue(null);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify only one player record exists
      const players = await prisma.player.findMany({
        where: { discordUserId }
      });
      expect(players).toHaveLength(1);
      expect(players[0].id).toBe(existingPlayer.id);

      // Verify season was created with existing player as creator
      const seasons = await prisma.season.findMany({
        where: { creatorId: existingPlayer.id }
      });
      expect(seasons).toHaveLength(1);
    });

    it('should create season and config records with proper relationships', async () => {
      const discordUserId = 'relationship-test-discord-id';
      interaction.user.id = discordUserId;
      interaction.user.username = 'RelationshipTestUser';

      // Mock all options to return null
      interaction.options.getString = vi.fn().mockReturnValue(null);
      interaction.options.getInteger = vi.fn().mockReturnValue(null);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify player was created
      const player = await prisma.player.findUnique({
        where: { discordUserId }
      });
      expect(player).not.toBeNull();

      // Verify season was created with proper relationships
      const season = await prisma.season.findFirst({
        where: { creatorId: player!.id },
        include: { 
          config: true,
          creator: true
        }
      });
      expect(season).not.toBeNull();
      expect(season!.creatorId).toBe(player!.id);
      expect(season!.creator.id).toBe(player!.id);
      expect(season!.config).not.toBeNull();
      expect(season!.configId).toBe(season!.config.id);
    });
  });

  describe('Message instruction handling', () => {
    it('should return success message instruction for successful creation', async () => {
      const discordUserId = 'success-message-discord-id';
      interaction.user.id = discordUserId;
      interaction.user.username = 'SuccessMessageUser';

      // Mock all options to return null
      interaction.options.getString = vi.fn().mockReturnValue(null);
      interaction.options.getInteger = vi.fn().mockReturnValue(null);

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify editReply was called (success case)
      expect(interaction.editReply).toHaveBeenCalled();
      
      // The actual message content is handled by MessageAdapter and Lang service
      // We're testing that the command completes successfully and calls the right methods
    });

    it('should return error message instruction for service errors', async () => {
      const discordUserId = 'error-message-discord-id';
      interaction.user.id = discordUserId;
      interaction.user.username = 'ErrorMessageUser';

      // Mock all options to return null
      interaction.options.getString = vi.fn().mockReturnValue(null);
      interaction.options.getInteger = vi.fn().mockReturnValue(null);

      // Mock SeasonService to return an error instruction
      const originalCreateSeason = seasonService.createSeason;
      seasonService.createSeason = vi.fn().mockResolvedValue({
        type: 'error',
        key: 'season_create_error_min_max_players',
        data: { minPlayers: 10, maxPlayers: 5 },
        formatting: { ephemeral: true }
      });

      // Execute the command
      await commandInstance.execute(interaction, mockEventData);

      // Verify error response was sent
      expect(interaction.editReply).toHaveBeenCalled();

      // Restore original method
      seasonService.createSeason = originalCreateSeason;
    });
  });
}); 