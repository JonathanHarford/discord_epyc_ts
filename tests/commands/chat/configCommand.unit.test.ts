import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInputCommandInteraction, Locale } from 'discord.js';
import { EventData } from '../../../src/models/internal-models.js';
import { SimpleMessage } from '../../../src/messaging/SimpleMessage.js';
import { strings } from '../../../src/lang/strings.js';

// Mock the SimpleMessage class
vi.mock('../../../src/messaging/SimpleMessage.js', () => ({
  SimpleMessage: {
    sendEmbed: vi.fn().mockResolvedValue(undefined),
    sendSuccess: vi.fn().mockResolvedValue(undefined),
    sendError: vi.fn().mockResolvedValue(undefined),
    sendWarning: vi.fn().mockResolvedValue(undefined),
    sendInfo: vi.fn().mockResolvedValue(undefined)
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
    mockEventData = new EventData(Locale.EnglishUS, Locale.EnglishUS);

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

      // Should not call SimpleMessage.sendWarning with admin warning
      expect(SimpleMessage.sendWarning).not.toHaveBeenCalledWith(
        mockInteraction,
        expect.stringContaining('admin'),
        expect.any(Object),
        true
      );
    });

    it('should deny access for non-admin users', async () => {
      mockInteraction.user.id = 'non-admin-user-id';

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call SimpleMessage.sendWarning with admin-only warning
      expect(SimpleMessage.sendWarning).toHaveBeenCalledWith(
        mockInteraction,
        strings.messages.admin.notAdmin,
        {},
        true
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

      // Should call SimpleMessage.sendEmbed with not implemented warning
      expect(SimpleMessage.sendEmbed).toHaveBeenCalledWith(
        mockInteraction,
        strings.embeds.errorEmbeds.notImplemented,
        {},
        true,
        'warning'
      );
    });

    it('should handle null subcommand group', async () => {
      mockInteraction.options.getSubcommandGroup.mockReturnValue(null);

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call SimpleMessage.sendEmbed with not implemented warning
      expect(SimpleMessage.sendEmbed).toHaveBeenCalledWith(
        mockInteraction,
        strings.embeds.errorEmbeds.notImplemented,
        {},
        true,
        'warning'
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

      // Should call SimpleMessage.sendEmbed with config view data
      expect(SimpleMessage.sendEmbed).toHaveBeenCalledWith(
        mockInteraction,
        strings.embeds.configView,
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
        true,
        'info'
      );
    });

    it('should handle missing guild context', async () => {
      mockInteraction.guild = null;

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call SimpleMessage.sendError with guild only error
      expect(SimpleMessage.sendError).toHaveBeenCalledWith(
        mockInteraction,
        "This command can only be used in a server.",
        {},
        true
      );
    });

    it('should handle ConfigService errors', async () => {
      mockConfigService.getGuildDefaultConfig.mockRejectedValue(new Error('Database error'));

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call SimpleMessage.sendEmbed with command error
      expect(SimpleMessage.sendEmbed).toHaveBeenCalledWith(
        mockInteraction,
        strings.embeds.errorEmbeds.command,
        expect.objectContaining({
          ERROR_CODE: 'CONFIG_VIEW_ERROR',
          GUILD_ID: 'test-guild-id',
          SHARD_ID: '0'
        }),
        true,
        'error'
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
        data: { guildId: 'test-guild-id', updatedFields: 'turnPattern, claimTimeout, minPlayers, maxPlayers' },
        formatting: { ephemeral: false }
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

      // Should call SimpleMessage.sendSuccess (through handleMessageInstruction)
      expect(SimpleMessage.sendSuccess).toHaveBeenCalledWith(
        mockInteraction,
        "Configuration updated successfully for guild test-guild-id!\n**Updated fields:** turnPattern, claimTimeout, minPlayers, maxPlayers",
        {},
        false
      );
    });

    it('should handle no updates provided', async () => {
      mockInteraction.options.getString.mockReturnValue(null);
      mockInteraction.options.getInteger.mockReturnValue(null);

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call SimpleMessage.sendWarning with no updates warning
      expect(SimpleMessage.sendWarning).toHaveBeenCalledWith(
        mockInteraction,
        strings.messages.config.noUpdatesProvided,
        {},
        true
      );
    });

    it('should handle missing guild context', async () => {
      mockInteraction.guild = null;

      await configCommand.execute(mockInteraction, mockEventData);

      // Should call SimpleMessage.sendError with guild only error
      expect(SimpleMessage.sendError).toHaveBeenCalledWith(
        mockInteraction,
        "This command can only be used in a server.",
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

      // Should call SimpleMessage.sendEmbed with command error
      expect(SimpleMessage.sendEmbed).toHaveBeenCalledWith(
        mockInteraction,
        strings.embeds.errorEmbeds.command,
        expect.objectContaining({
          ERROR_CODE: 'CONFIG_SET_ERROR',
          GUILD_ID: 'test-guild-id',
          SHARD_ID: '0'
        }),
        true,
        'error'
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

      // Should call SimpleMessage.sendEmbed with not implemented warning
      expect(SimpleMessage.sendEmbed).toHaveBeenCalledWith(
        mockInteraction,
        strings.embeds.errorEmbeds.notImplemented,
        {},
        true,
        'warning'
      );
    });
  });
}); 