import { User } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SeasonListPaginationButtonHandler } from '../../src/handlers/seasonListPaginationButtonHandler.js';
import prisma from '../../src/lib/prisma.js';

// Mock Prisma
vi.mock('../../src/lib/prisma', () => ({
  default: {
    player: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    season: {
      findMany: vi.fn(),
    },
  },
}));

// Mock Logger
vi.mock('../../src/services/index.js', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('SeasonListPaginationButtonHandler', () => {
  let handler: SeasonListPaginationButtonHandler;
  let mockInteraction: any;

  const mockPrismaClient = prisma as any;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new SeasonListPaginationButtonHandler();

    mockInteraction = {
      customId: 'season_list_next_0_user123',
      user: { id: 'user123', username: 'TestUser' } as User,
      reply: vi.fn().mockResolvedValue(undefined),
      deferUpdate: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      deferred: false,
    };

    // Reset Prisma mocks
    mockPrismaClient.player.findUnique.mockReset();
    mockPrismaClient.player.create.mockReset();
    mockPrismaClient.season.findMany.mockReset();
  });

  describe('customId validation', () => {
    it('should handle valid customId format', async () => {
      mockInteraction.customId = 'season_list_next_0_user123';
      mockInteraction.deferred = true;

      // Mock successful player and season data
      mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'player1', discordUserId: 'user123' });
      mockPrismaClient.season.findMany.mockResolvedValueOnce([]);

      await handler.execute(mockInteraction);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should reject invalid customId format', async () => {
      mockInteraction.customId = 'season_list_invalid';

      await handler.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Invalid pagination action.',
        ephemeral: true,
      });
    });

    it('should reject invalid action', async () => {
      mockInteraction.customId = 'season_list_invalid_0_user123';

      await handler.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Invalid pagination action.',
        ephemeral: true,
      });
    });
  });

  describe('user isolation', () => {
    it('should allow original user to navigate', async () => {
      mockInteraction.customId = 'season_list_next_0_user123';
      mockInteraction.user.id = 'user123';
      mockInteraction.deferred = true;

      mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'player1', discordUserId: 'user123' });
      mockPrismaClient.season.findMany.mockResolvedValueOnce([]);

      await handler.execute(mockInteraction);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should reject different user trying to navigate', async () => {
      mockInteraction.customId = 'season_list_next_0_user123';
      mockInteraction.user.id = 'user456'; // Different user

      await handler.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'You can only navigate your own season list.',
        ephemeral: true,
      });
    });
  });

  describe('pagination logic', () => {
    it('should handle next page navigation', async () => {
      mockInteraction.customId = 'season_list_next_0_user123';
      mockInteraction.deferred = true;

      mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'player1', discordUserId: 'user123' });
      mockPrismaClient.season.findMany.mockResolvedValueOnce([]);

      await handler.execute(mockInteraction);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should handle previous page navigation', async () => {
      mockInteraction.customId = 'season_list_prev_1_user123';
      mockInteraction.deferred = true;

      mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'player1', discordUserId: 'user123' });
      mockPrismaClient.season.findMany.mockResolvedValueOnce([]);

      await handler.execute(mockInteraction);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should not go below page 0 on previous', async () => {
      mockInteraction.customId = 'season_list_prev_0_user123';
      mockInteraction.deferred = true;

      mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'player1', discordUserId: 'user123' });
      mockPrismaClient.season.findMany.mockResolvedValueOnce([]);

      await handler.execute(mockInteraction);

      expect(mockInteraction.deferUpdate).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });

  describe('player creation', () => {
    it('should create player if not exists', async () => {
      mockInteraction.customId = 'season_list_next_0_user123';
      mockInteraction.deferred = true;

      mockPrismaClient.player.findUnique.mockResolvedValueOnce(null); // Player not found
      mockPrismaClient.player.create.mockResolvedValueOnce({ id: 'player1', discordUserId: 'user123' });
      mockPrismaClient.season.findMany.mockResolvedValueOnce([]);

      await handler.execute(mockInteraction);

      expect(mockPrismaClient.player.create).toHaveBeenCalledWith({
        data: { discordUserId: 'user123', name: 'TestUser' }
      });
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should handle player creation failure gracefully', async () => {
      mockInteraction.customId = 'season_list_next_0_user123';
      mockInteraction.deferred = true;

      mockPrismaClient.player.findUnique.mockResolvedValueOnce(null);
      mockPrismaClient.player.create.mockRejectedValueOnce(new Error('Creation failed'));
      mockPrismaClient.season.findMany.mockResolvedValueOnce([]);

      await handler.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });

  describe('season list handling', () => {
    it('should handle empty season list', async () => {
      mockInteraction.customId = 'season_list_next_0_user123';
      mockInteraction.deferred = true;

      mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'player1', discordUserId: 'user123' });
      mockPrismaClient.season.findMany.mockResolvedValueOnce([]);

      await handler.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: 'No active seasons found.',
        components: []
      });
    });

    it('should handle seasons with pagination', async () => {
      mockInteraction.customId = 'season_list_next_0_user123';
      mockInteraction.deferred = true;

      const mockSeasons = Array.from({ length: 6 }, (_, i) => ({
        id: `season${i}`,
        status: 'OPEN',
        createdAt: new Date(),
        creatorId: 'creator1',
        configId: 'config1',
        config: { maxPlayers: 10 },
        _count: { players: 2 },
        players: [],
        creator: { name: 'Creator' }
      }));

      mockPrismaClient.player.findUnique.mockResolvedValueOnce({ id: 'player1', discordUserId: 'user123' });
      mockPrismaClient.season.findMany.mockResolvedValueOnce(mockSeasons);

      await handler.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalled();
      const editCall = mockInteraction.editReply.mock.calls[0][0];
      expect(editCall.components).toBeDefined();
      expect(editCall.components.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockInteraction.customId = 'season_list_next_0_user123';

      mockPrismaClient.player.findUnique.mockRejectedValueOnce(new Error('Database error'));

      await handler.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'An error occurred while updating the page.',
        ephemeral: true
      });
    });

    it('should handle errors when interaction is deferred', async () => {
      mockInteraction.customId = 'season_list_next_0_user123';
      mockInteraction.deferred = true;

      mockPrismaClient.player.findUnique.mockRejectedValueOnce(new Error('Database error'));

      await handler.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: 'An error occurred while updating the page.'
      });
    });
  });

  describe('customIdPrefix', () => {
    it('should have correct customIdPrefix', () => {
      expect(handler.customIdPrefix).toBe('season_list_');
    });
  });
}); 