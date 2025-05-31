import { Locale } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { strings } from '../../../src/lang/strings.js';
import { SimpleMessage } from '../../../src/messaging/SimpleMessage.js';
import { EventData } from '../../../src/models/internal-models.js';

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

// Mock PlayerService
const mockPlayerService = {
  banPlayer: vi.fn(),
  unbanPlayer: vi.fn(),
  listPlayers: vi.fn()
};

vi.mock('../../../src/services/PlayerService.js', () => ({
  PlayerService: vi.fn().mockImplementation(() => mockPlayerService)
}));

// Mock SeasonService
const mockSeasonService = {
  terminateSeason: vi.fn(),
  listSeasons: vi.fn()
};

vi.mock('../../../src/services/SeasonService.js', () => ({
  SeasonService: vi.fn().mockImplementation(() => mockSeasonService)
}));

// Mock SeasonTurnService
vi.mock('../../../src/services/SeasonTurnService.js', () => ({
  SeasonTurnService: vi.fn().mockImplementation(() => ({}))
}));

// Mock SchedulerService
vi.mock('../../../src/services/SchedulerService.js', () => ({
  SchedulerService: vi.fn().mockImplementation(() => ({}))
}));

// Import AdminCommand after mocks are set up
const { AdminCommand } = await import('../../../src/commands/chat/admin-command.js');

describe('AdminCommand - Unit Tests', () => {
  let adminCommand: InstanceType<typeof AdminCommand>;
  let mockInteraction: any;
  let mockEventData: EventData;

  beforeEach(() => {
    vi.clearAllMocks();
    adminCommand = new AdminCommand();
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
      client: {
        // Mock Discord client
      },
      options: {
        getSubcommandGroup: vi.fn(),
        getSubcommand: vi.fn(),
        getString: vi.fn(),
        getUser: vi.fn()
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
      mockInteraction.options.getSubcommandGroup.mockReturnValue('season');
      mockInteraction.options.getSubcommand.mockReturnValue('kill');
      mockInteraction.options.getString.mockReturnValue('test-season-id');

      // Mock successful termination
      const mockResult = {
        type: 'success' as const,
        key: 'messages.admin.terminateSeasonSuccess',
        data: { seasonId: 'test-season-id', previousStatus: 'OPEN', playerCount: 5, gameCount: 2 }
      };
      mockSeasonService.terminateSeason.mockResolvedValue(mockResult);

      await adminCommand.execute(mockInteraction, mockEventData);

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

      await adminCommand.execute(mockInteraction, mockEventData);

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

    it('should route to handleSeasonKillCommand for "season" subcommand group with "kill" subcommand', async () => {
      mockInteraction.options.getSubcommandGroup.mockReturnValue('season');
      mockInteraction.options.getSubcommand.mockReturnValue('kill');
      mockInteraction.options.getString.mockReturnValue('test-season-id');

      // Mock successful termination
      const mockResult = {
        type: 'success' as const,
        key: 'messages.admin.terminateSeasonSuccess',
        data: { seasonId: 'test-season-id', previousStatus: 'OPEN', playerCount: 5, gameCount: 2 }
      };
      mockSeasonService.terminateSeason.mockResolvedValue(mockResult);

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call the season service terminate method
      expect(mockSeasonService.terminateSeason).toHaveBeenCalledWith('test-season-id');
    });

    it('should handle unknown subcommand groups', async () => {
      mockInteraction.options.getSubcommandGroup.mockReturnValue('unknown');

      await adminCommand.execute(mockInteraction, mockEventData);

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

  describe('Player ban/unban functionality', () => {
    beforeEach(() => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
      mockInteraction.options.getSubcommandGroup.mockReturnValue('player');
    });

    it('should successfully ban a player', async () => {
      mockInteraction.options.getSubcommand.mockReturnValue('ban');
      mockInteraction.options.getUser.mockReturnValue({ id: 'target-user-id', displayName: 'TargetUser', username: 'TargetUser' });
      mockInteraction.options.getString.mockReturnValue('Test reason');

      const mockBannedPlayer = { id: 'player-id', name: 'TargetUser' };
      mockPlayerService.banPlayer.mockResolvedValue(mockBannedPlayer);

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call PlayerService.banPlayer
      expect(mockPlayerService.banPlayer).toHaveBeenCalledWith('target-user-id', 'Test reason');

      // Should call SimpleMessage.sendSuccess with ban success message
      expect(SimpleMessage.sendSuccess).toHaveBeenCalledWith(
        mockInteraction,
        strings.messages.admin.player.ban.success,
        {
          playerName: 'TargetUser',
          reason: '\n**Reason:** Test reason'
        },
        true
      );
    });

    it('should successfully unban a player', async () => {
      mockInteraction.options.getSubcommand.mockReturnValue('unban');
      mockInteraction.options.getUser.mockReturnValue({ id: 'target-user-id', displayName: 'TargetUser', username: 'TargetUser' });

      const mockUnbannedPlayer = { id: 'player-id', name: 'TargetUser' };
      mockPlayerService.unbanPlayer.mockResolvedValue(mockUnbannedPlayer);

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call PlayerService.unbanPlayer
      expect(mockPlayerService.unbanPlayer).toHaveBeenCalledWith('target-user-id');

      // Should call SimpleMessage.sendSuccess with unban success message
      expect(SimpleMessage.sendSuccess).toHaveBeenCalledWith(
        mockInteraction,
        strings.messages.admin.player.unban.success,
        {
          playerName: 'TargetUser'
        },
        true
      );
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      mockInteraction.user.id = '510875521354039317'; // Real admin ID from config
    });

    it('should handle season termination errors', async () => {
      mockInteraction.options.getSubcommandGroup.mockReturnValue('season');
      mockInteraction.options.getSubcommand.mockReturnValue('kill');
      mockInteraction.options.getString.mockReturnValue('test-season-id');

      mockSeasonService.terminateSeason.mockRejectedValue(new Error('Database error'));

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call SimpleMessage.sendEmbed with command error
      expect(SimpleMessage.sendEmbed).toHaveBeenCalledWith(
        mockInteraction,
        strings.embeds.errorEmbeds.command,
        expect.objectContaining({
          ERROR_CODE: 'ADMIN_SEASON_KILL_ERROR',
          GUILD_ID: 'test-guild-id',
          SHARD_ID: '0'
        }),
        true,
        'error'
      );
    });

    it('should handle player ban errors', async () => {
      mockInteraction.options.getSubcommandGroup.mockReturnValue('player');
      mockInteraction.options.getSubcommand.mockReturnValue('ban');
      mockInteraction.options.getUser.mockReturnValue({ id: 'target-user-id', displayName: 'TargetUser', username: 'TargetUser' });
      mockInteraction.options.getString.mockReturnValue(null);

      mockPlayerService.banPlayer.mockRejectedValue(new Error('Player not found'));

      await adminCommand.execute(mockInteraction, mockEventData);

      // Should call SimpleMessage.sendError with error message
      expect(SimpleMessage.sendError).toHaveBeenCalledWith(
        mockInteraction,
        strings.messages.admin.player.ban.notFound,
        {
          playerName: 'TargetUser'
        },
        true
      );
    });
  });
}); 