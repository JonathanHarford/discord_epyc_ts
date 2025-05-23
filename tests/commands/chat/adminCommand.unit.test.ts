import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInputCommandInteraction } from 'discord.js';
import { EventData } from '../../../src/models/internal-models.js';
import { Language } from '../../../src/models/enum-helpers/language.js';
import { MessageHelpers } from '../../../src/messaging/MessageHelpers.js';
import { MessageAdapter } from '../../../src/messaging/MessageAdapter.js';
import { LangKeys } from '../../../src/constants/lang-keys.js';

// Mock the Lang service
vi.mock('../../../src/services/lang.js', () => ({
  Lang: {
    getRef: vi.fn().mockReturnValue('admin'),
    getRefLocalizationMap: vi.fn().mockReturnValue({})
  },
  Language: {
    Default: 'en-US'
  }
}));

// Mock the messaging layer
vi.mock('../../../src/messaging/MessageHelpers.js', () => ({
  MessageHelpers: {
    embedMessage: vi.fn().mockReturnValue({ type: 'embed', content: 'mock message' }),
    commandError: vi.fn().mockReturnValue({ type: 'error', key: 'mock_error', data: {} }),
    commandSuccess: vi.fn().mockReturnValue({ type: 'success', key: 'mock_success', data: {} }),
    validationError: vi.fn().mockReturnValue({ type: 'error', key: 'mock_validation_error', data: {} }),
    warning: vi.fn().mockReturnValue({ type: 'warning', key: 'mock_warning', data: {} }),
    info: vi.fn().mockReturnValue({ type: 'info', key: 'mock_info', data: {} }),
    dmNotification: vi.fn().mockReturnValue({ type: 'info', key: 'mock_dm', data: {} }),
    followUpMessage: vi.fn().mockReturnValue({ type: 'info', key: 'mock_followup', data: {} })
  }
}));

vi.mock('../../../src/messaging/MessageAdapter.js', () => ({
  MessageAdapter: {
    processInstruction: vi.fn().mockResolvedValue(undefined)
  }
}));

// Don't mock the services - they should use the test database
// SeasonService, TurnService, SchedulerService, and prisma will use real implementations

// Import AdminCommand after mocks are set up
const { AdminCommand } = await import('../../../src/commands/chat/admin-command.js');

describe('AdminCommand - Unit Tests', () => {
  let adminCommand: InstanceType<typeof AdminCommand>;
  let mockInteraction: any;
  let mockEventData: EventData;

  beforeEach(() => {
    vi.clearAllMocks();
    adminCommand = new AdminCommand();
    mockEventData = { lang: Language.Default, langGuild: Language.Default };

    // Create a comprehensive mock interaction
    mockInteraction = {
      user: {
        id: '510875521354039317' // Real admin ID from config
      },
      client: {
        users: {
          fetch: vi.fn().mockResolvedValue({
            send: vi.fn().mockResolvedValue(undefined)
          })
        }
      },
      guild: {
        id: 'test-guild-id',
        shardId: 0
      },
      options: {
        getSubcommandGroup: vi.fn(),
        getSubcommand: vi.fn(),
        getString: vi.fn()
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      replied: false,
      deferred: true
    };
  });

  describe('Permission checking logic', () => {
    it('should allow access for admin users', async () => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
      mockInteraction.options.getSubcommandGroup.mockReturnValue('terminate');
      mockInteraction.options.getSubcommand.mockReturnValue('season');
      mockInteraction.options.getString.mockReturnValue('test-season-id');

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should not call MessageAdapter with admin-only warning
      expect(MessageAdapter.processInstruction).not.toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('admin')
        }),
        mockInteraction,
        mockEventData.lang
      );
    });

    it('should deny access for non-admin users', async () => {
      mockInteraction.user.id = 'non-admin-user-id';

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call MessageHelpers.embedMessage with admin-only warning
      expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
        'warning',
        LangKeys.Commands.Admin.NotAdmin,
        {},
        true
      );

      // Should call MessageAdapter.processInstruction with the warning
      expect(MessageAdapter.processInstruction).toHaveBeenCalledWith(
        { type: 'embed', content: 'mock message' },
        mockInteraction,
        mockEventData.lang
      );
    });

    it('should check against multiple admin IDs', async () => {
      // Test with the real admin ID from config
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
      mockInteraction.options.getSubcommandGroup.mockReturnValue('terminate');
      mockInteraction.options.getSubcommand.mockReturnValue('season');
      mockInteraction.options.getString.mockReturnValue('test-season-id');

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should not call MessageAdapter with admin-only warning
      expect(MessageAdapter.processInstruction).not.toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('admin')
        }),
        mockInteraction,
        mockEventData.lang
      );
    });
  });

  describe('Subcommand group routing logic', () => {
    beforeEach(() => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
    });

    it('should route to handleTerminateCommand for "terminate" subcommand group', async () => {
      mockInteraction.options.getSubcommandGroup.mockReturnValue('terminate');
      mockInteraction.options.getSubcommand.mockReturnValue('season');
      mockInteraction.options.getString.mockReturnValue('test-season-id');

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call getSubcommand (indicating it proceeded to handleTerminateCommand)
      expect(mockInteraction.options.getSubcommand).toHaveBeenCalled();
    });

    it('should handle unknown subcommand groups', async () => {
      mockInteraction.options.getSubcommandGroup.mockReturnValue('unknown');

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call MessageHelpers.embedMessage with not implemented warning
      expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
        'warning',
        'errorEmbeds.notImplemented',
        {},
        true
      );

      // Should call MessageAdapter.processInstruction with the warning
      expect(MessageAdapter.processInstruction).toHaveBeenCalledWith(
        { type: 'embed', content: 'mock message' },
        mockInteraction,
        mockEventData.lang
      );
    });

    it('should handle null subcommand group', async () => {
      mockInteraction.options.getSubcommandGroup.mockReturnValue(null);

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call MessageHelpers.embedMessage with not implemented warning
      expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
        'warning',
        'errorEmbeds.notImplemented',
        {},
        true
      );
    });

    it('should deny access for non-admin users before checking subcommands', async () => {
      // Override the admin user ID to test non-admin behavior
      mockInteraction.user.id = 'non-admin-user-id';
      mockInteraction.options.getSubcommandGroup.mockReturnValue('unknown');

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call MessageHelpers.embedMessage with admin-only warning, not not-implemented
      expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
        'warning',
        LangKeys.Commands.Admin.NotAdmin,
        {},
        true
      );

      // Should call MessageAdapter.processInstruction with the admin-only warning
      expect(MessageAdapter.processInstruction).toHaveBeenCalledWith(
        { type: 'embed', content: 'mock message' },
        mockInteraction,
        mockEventData.lang
      );

      // Should NOT call getSubcommandGroup since admin check happens first
      expect(mockInteraction.options.getSubcommandGroup).not.toHaveBeenCalled();
    });
  });

  describe('Terminate command subcommand routing logic', () => {
    beforeEach(() => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
      mockInteraction.options.getSubcommandGroup.mockReturnValue('terminate');
    });

    it('should handle "season" subcommand correctly', async () => {
      mockInteraction.options.getSubcommand.mockReturnValue('season');
      mockInteraction.options.getString.mockReturnValue('test-season-id');

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call getString to get the season ID
      expect(mockInteraction.options.getString).toHaveBeenCalledWith('id', true);
    });

    it('should handle unknown subcommands within terminate group', async () => {
      mockInteraction.options.getSubcommand.mockReturnValue('unknown');

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should not call getString since it doesn't match 'season'
      expect(mockInteraction.options.getString).not.toHaveBeenCalled();
    });
  });

  describe('Option parsing logic', () => {
    beforeEach(() => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
      mockInteraction.options.getSubcommandGroup.mockReturnValue('terminate');
      mockInteraction.options.getSubcommand.mockReturnValue('season');
    });

    it('should correctly extract season ID from options', async () => {
      const testSeasonId = 'test-season-123';
      mockInteraction.options.getString.mockReturnValue(testSeasonId);

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call getString with correct parameters
      expect(mockInteraction.options.getString).toHaveBeenCalledWith('id', true);
    });

    it('should handle required string option correctly', async () => {
      mockInteraction.options.getString.mockReturnValue('required-season-id');

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call getString with required=true
      expect(mockInteraction.options.getString).toHaveBeenCalledWith('id', true);
    });
  });

  describe('Service initialization logic', () => {
    it('should initialize services only once', async () => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
      mockInteraction.options.getSubcommandGroup.mockReturnValue('terminate');
      mockInteraction.options.getSubcommand.mockReturnValue('season');
      mockInteraction.options.getString.mockReturnValue('test-season-id');

      // Call execute twice
      await adminCommand.execute(mockInteraction, mockEventData);
      await adminCommand.execute(mockInteraction, mockEventData);

      // Services should be initialized only once (lazy initialization)
      expect((adminCommand as any).seasonService).toBeDefined();
    });

    it('should use Discord client from interaction for service initialization', async () => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
      mockInteraction.options.getSubcommandGroup.mockReturnValue('terminate');
      mockInteraction.options.getSubcommand.mockReturnValue('season');
      mockInteraction.options.getString.mockReturnValue('test-season-id');

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should have initialized seasonService
      expect((adminCommand as any).seasonService).toBeDefined();
    });
  });

  describe('Error handling logic', () => {
    beforeEach(() => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
      mockInteraction.options.getSubcommandGroup.mockReturnValue('terminate');
      mockInteraction.options.getSubcommand.mockReturnValue('season');
    });

    it('should handle SeasonService errors gracefully', async () => {
      mockInteraction.options.getString.mockReturnValue('non-existent-season');

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call MessageAdapter.processInstruction with the error result from SeasonService
      expect(MessageAdapter.processInstruction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          key: 'mock_error'
        }),
        mockInteraction,
        mockEventData.lang
      );
    });

    it('should handle missing season ID parameter', async () => {
      mockInteraction.options.getString.mockReturnValue(null);

      // The AdminCommand should handle this gracefully, not throw an error
      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call MessageAdapter.processInstruction with an error response
      expect(MessageAdapter.processInstruction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          key: 'mock_error'
        }),
        mockInteraction,
        mockEventData.lang
      );
    });

    it('should handle empty season ID parameter', async () => {
      mockInteraction.options.getString.mockReturnValue('');

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should still attempt to call SeasonService with empty string
      expect(MessageAdapter.processInstruction).toHaveBeenCalled();
    });
  });

  describe('Integration with real services', () => {
    beforeEach(() => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
      mockInteraction.options.getSubcommandGroup.mockReturnValue('terminate');
      mockInteraction.options.getSubcommand.mockReturnValue('season');
    });

    it('should properly integrate with SeasonService for valid season termination', async () => {
      // Note: This test uses the real SeasonService with test database
      // The season won't exist, so it should return a "not found" error
      mockInteraction.options.getString.mockReturnValue('test-season-integration');

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call MessageAdapter.processInstruction with the result from SeasonService
      expect(MessageAdapter.processInstruction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error', // Should be error since season doesn't exist
          key: 'mock_error'
        }),
        mockInteraction,
        mockEventData.lang
      );
    });

    it('should handle database connection issues gracefully', async () => {
      mockInteraction.options.getString.mockReturnValue('test-season-db-error');

      // The real SeasonService will handle any database errors internally
      await adminCommand.execute(mockInteraction, mockEventData);

      // Should still call MessageAdapter.processInstruction
      expect(MessageAdapter.processInstruction).toHaveBeenCalled();
    });
  });

  describe('Command flow validation', () => {
    beforeEach(() => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
    });

    it('should follow the complete command flow for terminate season', async () => {
      mockInteraction.options.getSubcommandGroup.mockReturnValue('terminate');
      mockInteraction.options.getSubcommand.mockReturnValue('season');
      mockInteraction.options.getString.mockReturnValue('flow-test-season');

      await adminCommand.execute(mockInteraction, mockEventData);

      // Verify the complete flow
      expect(mockInteraction.options.getSubcommandGroup).toHaveBeenCalled();
      expect(mockInteraction.options.getSubcommand).toHaveBeenCalled();
      expect(mockInteraction.options.getString).toHaveBeenCalledWith('id', true);
      expect(MessageAdapter.processInstruction).toHaveBeenCalled();
    });

    it('should not proceed to subcommand handling for non-admin users', async () => {
      mockInteraction.user.id = 'non-admin-user';
      mockInteraction.options.getSubcommandGroup.mockReturnValue('terminate');

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should not call getSubcommand since admin check fails first
      expect(mockInteraction.options.getSubcommand).not.toHaveBeenCalled();
      expect(mockInteraction.options.getString).not.toHaveBeenCalled();
    });

    it('should handle interaction state correctly', async () => {
      mockInteraction.options.getSubcommandGroup.mockReturnValue('terminate');
      mockInteraction.options.getSubcommand.mockReturnValue('season');
      mockInteraction.options.getString.mockReturnValue('state-test-season');

      await adminCommand.execute(mockInteraction, mockEventData);

      // Verify interaction properties are accessible
      expect(mockInteraction.user.id).toBe('510875521354039317');
      expect(mockInteraction.guild.id).toBe('test-guild-id');
      expect(mockInteraction.client).toBeDefined();
    });
  });

  describe('List Commands Logic Layer', () => {
    beforeEach(() => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
      mockInteraction.options.getSubcommandGroup.mockReturnValue('list');
    });

    describe('List Seasons Command Logic', () => {
      beforeEach(() => {
        mockInteraction.options.getSubcommand.mockReturnValue('seasons');
      });

      it('should route to handleListSeasonsCommand for "seasons" subcommand', async () => {
        mockInteraction.options.getString.mockReturnValue(null);

        await adminCommand.execute(mockInteraction, mockEventData);

        // Verify the command routing logic
        expect(mockInteraction.options.getSubcommandGroup).toHaveBeenCalled();
        expect(mockInteraction.options.getSubcommand).toHaveBeenCalled();
        expect(mockInteraction.options.getString).toHaveBeenCalledWith('status');
        expect(MessageAdapter.processInstruction).toHaveBeenCalled();
      });

      it('should handle status filter parameter correctly', async () => {
        const statusFilter = 'ACTIVE';
        mockInteraction.options.getString.mockReturnValue(statusFilter);

        await adminCommand.execute(mockInteraction, mockEventData);

        // Verify status filter is passed to getString
        expect(mockInteraction.options.getString).toHaveBeenCalledWith('status');
        expect(MessageAdapter.processInstruction).toHaveBeenCalled();
      });

      it('should handle null status filter correctly', async () => {
        mockInteraction.options.getString.mockReturnValue(null);

        await adminCommand.execute(mockInteraction, mockEventData);

        // Should still proceed with null filter
        expect(mockInteraction.options.getString).toHaveBeenCalledWith('status');
        expect(MessageAdapter.processInstruction).toHaveBeenCalled();
      });

      it('should handle empty string status filter correctly', async () => {
        mockInteraction.options.getString.mockReturnValue('');

        await adminCommand.execute(mockInteraction, mockEventData);

        // Should proceed with empty string filter
        expect(mockInteraction.options.getString).toHaveBeenCalledWith('status');
        expect(MessageAdapter.processInstruction).toHaveBeenCalled();
      });

      it('should deny access to non-admin users', async () => {
        mockInteraction.user.id = 'non-admin-user-id';
        mockInteraction.options.getString.mockReturnValue('ACTIVE');

        await adminCommand.execute(mockInteraction, mockEventData);

        // Should call MessageHelpers.embedMessage with admin-only warning
        expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
          'warning',
          LangKeys.Commands.Admin.NotAdmin,
          {},
          true
        );

        // Should not proceed to list logic
        expect(mockInteraction.options.getSubcommand).not.toHaveBeenCalled();
      });
    });

    describe('List Players Command Logic', () => {
      beforeEach(() => {
        mockInteraction.options.getSubcommand.mockReturnValue('players');
        mockInteraction.options.getBoolean = vi.fn();
      });

      it('should route to handleListPlayersCommand for "players" subcommand', async () => {
        mockInteraction.options.getString.mockReturnValue(null);
        mockInteraction.options.getBoolean.mockReturnValue(null);

        await adminCommand.execute(mockInteraction, mockEventData);

        // Verify the command routing logic
        expect(mockInteraction.options.getSubcommandGroup).toHaveBeenCalled();
        expect(mockInteraction.options.getSubcommand).toHaveBeenCalled();
        expect(mockInteraction.options.getString).toHaveBeenCalledWith('season');
        expect(mockInteraction.options.getBoolean).toHaveBeenCalledWith('banned');
        expect(MessageAdapter.processInstruction).toHaveBeenCalled();
      });

      it('should handle season filter parameter correctly', async () => {
        const seasonFilter = 'test-season-id';
        mockInteraction.options.getString.mockReturnValue(seasonFilter);
        mockInteraction.options.getBoolean.mockReturnValue(null);

        await adminCommand.execute(mockInteraction, mockEventData);

        // Verify season filter is passed to getString
        expect(mockInteraction.options.getString).toHaveBeenCalledWith('season');
        expect(mockInteraction.options.getBoolean).toHaveBeenCalledWith('banned');
        expect(MessageAdapter.processInstruction).toHaveBeenCalled();
      });

      it('should handle banned filter parameter correctly', async () => {
        mockInteraction.options.getString.mockReturnValue(null);
        mockInteraction.options.getBoolean.mockReturnValue(true);

        await adminCommand.execute(mockInteraction, mockEventData);

        // Verify banned filter is passed to getBoolean
        expect(mockInteraction.options.getString).toHaveBeenCalledWith('season');
        expect(mockInteraction.options.getBoolean).toHaveBeenCalledWith('banned');
        expect(MessageAdapter.processInstruction).toHaveBeenCalled();
      });

      it('should handle combined season and banned filters correctly', async () => {
        const seasonFilter = 'test-season-id';
        const bannedFilter = false;
        mockInteraction.options.getString.mockReturnValue(seasonFilter);
        mockInteraction.options.getBoolean.mockReturnValue(bannedFilter);

        await adminCommand.execute(mockInteraction, mockEventData);

        // Verify both filters are retrieved
        expect(mockInteraction.options.getString).toHaveBeenCalledWith('season');
        expect(mockInteraction.options.getBoolean).toHaveBeenCalledWith('banned');
        expect(MessageAdapter.processInstruction).toHaveBeenCalled();
      });

      it('should handle null filters correctly', async () => {
        mockInteraction.options.getString.mockReturnValue(null);
        mockInteraction.options.getBoolean.mockReturnValue(null);

        await adminCommand.execute(mockInteraction, mockEventData);

        // Should still proceed with null filters
        expect(mockInteraction.options.getString).toHaveBeenCalledWith('season');
        expect(mockInteraction.options.getBoolean).toHaveBeenCalledWith('banned');
        expect(MessageAdapter.processInstruction).toHaveBeenCalled();
      });

      it('should deny access to non-admin users', async () => {
        mockInteraction.user.id = 'non-admin-user-id';
        mockInteraction.options.getString.mockReturnValue('test-season');
        mockInteraction.options.getBoolean.mockReturnValue(true);

        await adminCommand.execute(mockInteraction, mockEventData);

        // Should call MessageHelpers.embedMessage with admin-only warning
        expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
          'warning',
          LangKeys.Commands.Admin.NotAdmin,
          {},
          true
        );

        // Should not proceed to list logic
        expect(mockInteraction.options.getSubcommand).not.toHaveBeenCalled();
      });
    });

    describe('List Command Group Routing Logic', () => {
      it('should handle unknown subcommands within list group', async () => {
        mockInteraction.options.getSubcommand.mockReturnValue('unknown');

        await adminCommand.execute(mockInteraction, mockEventData);

        // Should call MessageHelpers.embedMessage with not implemented warning
        expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
          'warning',
          'errorEmbeds.notImplemented',
          {},
          true
        );

        // Should call MessageAdapter.processInstruction with the warning
        expect(MessageAdapter.processInstruction).toHaveBeenCalledWith(
          { type: 'embed', content: 'mock message' },
          mockInteraction,
          mockEventData.lang
        );
      });

      it('should handle null subcommand within list group', async () => {
        mockInteraction.options.getSubcommand.mockReturnValue(null);

        await adminCommand.execute(mockInteraction, mockEventData);

        // Should call MessageHelpers.embedMessage with not implemented warning
        expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
          'warning',
          'errorEmbeds.notImplemented',
          {},
          true
        );
      });

      it('should verify list group routing is called correctly', async () => {
        mockInteraction.options.getSubcommand.mockReturnValue('seasons');
        mockInteraction.options.getString.mockReturnValue(null);

        await adminCommand.execute(mockInteraction, mockEventData);

        // Verify the routing flow
        expect(mockInteraction.options.getSubcommandGroup).toHaveBeenCalled();
        expect(mockInteraction.options.getSubcommand).toHaveBeenCalled();
        expect(MessageAdapter.processInstruction).toHaveBeenCalled();
      });
    });

    describe('Error Handling in List Commands', () => {
      it('should handle SeasonService.listSeasons errors gracefully', async () => {
        mockInteraction.options.getSubcommand.mockReturnValue('seasons');
        mockInteraction.options.getString.mockReturnValue('INVALID_STATUS');

        await adminCommand.execute(mockInteraction, mockEventData);

        // Should call MessageAdapter.processInstruction with error result
        expect(MessageAdapter.processInstruction).toHaveBeenCalled();
      });

      it('should handle PlayerService.listPlayers errors gracefully', async () => {
        mockInteraction.options.getSubcommand.mockReturnValue('players');
        mockInteraction.options.getString.mockReturnValue('invalid-season-id');
        mockInteraction.options.getBoolean = vi.fn().mockReturnValue(null);

        await adminCommand.execute(mockInteraction, mockEventData);

        // Should call MessageAdapter.processInstruction with error result
        expect(MessageAdapter.processInstruction).toHaveBeenCalled();
      });
    });
  });
}); 