import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { PrismaClient, Player } from '@prisma/client';
import { PlayerService } from '../../src/services/PlayerService.js';
import { nanoid } from 'nanoid';

describe('PlayerService Unit Tests', () => {
  let prisma: PrismaClient;
  let playerService: PlayerService;
  let testPlayer: Player;
  let bannedPlayer: Player;

  beforeEach(async () => {
    prisma = new PrismaClient();
    playerService = new PlayerService(prisma);

    // Clear the database before each test
    await prisma.$transaction([
      prisma.playersOnSeasons.deleteMany(),
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.player.deleteMany(),
      prisma.seasonConfig.deleteMany(),
    ]);

    // Create test players
    testPlayer = await prisma.player.create({
      data: {
        id: nanoid(),
        discordUserId: 'test-player-discord-id',
        name: 'Test Player'
      }
    });

    bannedPlayer = await prisma.player.create({
      data: {
        id: nanoid(),
        discordUserId: 'banned-player-discord-id',
        name: 'Banned Player',
        bannedAt: new Date()
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
      prisma.player.deleteMany(),
      prisma.seasonConfig.deleteMany(),
    ]);
    await prisma.$disconnect();
  });

  describe('banPlayer', () => {
    it('should successfully ban an unbanned player', async () => {
      const result = await playerService.banPlayer(testPlayer.discordUserId, 'Test reason');

      expect(result).toBeDefined();
      expect(result.id).toBe(testPlayer.id);
      expect(result.bannedAt).not.toBeNull();
      expect(result.bannedAt).toBeInstanceOf(Date);

      // Verify in database
      const dbPlayer = await prisma.player.findUnique({
        where: { discordUserId: testPlayer.discordUserId }
      });
      expect(dbPlayer?.bannedAt).not.toBeNull();
    });

    it('should ban a player without a reason', async () => {
      const result = await playerService.banPlayer(testPlayer.discordUserId);

      expect(result).toBeDefined();
      expect(result.id).toBe(testPlayer.id);
      expect(result.bannedAt).not.toBeNull();
      expect(result.bannedAt).toBeInstanceOf(Date);
    });

    it('should throw error when trying to ban a non-existent player', async () => {
      await expect(
        playerService.banPlayer('non-existent-discord-id', 'Test reason')
      ).rejects.toThrow('Player with Discord ID non-existent-discord-id not found');
    });

    it('should throw error when trying to ban an already banned player', async () => {
      await expect(
        playerService.banPlayer(bannedPlayer.discordUserId, 'Test reason')
      ).rejects.toThrow(`Player ${bannedPlayer.name} is already banned`);
    });

    it('should handle database errors gracefully', async () => {
      // Mock Prisma to throw an error
      const mockPrisma = {
        player: {
          findUnique: vi.fn().mockResolvedValue(testPlayer),
          update: vi.fn().mockRejectedValue(new Error('Database error'))
        }
      } as any;

      const mockPlayerService = new PlayerService(mockPrisma);

      await expect(
        mockPlayerService.banPlayer(testPlayer.discordUserId, 'Test reason')
      ).rejects.toThrow('Database error');
    });
  });

  describe('unbanPlayer', () => {
    it('should successfully unban a banned player', async () => {
      const result = await playerService.unbanPlayer(bannedPlayer.discordUserId);

      expect(result).toBeDefined();
      expect(result.id).toBe(bannedPlayer.id);
      expect(result.bannedAt).toBeNull();

      // Verify in database
      const dbPlayer = await prisma.player.findUnique({
        where: { discordUserId: bannedPlayer.discordUserId }
      });
      expect(dbPlayer?.bannedAt).toBeNull();
    });

    it('should throw error when trying to unban a non-existent player', async () => {
      await expect(
        playerService.unbanPlayer('non-existent-discord-id')
      ).rejects.toThrow('Player with Discord ID non-existent-discord-id not found');
    });

    it('should throw error when trying to unban an already unbanned player', async () => {
      await expect(
        playerService.unbanPlayer(testPlayer.discordUserId)
      ).rejects.toThrow(`Player ${testPlayer.name} is not currently banned`);
    });

    it('should handle database errors gracefully', async () => {
      // Mock Prisma to throw an error
      const mockPrisma = {
        player: {
          findUnique: vi.fn().mockResolvedValue(bannedPlayer),
          update: vi.fn().mockRejectedValue(new Error('Database error'))
        }
      } as any;

      const mockPlayerService = new PlayerService(mockPrisma);

      await expect(
        mockPlayerService.unbanPlayer(bannedPlayer.discordUserId)
      ).rejects.toThrow('Database error');
    });
  });

  describe('isPlayerBanned', () => {
    it('should return true for a banned player', async () => {
      const result = await playerService.isPlayerBanned(bannedPlayer.discordUserId);
      expect(result).toBe(true);
    });

    it('should return false for an unbanned player', async () => {
      const result = await playerService.isPlayerBanned(testPlayer.discordUserId);
      expect(result).toBe(false);
    });

    it('should return false for a non-existent player', async () => {
      const result = await playerService.isPlayerBanned('non-existent-discord-id');
      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      // Mock Prisma to throw an error
      const mockPrisma = {
        player: {
          findUnique: vi.fn().mockRejectedValue(new Error('Database error'))
        }
      } as any;

      const mockPlayerService = new PlayerService(mockPrisma);

      const result = await mockPlayerService.isPlayerBanned(testPlayer.discordUserId);
      expect(result).toBe(false); // Should return false on error
    });
  });

  describe('getPlayerByDiscordId', () => {
    it('should return a player when found', async () => {
      const result = await playerService.getPlayerByDiscordId(testPlayer.discordUserId);
      
      expect(result).toBeDefined();
      expect(result?.id).toBe(testPlayer.id);
      expect(result?.discordUserId).toBe(testPlayer.discordUserId);
      expect(result?.name).toBe(testPlayer.name);
    });

    it('should return null for a non-existent player', async () => {
      const result = await playerService.getPlayerByDiscordId('non-existent-discord-id');
      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      // Mock Prisma to throw an error
      const mockPrisma = {
        player: {
          findUnique: vi.fn().mockRejectedValue(new Error('Database error'))
        }
      } as any;

      const mockPlayerService = new PlayerService(mockPrisma);

      const result = await mockPlayerService.getPlayerByDiscordId(testPlayer.discordUserId);
      expect(result).toBeNull(); // Should return null on error
    });
  });

  describe('Integration with ban status changes', () => {
    it('should correctly track ban status changes', async () => {
      // Initially unbanned
      expect(await playerService.isPlayerBanned(testPlayer.discordUserId)).toBe(false);

      // Ban the player
      await playerService.banPlayer(testPlayer.discordUserId, 'Test ban');
      expect(await playerService.isPlayerBanned(testPlayer.discordUserId)).toBe(true);

      // Unban the player
      await playerService.unbanPlayer(testPlayer.discordUserId);
      expect(await playerService.isPlayerBanned(testPlayer.discordUserId)).toBe(false);
    });

    it('should maintain player data integrity during ban operations', async () => {
      const originalPlayer = await playerService.getPlayerByDiscordId(testPlayer.discordUserId);
      
      // Ban the player
      const bannedResult = await playerService.banPlayer(testPlayer.discordUserId, 'Test ban');
      expect(bannedResult.name).toBe(originalPlayer?.name);
      expect(bannedResult.discordUserId).toBe(originalPlayer?.discordUserId);
      expect(bannedResult.id).toBe(originalPlayer?.id);

      // Unban the player
      const unbannedResult = await playerService.unbanPlayer(testPlayer.discordUserId);
      expect(unbannedResult.name).toBe(originalPlayer?.name);
      expect(unbannedResult.discordUserId).toBe(originalPlayer?.discordUserId);
      expect(unbannedResult.id).toBe(originalPlayer?.id);
    });
  });
}); 