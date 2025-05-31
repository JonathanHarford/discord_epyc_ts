import { PrismaClient } from '@prisma/client';
import { Locale } from 'discord.js';
import { nanoid } from 'nanoid';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SeasonCommand } from '../../../src/commands/chat/season-command.js';
import { EventData } from '../../../src/models/internal-models.js';
import { GameService } from '../../../src/services/GameService.js';
import { PlayerTurnService } from '../../../src/services/PlayerTurnService.js';
import { SchedulerService } from '../../../src/services/SchedulerService.js';
import { SeasonService } from '../../../src/services/SeasonService.js';
import { SeasonTurnService } from '../../../src/services/SeasonTurnService.js';

// Don't mock SimpleMessage - let it call the real interaction methods
// This allows us to test that the interaction methods are called correctly

describe('SeasonCommand - Integration Tests', () => {
  let interaction: any; // Using any type for the mock interaction
  let prisma: PrismaClient;
  let seasonService: SeasonService;
  let turnService: SeasonTurnService;
  let schedulerService: SchedulerService;
  let gameService: GameService;
  let playerTurnService: PlayerTurnService;
  let commandInstance: SeasonCommand;
  let mockEventData: EventData;
  let testSeasonId: string;
  let testPlayerId: string;
  let testSeasonConfigId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    
    // Mock SchedulerService since we don't want actual scheduling in tests
    schedulerService = {
      scheduleJob: vi.fn().mockResolvedValue(true),
      cancelJob: vi.fn().mockResolvedValue(true),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined)
    } as any;
    
    // Create real service instances
    gameService = new GameService(prisma);
    turnService = new SeasonTurnService(prisma, {} as any); // Mock Discord client
    seasonService = new SeasonService(prisma, turnService, schedulerService, gameService);
    playerTurnService = new PlayerTurnService(prisma);
    commandInstance = new SeasonCommand(prisma, seasonService, playerTurnService);
    mockEventData = new EventData(Locale.EnglishUS, Locale.EnglishUS);
    
    // Clean database and set up test data
    await prisma.$transaction([
      prisma.playersOnSeasons.deleteMany(),
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.seasonConfig.deleteMany(),
      prisma.player.deleteMany(),
    ]);

    // Create test season config
    const seasonConfig = await prisma.seasonConfig.create({
      data: { 
        id: nanoid(),
        minPlayers: 4,
        maxPlayers: 8,
        claimTimeout: '300s',
        writingTimeout: '600s',
        drawingTimeout: '900s'
      }
    });
    testSeasonConfigId = seasonConfig.id;

    // Create a test player
    const testPlayer = await prisma.player.create({
      data: {
        id: nanoid(),
        discordUserId: 'test-user-id',
        name: 'TestUser'
      }
    });
    testPlayerId = testPlayer.id;

    // Create a test season
    const testSeason = await prisma.season.create({
      data: {
        id: nanoid(),
        status: 'OPEN',
        configId: seasonConfig.id,
        creatorId: testPlayer.id
      }
    });
    testSeasonId = testSeason.id;

    // Add the creator to the season
    await prisma.playersOnSeasons.create({
      data: {
        playerId: testPlayer.id,
        seasonId: testSeason.id
      }
    });
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
      deleteReply: vi.fn().mockResolvedValue(undefined),
      replied: false,
      deferred: true,
      options: {
        getSubcommand: vi.fn(),
        getString: vi.fn(),
        getInteger: vi.fn()
      },
      user: {
        id: 'test-user-id',
        username: 'TestUser',
        displayName: 'TestUser',
        tag: 'TestUser#0000',
        toString: vi.fn().mockReturnValue('<@test-user-id>')
      },
      guild: {
        id: 'test-guild-id',
        shardId: 0
      },
      channel: {
        send: vi.fn().mockResolvedValue(undefined)
      }
    };
  });

  describe('Season List Command', () => {
    it('should list open seasons and user seasons', async () => {
      interaction.options.getSubcommand.mockReturnValue('list');

      await commandInstance.execute(interaction, mockEventData);

      // Should call editReply since interaction.deferred = true
      expect(interaction.editReply).toHaveBeenCalled();
    });

    it('should show joinable season with buttons and other seasons in compact format', async () => {
      // Create additional season configs
      const completedSeasonConfig = await prisma.seasonConfig.create({
        data: { 
          id: nanoid(),
          minPlayers: 4,
          maxPlayers: 8,
          claimTimeout: '300s',
          writingTimeout: '600s',
          drawingTimeout: '900s'
        }
      });

      const terminatedSeasonConfig = await prisma.seasonConfig.create({
        data: { 
          id: nanoid(),
          minPlayers: 4,
          maxPlayers: 8,
          claimTimeout: '300s',
          writingTimeout: '600s',
          drawingTimeout: '900s'
        }
      });

      // Create additional seasons to test the new format
      const completedSeason = await prisma.season.create({
        data: {
          id: nanoid(),
          status: 'COMPLETED',
          configId: completedSeasonConfig.id,
          creatorId: testPlayerId
        }
      });

      const terminatedSeason = await prisma.season.create({
        data: {
          id: nanoid(),
          status: 'TERMINATED',
          configId: terminatedSeasonConfig.id,
          creatorId: testPlayerId
        }
      });

      // Create a new user who hasn't joined any seasons
      const newUser = await prisma.player.create({
        data: {
          id: nanoid(),
          discordUserId: 'new-user-for-list-test',
          name: 'NewUserForListTest'
        }
      });

      interaction.user.id = 'new-user-for-list-test';
      interaction.options.getSubcommand.mockReturnValue('list');

      await commandInstance.execute(interaction, mockEventData);

      // Should call editReply with text content (new text block format)
      expect(interaction.editReply).toHaveBeenCalled();
      
      // Check that editReply was called with text content (not embeds)
      const editReplyCall = interaction.editReply.mock.calls[0][0];
      expect(editReplyCall.content).toBeDefined();
      expect(typeof editReplyCall.content).toBe('string');
      
      // Should contain sections for different season types
      expect(editReplyCall.content).toContain('Other seasons:');
      
      // Should not use followUp anymore (single response with text blocks)
      expect(interaction.followUp).not.toHaveBeenCalled();

      // Clean up test data
      await prisma.season.deleteMany({
        where: {
          id: { in: [completedSeason.id, terminatedSeason.id] }
        }
      });
      await prisma.seasonConfig.deleteMany({
        where: {
          id: { in: [completedSeasonConfig.id, terminatedSeasonConfig.id] }
        }
      });
      await prisma.player.delete({
        where: { id: newUser.id }
      });
    });

    it('should handle case with no seasons', async () => {
      // Temporarily remove all seasons
      await prisma.playersOnSeasons.deleteMany();
      await prisma.season.deleteMany();
      
      interaction.options.getSubcommand.mockReturnValue('list');

      await commandInstance.execute(interaction, mockEventData);

      expect(interaction.editReply).toHaveBeenCalled();
      
      // Restore test season for other tests
      const testSeason = await prisma.season.create({
        data: {
          id: testSeasonId,
          status: 'OPEN',
          configId: testSeasonConfigId,
          creatorId: testPlayerId
        }
      });
      await prisma.playersOnSeasons.create({
        data: {
          playerId: testPlayerId,
          seasonId: testSeason.id
        }
      });
    });

    it('should show pagination buttons when there are many seasons', async () => {
      // Create multiple seasons to trigger pagination (need more than 4)
      const seasonConfigs = await Promise.all(
        Array.from({ length: 6 }, () => 
          prisma.seasonConfig.create({
            data: { 
              id: nanoid(),
              minPlayers: 4,
              maxPlayers: 8,
              claimTimeout: '300s',
              writingTimeout: '600s',
              drawingTimeout: '900s'
            }
          })
        )
      );

      const manySeasons = await Promise.all(
        seasonConfigs.map((config, _i) => 
          prisma.season.create({
            data: {
              id: nanoid(),
              status: 'OPEN',
              configId: config.id,
              creatorId: testPlayerId
            }
          })
        )
      );

      interaction.options.getSubcommand.mockReturnValue('list');

      await commandInstance.execute(interaction, mockEventData);

      expect(interaction.editReply).toHaveBeenCalled();
      
      // Check that the response includes pagination buttons
      const editReplyCall = interaction.editReply.mock.calls[0][0];
      expect(editReplyCall.components).toBeDefined();
      
      // Should have pagination buttons (next button should be present)
      const hasNextButton = editReplyCall.components.some((row: any) => 
        row.components?.some((component: any) => 
          component.data?.custom_id?.includes('season_list_next')
        )
      );
      expect(hasNextButton).toBe(true);

      // Clean up the extra seasons
      await prisma.season.deleteMany({
        where: {
          id: { in: manySeasons.map(s => s.id) }
        }
      });
      await prisma.seasonConfig.deleteMany({
        where: {
          id: { in: seasonConfigs.map(c => c.id) }
        }
      });
    });
  });

  describe('Season Show Command', () => {
    it('should show season status for valid season', async () => {
      interaction.options.getSubcommand.mockReturnValue('show');
      interaction.options.getString.mockReturnValue(testSeasonId);

      await commandInstance.execute(interaction, mockEventData);

      expect(interaction.editReply).toHaveBeenCalled();
    });

    it('should handle invalid season ID', async () => {
      interaction.options.getSubcommand.mockReturnValue('show');
      interaction.options.getString.mockReturnValue('invalid-season-id');

      await commandInstance.execute(interaction, mockEventData);

      expect(interaction.editReply).toHaveBeenCalled();
    });
  });

  describe('Season Join Command', () => {
    it('should allow user to join an open season', async () => {
      // Create a new user for joining
      const newPlayer = await prisma.player.create({
        data: {
          id: nanoid(),
          discordUserId: 'new-user-id',
          name: 'NewUser'
        }
      });

      interaction.user.id = 'new-user-id';
      interaction.options.getSubcommand.mockReturnValue('join');
      interaction.options.getString.mockReturnValue(testSeasonId);

      await commandInstance.execute(interaction, mockEventData);

      expect(interaction.editReply).toHaveBeenCalled();
      
      // Verify the user was added to the season
      const playerOnSeason = await prisma.playersOnSeasons.findFirst({
        where: {
          playerId: newPlayer.id,
          seasonId: testSeasonId
        }
      });
      expect(playerOnSeason).toBeTruthy();
    });

    it('should prevent joining the same season twice', async () => {
      interaction.options.getSubcommand.mockReturnValue('join');
      interaction.options.getString.mockReturnValue(testSeasonId);

      await commandInstance.execute(interaction, mockEventData);

      expect(interaction.editReply).toHaveBeenCalled();
    });

    it('should prevent joining a season when user has pending turns', async () => {
      // Create a new player with a pending turn
      const playerWithPendingTurn = await prisma.player.create({
        data: {
          id: nanoid(),
          discordUserId: 'user-with-pending-turn',
          name: 'UserWithPendingTurn'
        }
      });

      // Create a game for the pending turn
      const gameForPendingTurn = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          seasonId: testSeasonId,
        },
      });

      // Create a pending turn for this player
      await prisma.turn.create({
        data: {
          gameId: gameForPendingTurn.id,
          playerId: playerWithPendingTurn.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'PENDING',
          claimedAt: new Date(),
        },
      });

      // Try to join a season with this user
      interaction.user.id = 'user-with-pending-turn';
      interaction.options.getSubcommand.mockReturnValue('join');
      interaction.options.getString.mockReturnValue(testSeasonId);

      await commandInstance.execute(interaction, mockEventData);

      // Should have called editReply with an error message
      expect(interaction.editReply).toHaveBeenCalled();
      
      // Verify the user was NOT added to the season
      const playerOnSeason = await prisma.playersOnSeasons.findFirst({
        where: {
          playerId: playerWithPendingTurn.id,
          seasonId: testSeasonId
        }
      });
      expect(playerOnSeason).toBeNull();
    });
  });

  describe('Season New Command', () => {
    it('should create a new season with default settings', async () => {
      interaction.options.getSubcommand.mockReturnValue('new');
      interaction.options.getString.mockReturnValue(null);
      interaction.options.getInteger.mockReturnValue(null);

      await commandInstance.execute(interaction, mockEventData);

      // For successful season creation, expect deleteReply and channel.send to be called
      expect(interaction.deleteReply).toHaveBeenCalled();
      expect(interaction.channel.send).toHaveBeenCalled();
      
      // Verify a new season was created
      const newSeasons = await prisma.season.findMany({
        where: {
          creatorId: testPlayerId,
          status: 'OPEN'
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      
      expect(newSeasons.length).toBeGreaterThan(0);
    });

    it('should create a new season with custom settings', async () => {
      interaction.options.getSubcommand.mockReturnValue('new');
      interaction.options.getString.mockImplementation((name: string) => {
        if (name === 'name') return 'Custom Season';
        return null;
      });
      interaction.options.getInteger.mockImplementation((name: string) => {
        if (name === 'max_players') return 6;
        if (name === 'min_players') return 3;
        return null;
      });

      await commandInstance.execute(interaction, mockEventData);

      // For successful season creation, expect deleteReply and channel.send to be called
      expect(interaction.deleteReply).toHaveBeenCalled();
      expect(interaction.channel.send).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown subcommands', async () => {
      interaction.options.getSubcommand.mockReturnValue('unknown');

      await commandInstance.execute(interaction, mockEventData);

      expect(interaction.editReply).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      // Mock a database error by using an invalid season ID format
      interaction.options.getSubcommand.mockReturnValue('show');
      interaction.options.getString.mockReturnValue(''); // Empty string should cause issues

      await commandInstance.execute(interaction, mockEventData);

      expect(interaction.editReply).toHaveBeenCalled();
    });
  });
}); 