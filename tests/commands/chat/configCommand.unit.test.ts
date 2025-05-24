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
    getRef: vi.fn().mockReturnValue('config'),
    getRefLocalizationMap: vi.fn().mockReturnValue({})
  },
  Language: {
    Default: 'en-US'
  }
}));

// Mock the messaging layer
vi.mock('../../../src/messaging/MessageHelpers.js', () => ({
  MessageHelpers: {
    embedMessage: vi.fn().mockReturnValue({ type: 'embed', content: 'mock message' })
  }
}));

vi.mock('../../../src/messaging/MessageAdapter.js', () => ({
  MessageAdapter: {
    processInstruction: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock ConfigService
const mockConfigService = {
  getGuildDefaultConfig: vi.fn(),
  updateGuildDefaultConfig: vi.fn(),
  formatConfigForDisplay: vi.fn()
};

vi.mock('../../../src/services/ConfigService.js', () => ({
  ConfigService: vi.fn().mockImplementation(() => mockConfigService)
}));

// Import ConfigCommand after mocks are set up
const { ConfigCommand } = await import('../../../src/commands/chat/config-command.js');

describe('ConfigCommand - Unit Tests', () => {
  let configCommand: InstanceType<typeof ConfigCommand>;
  let mockInteraction: any;
  let mockEventData: EventData;

  beforeEach(() => {
    vi.clearAllMocks();
    configCommand = new ConfigCommand();
    mockEventData = { lang: Language.Default, langGuild: Language.Default };

    // Create a comprehensive mock interaction
    mockInteraction = {
      user: {
        id: '510875521354039317' // Real admin ID from config
      },
      guild: {
        id: 'test-guild-id',
        shardId: 0
      },
      options: {
        getSubcommandGroup: vi.fn(),
        getSubcommand: vi.fn(),
        getString: vi.fn(),
        getInteger: vi.fn()
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
      mockInteraction.options.getSubcommandGroup.mockReturnValue('seasons');
      mockInteraction.options.getSubcommand.mockReturnValue('view');

      await configCommand.execute(mockInteraction, mockEventData);

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

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call MessageHelpers.embedMessage with admin-only warning
      expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
        'warning',
        LangKeys.Commands.Config.NotAdmin,
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
  });

  describe('Subcommand group routing logic', () => {
    beforeEach(() => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
    });

    it('should route to handleSeasonsCommand for "seasons" subcommand group', async () => {
      mockInteraction.options.getSubcommandGroup.mockReturnValue('seasons');
      mockInteraction.options.getSubcommand.mockReturnValue('view');

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call getSubcommand (indicating it proceeded to handleSeasonsCommand)
      expect(mockInteraction.options.getSubcommand).toHaveBeenCalled();
    });

    it('should handle unknown subcommand groups', async () => {
      mockInteraction.options.getSubcommandGroup.mockReturnValue('unknown');

      await configCommand.execute(mockInteraction, mockEventData);

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

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call MessageHelpers.embedMessage with not implemented warning
      expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
        'warning',
        'errorEmbeds.notImplemented',
        {},
        true
      );
    });
  });

  describe('View command logic', () => {
    beforeEach(() => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
      mockInteraction.options.getSubcommandGroup.mockReturnValue('seasons');
      mockInteraction.options.getSubcommand.mockReturnValue('view');
    });

    it('should successfully display config for valid guild', async () => {
      const mockConfig = {
        id: 'config-id',
        turnPattern: 'WDWDWD',
        claimTimeout: '24h',
        writingTimeout: '48h',
        writingWarning: '12h',
        drawingTimeout: '24h',
        drawingWarning: '6h',
        openDuration: '7d',
        minPlayers: 3,
        maxPlayers: 8,
        isGuildDefaultFor: 'test-guild-id',
        updatedAt: new Date()
      };

      const mockFormattedConfig = {
        turnPattern: 'WDWDWD',
        claimTimeout: '24h',
        writingTimeout: '48h',
        writingWarning: '12h',
        drawingTimeout: '24h',
        drawingWarning: '6h',
        openDuration: '7d',
        minPlayers: 3,
        maxPlayers: 8,
        isGuildDefault: 'Yes',
        lastUpdated: mockConfig.updatedAt.toISOString()
      };

      mockConfigService.getGuildDefaultConfig.mockResolvedValue(mockConfig);
      mockConfigService.formatConfigForDisplay.mockReturnValue(mockFormattedConfig);

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call ConfigService methods
      expect(mockConfigService.getGuildDefaultConfig).toHaveBeenCalledWith('test-guild-id');
      expect(mockConfigService.formatConfigForDisplay).toHaveBeenCalledWith(mockConfig);

      // Should call MessageHelpers.embedMessage with view success
      expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
        'info',
        LangKeys.Commands.Config.ViewSuccess,
        expect.objectContaining({
          GUILD_ID: 'test-guild-id',
          TURN_PATTERN: 'WDWDWD',
          CLAIM_TIMEOUT: '24h',
          WRITING_TIMEOUT: '48h',
          WRITING_WARNING: '12h',
          DRAWING_TIMEOUT: '24h',
          DRAWING_WARNING: '6h',
          OPEN_DURATION: '7d',
          MIN_PLAYERS: 3,
          MAX_PLAYERS: 8,
          IS_GUILD_DEFAULT: 'Yes',
          LAST_UPDATED: mockConfig.updatedAt.toISOString()
        }),
        true
      );
    });

    it('should handle missing guild context', async () => {
      mockInteraction.guild = null;

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call MessageHelpers.embedMessage with guild only error
      expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
        'error',
        'errorEmbeds.guildOnly',
        {},
        true
      );
    });

    it('should handle ConfigService errors', async () => {
      mockConfigService.getGuildDefaultConfig.mockRejectedValue(new Error('Database error'));

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call MessageHelpers.embedMessage with command error
      expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
        'error',
        'errorEmbeds.command',
        expect.objectContaining({
          ERROR_CODE: 'CONFIG_VIEW_ERROR',
          GUILD_ID: 'test-guild-id',
          SHARD_ID: '0'
        }),
        true
      );
    });
  });

  describe('Set command logic', () => {
    beforeEach(() => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
      mockInteraction.options.getSubcommandGroup.mockReturnValue('seasons');
      mockInteraction.options.getSubcommand.mockReturnValue('set');
    });

    it('should successfully update config with valid data', async () => {
      mockInteraction.options.getString.mockImplementation((key: string) => {
        switch (key) {
          case 'turn_pattern': return 'writing,drawing';
          case 'claim_timeout': return '12h';
          default: return null;
        }
      });
      mockInteraction.options.getInteger.mockImplementation((key: string) => {
        switch (key) {
          case 'min_players': return 4;
          case 'max_players': return 10;
          default: return null;
        }
      });

      const mockResult = {
        type: 'success' as const,
        key: 'messages.config.updateSuccess',
        data: { guildId: 'test-guild-id', updatedFields: 'turnPattern, claimTimeout, minPlayers, maxPlayers' }
      };

      mockConfigService.updateGuildDefaultConfig.mockResolvedValue(mockResult);

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call ConfigService with correct updates
      expect(mockConfigService.updateGuildDefaultConfig).toHaveBeenCalledWith(
        'test-guild-id',
        {
          turnPattern: 'writing,drawing',
          claimTimeout: '12h',
          minPlayers: 4,
          maxPlayers: 10
        }
      );

      // Should call MessageAdapter with the result
      expect(MessageAdapter.processInstruction).toHaveBeenCalledWith(
        mockResult,
        mockInteraction,
        mockEventData.lang
      );
    });

    it('should handle no updates provided', async () => {
      mockInteraction.options.getString.mockReturnValue(null);
      mockInteraction.options.getInteger.mockReturnValue(null);

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call MessageHelpers.embedMessage with no updates warning
      expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
        'warning',
        'config.no_updates_provided',
        {},
        true
      );
    });

    it('should handle missing guild context', async () => {
      mockInteraction.guild = null;

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call MessageHelpers.embedMessage with guild only error
      expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
        'error',
        'errorEmbeds.guildOnly',
        {},
        true
      );
    });

    it('should handle ConfigService errors', async () => {
      mockInteraction.options.getString.mockImplementation((key: string) => {
        if (key === 'turn_pattern') return 'writing,drawing';
        return null;
      });
      mockInteraction.options.getInteger.mockReturnValue(null);

      mockConfigService.updateGuildDefaultConfig.mockRejectedValue(new Error('Database error'));

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call MessageHelpers.embedMessage with command error
      expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
        'error',
        'errorEmbeds.command',
        expect.objectContaining({
          ERROR_CODE: 'CONFIG_SET_ERROR',
          GUILD_ID: 'test-guild-id',
          SHARD_ID: '0'
        }),
        true
      );
    });
  });

  describe('Unknown subcommand handling', () => {
    beforeEach(() => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
      mockInteraction.options.getSubcommandGroup.mockReturnValue('seasons');
    });

    it('should handle unknown subcommands', async () => {
      mockInteraction.options.getSubcommand.mockReturnValue('unknown');

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call MessageHelpers.embedMessage with not implemented warning
      expect(MessageHelpers.embedMessage).toHaveBeenCalledWith(
        'warning',
        'errorEmbeds.notImplemented',
        {},
        true
      );
    });
  });
}); 