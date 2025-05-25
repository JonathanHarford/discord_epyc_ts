import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { PrismaClient, Player } from '@prisma/client';
import { processPlayerOperationPure, validatePlayerDataPure } from '../../src/game/pureGameLogic.js';
import { nanoid } from 'nanoid';

// Mock logger
vi.mock('../../src/services/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const prisma = new PrismaClient();

// Wrapper function to maintain the old interface for tests
async function addPlayer(discordUserId: string, name: string, prismaClient: PrismaClient): Promise<Player | null> {
  try {
    // Simple validation (since validatePlayerDataPure is not implemented yet)
    if (!discordUserId || !name) {
      return null;
    }

    // Check if player already exists
    const existingPlayer = await prismaClient.player.findUnique({
      where: { discordUserId }
    });

    // Use pure function to determine what to do
    const result = processPlayerOperationPure({ 
      discordUserId, 
      name, 
      existingPlayer 
    });

    if (!result.success || !result.data) {
      return null;
    }

    if (result.isNewPlayer) {
      // Create new player
      return await prismaClient.player.create({
        data: {
          discordUserId,
          name
        }
      });
    } else if (result.nameUpdated) {
      // Update existing player
      return await prismaClient.player.update({
        where: { id: existingPlayer!.id },
        data: { name }
      });
    } else {
      // Return existing player unchanged
      return existingPlayer;
    }
  } catch (error) {
    return null;
  }
}

describe('PlayerLogic Unit Tests', () => {
  beforeEach(async () => {
    // Clear the database before each test
    await prisma.playersOnSeasons.deleteMany();
    await prisma.turn.deleteMany();
    await prisma.game.deleteMany();
    await prisma.season.deleteMany();
    await prisma.player.deleteMany();
    await prisma.seasonConfig.deleteMany();
  });

  afterAll(async () => {
    // Optional: Final cleanup of players if needed, though beforeEach should handle it for subsequent test files.
    // await prisma.player.deleteMany(); 
    await prisma.$disconnect();
  });

  describe('addPlayer', () => {
    it('should create a new player if they do not exist', async () => {
      const discordUserId = `new-user-${nanoid()}`;
      const name = 'New Player';

      const player = await addPlayer(discordUserId, name, prisma);

      expect(player).not.toBeNull();
      expect(player?.discordUserId).toBe(discordUserId);
      expect(player?.name).toBe(name);

      const dbPlayer = await prisma.player.findUnique({ where: { discordUserId } });
      expect(dbPlayer).not.toBeNull();
      expect(dbPlayer?.name).toBe(name);
    });

    it('should return an existing player if they already exist (by discordUserId)', async () => {
      const discordUserId = `existing-user-${nanoid()}`;
      const originalName = 'Original Name';
      const existingPlayer = await prisma.player.create({
        data: { discordUserId, name: originalName },
      });

      const retrievedPlayer = await addPlayer(discordUserId, originalName, prisma);

      expect(retrievedPlayer).not.toBeNull();
      expect(retrievedPlayer?.id).toBe(existingPlayer.id);
      expect(retrievedPlayer?.name).toBe(originalName);
      
      const playerCount = await prisma.player.count({ where: { discordUserId } });
      expect(playerCount).toBe(1);
    });

    it('should update the name of an existing player if the provided name is different', async () => {
      const discordUserId = `existing-user-name-update-${nanoid()}`;
      const originalName = 'Old Name';
      const newName = 'New Name';
      const existingPlayer = await prisma.player.create({
        data: { discordUserId, name: originalName },
      });

      const updatedPlayer = await addPlayer(discordUserId, newName, prisma);

      expect(updatedPlayer).not.toBeNull();
      expect(updatedPlayer?.id).toBe(existingPlayer.id);
      expect(updatedPlayer?.name).toBe(newName);

      const dbPlayer = await prisma.player.findUnique({ where: { id: existingPlayer.id } });
      expect(dbPlayer?.name).toBe(newName);
    });
    
    it('should return null if a database error occurs during creation (simulated by invalid data)', async () => {
      // Simulate an error by trying to create a player with data that might violate constraints
      // For instance, if discordUserId was not unique and we tried to force a duplicate via a raw method,
      // but prisma.player.create itself handles many validations.
      // A more direct way to test this would be to mock prisma.player.create to throw.
      // For now, we trust Prisma's error handling or specific constraint violations.
      // This test case is more conceptual with the current "real DB" testing style.
      
      // To actually test this, we'd need to mock prisma.player.create
      const mockPrisma = {
        ...prisma,
        player: {
          ...prisma.player,
          findUnique: vi.fn().mockResolvedValue(null), // Ensure it tries to create
          create: vi.fn().mockRejectedValue(new Error("Simulated DB error on create")),
        }
      } as unknown as PrismaClient;

      const player = await addPlayer("error-user", "Error User", mockPrisma);
      expect(player).toBeNull();
    });
  });
});
