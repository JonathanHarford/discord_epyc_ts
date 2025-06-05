import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationGuidanceService } from '../../src/services/NotificationGuidanceService.js';

describe('NotificationGuidanceService', () => {
  let prisma: PrismaClient;
  let notificationGuidanceService: NotificationGuidanceService;
  let mockDiscordClient: any;

  beforeEach(async () => {
    prisma = new PrismaClient();
    
    // Create mock Discord client
    mockDiscordClient = {
      users: {
        fetch: vi.fn().mockResolvedValue({
          id: 'test-user-id',
          username: 'TestUser',
          send: vi.fn().mockResolvedValue({}),
        }),
      },
      guilds: {
        fetch: vi.fn().mockResolvedValue({
          id: 'test-guild-id',
          name: 'Test Server',
          channels: {
            fetch: vi.fn().mockResolvedValue({
              id: 'test-channel-id',
              name: 'test-channel',
            }),
          },
        }),
      },
    };

    // Initialize NotificationGuidanceService
    notificationGuidanceService = new NotificationGuidanceService(prisma, mockDiscordClient);
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  describe('generateContextualGuidance', () => {
    it('should generate guidance with full context', () => {
      const context = {
        guildId: 'custom-guild-id',
        channelId: 'custom-channel-id',
        serverName: 'Custom Server',
      };

      const result = notificationGuidanceService.generateContextualGuidance(context, {
        actionType: 'ready',
        includeEmoji: true,
      });

      expect(result.contextLevel).toBe('specific');
      expect(result.hasSpecificChannel).toBe(true);
      expect(result.hasServerInfo).toBe(true);
      expect(result.message).toContain('🎨');
      expect(result.message).toContain('<#custom-channel-id>');
      expect(result.message).toContain('Custom Server');
    });

    it('should generate guidance with server-only context', () => {
      const context = {
        serverName: 'Server Only',
      };

      const result = notificationGuidanceService.generateContextualGuidance(context, {
        actionType: 'ready',
      });

      expect(result.contextLevel).toBe('server');
      expect(result.hasSpecificChannel).toBe(false);
      expect(result.hasServerInfo).toBe(true);
      expect(result.message).toContain('Server Only');
      expect(result.message).not.toContain('<#');
    });

    it('should generate fallback guidance with no context', () => {
      const result = notificationGuidanceService.generateContextualGuidance({}, {
        actionType: 'ready',
      });

      expect(result.contextLevel).toBe('fallback');
      expect(result.hasSpecificChannel).toBe(false);
      expect(result.hasServerInfo).toBe(false);
      expect(result.message).toContain('Go to the game server');
    });

    it('should handle different action types correctly', () => {
      const context = { serverName: 'Test Server' };

      const readyResult = notificationGuidanceService.generateContextualGuidance(context, {
        actionType: 'ready',
        includeEmoji: true,
      });
      expect(readyResult.message).toContain('🎨');
      expect(readyResult.message).toContain('Ready commands have moved');

      const submitTextResult = notificationGuidanceService.generateContextualGuidance(context, {
        actionType: 'submit',
        contentType: 'text',
        includeEmoji: true,
      });
      expect(submitTextResult.message).toContain('✍️');
      expect(submitTextResult.message).toContain('Text submissions have moved');

      const submitImageResult = notificationGuidanceService.generateContextualGuidance(context, {
        actionType: 'submit',
        contentType: 'image',
        includeEmoji: true,
      });
      expect(submitImageResult.message).toContain('🖼️');
      expect(submitImageResult.message).toContain('Image submissions have moved');

      const playResult = notificationGuidanceService.generateContextualGuidance(context, {
        actionType: 'play',
        includeEmoji: true,
      });
      expect(playResult.message).toContain('🎮');
      expect(playResult.message).toContain('Your turn is ready!');
    });

    it('should handle options correctly', () => {
      const context = { serverName: 'Test Server' };

      const noEmojiResult = notificationGuidanceService.generateContextualGuidance(context, {
        actionType: 'ready',
        includeEmoji: false,
      });
      expect(noEmojiResult.message).not.toContain('🎨');

      const noExplanationResult = notificationGuidanceService.generateContextualGuidance(context, {
        actionType: 'ready',
        includeExplanation: false,
      });
      expect(noExplanationResult.message).not.toContain('DM-based commands have moved');

      const withExplanationResult = notificationGuidanceService.generateContextualGuidance(context, {
        actionType: 'ready',
        includeExplanation: true,
      });
      expect(withExplanationResult.message).toContain('DM-based commands have moved');
    });

    it('should use fallback message when provided', () => {
      const customFallback = 'Custom fallback guidance message';
      
      const result = notificationGuidanceService.generateContextualGuidance({}, {
        fallbackMessage: customFallback,
      });

      expect(result.message).toBe(customFallback);
      expect(result.contextLevel).toBe('fallback');
    });
  });

  describe('generatePingMessage', () => {
    it('should generate ping message with game context', async () => {
      // Clean up test data
      await prisma.$transaction([
        prisma.turn.deleteMany(),
        prisma.game.deleteMany(),
        prisma.gameConfig.deleteMany(),
        prisma.player.deleteMany(),
      ]);

      // Create test player
      const testPlayer = await prisma.player.create({
        data: {
          discordUserId: `test-user-${nanoid()}`,
          name: 'Test Player',
        },
      });

      // Create test game config
      const testGameConfig = await prisma.gameConfig.create({
        data: {
          turnPattern: 'writing,drawing',
          writingTimeout: '1m',
          writingWarning: '30s',
          drawingTimeout: '20m',
          drawingWarning: '2m',
          staleTimeout: '3d',
          minTurns: 6,
          maxTurns: 12,
        },
      });

      // Create test game
      const testGame = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          guildId: 'test-guild-id',
          creatorId: testPlayer.id,
          configId: testGameConfig.id,
        },
      });

      const result = await notificationGuidanceService.generatePingMessage(
        testGame.id,
        1,
        'WRITING',
        { includeGameId: true }
      );

      expect(result.message).toContain('🎮');
      expect(result.message).toContain('Your turn is ready!');
      expect(result.message).toContain(`Game: ${testGame.id}`);
      expect(result.message).toContain('#1 (WRITING)');
      expect(result.message).toContain('/game play');
      expect(result.message).toContain('This is a quick ping');

      // Clean up
      await prisma.$transaction([
        prisma.turn.deleteMany(),
        prisma.game.deleteMany(),
        prisma.gameConfig.deleteMany(),
        prisma.player.deleteMany(),
      ]);
    });

    it('should generate ping message without game ID when not requested', async () => {
      // Clean up test data
      await prisma.$transaction([
        prisma.turn.deleteMany(),
        prisma.game.deleteMany(),
        prisma.gameConfig.deleteMany(),
        prisma.player.deleteMany(),
      ]);

      // Create test player
      const testPlayer = await prisma.player.create({
        data: {
          discordUserId: `test-user-${nanoid()}`,
          name: 'Test Player',
        },
      });

      // Create test game config
      const testGameConfig = await prisma.gameConfig.create({
        data: {
          turnPattern: 'writing,drawing',
          writingTimeout: '1m',
          writingWarning: '30s',
          drawingTimeout: '20m',
          drawingWarning: '2m',
          staleTimeout: '3d',
          minTurns: 6,
          maxTurns: 12,
        },
      });

      // Create test game
      const testGame = await prisma.game.create({
        data: {
          status: 'ACTIVE',
          guildId: 'test-guild-id',
          creatorId: testPlayer.id,
          configId: testGameConfig.id,
        },
      });

      const result = await notificationGuidanceService.generatePingMessage(
        testGame.id,
        2,
        'DRAWING'
      );

      expect(result.message).not.toContain(`Game: ${testGame.id}`);
      expect(result.message).toContain('#2 (DRAWING)');

      // Clean up
      await prisma.$transaction([
        prisma.turn.deleteMany(),
        prisma.game.deleteMany(),
        prisma.gameConfig.deleteMany(),
        prisma.player.deleteMany(),
      ]);
    });

    it('should handle invalid game ID gracefully', async () => {
      const result = await notificationGuidanceService.generatePingMessage(
        'invalid-game-id',
        1,
        'WRITING'
      );

      expect(result.contextLevel).toBe('fallback');
      expect(result.hasSpecificChannel).toBe(false);
      expect(result.hasServerInfo).toBe(false);
      expect(result.message).toContain('🎮');
      expect(result.message).toContain('Your turn is ready!');
      expect(result.message).toContain('game server');
    });
  });
}); 