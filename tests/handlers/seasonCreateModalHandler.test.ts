import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SeasonCreateModalHandler } from '../../src/handlers/seasonCreateModalHandler.js';

describe('SeasonCreateModalHandler', () => {
  let handler: SeasonCreateModalHandler;
  let prisma: PrismaClient;
  let mockInteraction: any;
  let testUserId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    handler = new SeasonCreateModalHandler();
    testUserId = 'test-modal-user-id';

    // Clean up any existing test data
    await prisma.$transaction([
      prisma.playersOnSeasons.deleteMany(),
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.seasonConfig.deleteMany(),
      prisma.player.deleteMany({
        where: { discordUserId: testUserId }
      }),
    ]);
  });

  afterAll(async () => {
    // Clean up after all tests
    await prisma.$transaction([
      prisma.playersOnSeasons.deleteMany(),
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.seasonConfig.deleteMany(),
      prisma.player.deleteMany({
        where: { discordUserId: testUserId }
      }),
    ]);
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock interaction for modal submission
    mockInteraction = {
      customId: 'season_create_step1',
      user: {
        id: testUserId,
        username: 'TestModalUser',
        toString: vi.fn().mockReturnValue(`<@${testUserId}>`)
      },
      fields: {
        getTextInputValue: vi.fn()
      },
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      channel: {
        send: vi.fn().mockResolvedValue(undefined)
      },
      client: {
        // Mock Discord client if needed
      },
      replied: false
    };
  });

  describe('Modal Submission Handling', () => {
    it('should create a season with valid modal input', async () => {
      // Mock valid form input
      mockInteraction.fields.getTextInputValue.mockImplementation((fieldId: string) => {
        switch (fieldId) {
          case 'minPlayersInput': return '2';
          case 'maxPlayersInput': return '6';
          case 'openDurationInput': return '7d';
          case 'seasonNameInput': return 'Test Season';
          case 'turnPatternInput': return 'writing,drawing';
          default: return '';
        }
      });

      await handler.execute(mockInteraction);

      // Verify interaction was replied to
      expect(mockInteraction.reply).toHaveBeenCalled();
      expect(mockInteraction.channel.send).toHaveBeenCalled();

      // Verify a season was created
      const seasons = await prisma.season.findMany({
        include: {
          config: true,
          creator: true
        },
        orderBy: { createdAt: 'desc' },
        take: 1
      });

      expect(seasons.length).toBe(1);
      const season = seasons[0];
      expect(season.config.minPlayers).toBe(2);
      expect(season.config.maxPlayers).toBe(6);
      expect(season.creator.discordUserId).toBe(testUserId);
    });

    it('should handle invalid min/max players validation', async () => {
      // Mock invalid input - min > max
      mockInteraction.fields.getTextInputValue.mockImplementation((fieldId: string) => {
        switch (fieldId) {
          case 'minPlayersInput': return '8';
          case 'maxPlayersInput': return '4';
          case 'openDurationInput': return '';
          case 'seasonNameInput': return '';
          case 'turnPatternInput': return '';
          default: return '';
        }
      });

      await handler.execute(mockInteraction);

      // Should reply with error message
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Min Players cannot be greater than Max Players.',
        ephemeral: true
      });

      // Should not send public message
      expect(mockInteraction.channel.send).not.toHaveBeenCalled();
    });

    it('should handle non-numeric player inputs', async () => {
      // Mock invalid input - non-numeric
      mockInteraction.fields.getTextInputValue.mockImplementation((fieldId: string) => {
        switch (fieldId) {
          case 'minPlayersInput': return 'abc';
          case 'maxPlayersInput': return '4';
          case 'openDurationInput': return '';
          case 'seasonNameInput': return '';
          case 'turnPatternInput': return '';
          default: return '';
        }
      });

      await handler.execute(mockInteraction);

      // Should reply with error message
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Min Players must be a positive number.',
        ephemeral: true
      });
    });

    it('should create player record if user does not exist', async () => {
      const newUserId = 'new-modal-user-id';
      mockInteraction.user.id = newUserId;
      mockInteraction.user.username = 'NewModalUser';

      // Mock valid form input
      mockInteraction.fields.getTextInputValue.mockImplementation((fieldId: string) => {
        switch (fieldId) {
          case 'minPlayersInput': return '3';
          case 'maxPlayersInput': return '5';
          case 'openDurationInput': return '';
          case 'seasonNameInput': return '';
          case 'turnPatternInput': return '';
          default: return '';
        }
      });

      await handler.execute(mockInteraction);

      // Verify player was created
      const player = await prisma.player.findUnique({
        where: { discordUserId: newUserId }
      });
      expect(player).toBeTruthy();
      expect(player?.name).toBe('NewModalUser');

      // Clean up
      if (player) {
        await prisma.playersOnSeasons.deleteMany({
          where: { playerId: player.id }
        });
        await prisma.season.deleteMany({
          where: { creatorId: player.id }
        });
        await prisma.player.delete({
          where: { id: player.id }
        });
      }
    });

    it('should handle optional fields correctly', async () => {
      // Mock input with only required fields
      mockInteraction.fields.getTextInputValue.mockImplementation((fieldId: string) => {
        switch (fieldId) {
          case 'minPlayersInput': return '2';
          case 'maxPlayersInput': return '8';
          case 'openDurationInput': return ''; // Optional - empty
          case 'seasonNameInput': return ''; // Optional - empty
          case 'turnPatternInput': return ''; // Optional - empty
          default: return '';
        }
      });

      await handler.execute(mockInteraction);

      // Should succeed with defaults
      expect(mockInteraction.reply).toHaveBeenCalled();
      expect(mockInteraction.channel.send).toHaveBeenCalled();

      // Verify season was created with correct config
      const seasons = await prisma.season.findMany({
        include: { config: true },
        orderBy: { createdAt: 'desc' },
        take: 1
      });

      expect(seasons.length).toBe(1);
      expect(seasons[0].config.minPlayers).toBe(2);
      expect(seasons[0].config.maxPlayers).toBe(8);
    });
  });

  describe('Error Handling', () => {
    it('should handle unrecognized customId', async () => {
      mockInteraction.customId = 'unknown_modal_id';

      await handler.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Sorry, this action isn\'t recognized.',
        ephemeral: true
      });
    });

    it('should handle database errors gracefully', async () => {
      // Mock valid input but force a database error by using invalid data
      mockInteraction.fields.getTextInputValue.mockImplementation((fieldId: string) => {
        switch (fieldId) {
          case 'minPlayersInput': return '2';
          case 'maxPlayersInput': return '6';
          case 'openDurationInput': return '';
          case 'seasonNameInput': return '';
          case 'turnPatternInput': return '';
          default: return '';
        }
      });

      // Mock prisma to throw an error
      const originalCreate = prisma.player.create;
      prisma.player.create = vi.fn().mockRejectedValue(new Error('Database error'));

      await handler.execute(mockInteraction);

      // Should handle error gracefully
      expect(mockInteraction.reply).toHaveBeenCalled();
      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall.ephemeral).toBe(true);

      // Restore original method
      prisma.player.create = originalCreate;
    });
  });

  describe('State Management', () => {
    it('should clean up state after successful creation', async () => {
      const { seasonCreationState } = await import('../../src/handlers/seasonCreateModalHandler.js');

      // Mock valid input
      mockInteraction.fields.getTextInputValue.mockImplementation((fieldId: string) => {
        switch (fieldId) {
          case 'minPlayersInput': return '2';
          case 'maxPlayersInput': return '6';
          case 'openDurationInput': return '';
          case 'seasonNameInput': return '';
          case 'turnPatternInput': return '';
          default: return '';
        }
      });

      // Verify state is cleaned up after execution
      await handler.execute(mockInteraction);
      expect(seasonCreationState.has(testUserId)).toBe(false);
    });

    it('should clean up state after error', async () => {
      const { seasonCreationState } = await import('../../src/handlers/seasonCreateModalHandler.js');

      // Mock invalid input to trigger error
      mockInteraction.fields.getTextInputValue.mockImplementation((fieldId: string) => {
        switch (fieldId) {
          case 'minPlayersInput': return 'invalid';
          case 'maxPlayersInput': return '6';
          case 'openDurationInput': return '';
          case 'seasonNameInput': return '';
          case 'turnPatternInput': return '';
          default: return '';
        }
      });

      await handler.execute(mockInteraction);
      
      // State should be cleaned up even after error
      expect(seasonCreationState.has(testUserId)).toBe(false);
    });
  });
}); 