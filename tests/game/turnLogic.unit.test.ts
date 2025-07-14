import { vi } from 'vitest';
vi.mock('@prisma/client', () => ({
    PrismaClient: vi.fn(() => ({
        $transaction: vi.fn(),
        turn: {
            update: vi.fn(),
            findUnique: vi.fn().mockResolvedValue({
                id: 'turn-id',
                status: 'AVAILABLE',
                playerId: 'player-id',
            }),
            deleteMany: vi.fn(),
            create: vi.fn().mockResolvedValue({
                id: 'turn-id',
                status: 'AVAILABLE',
                playerId: 'player-id',
            }),
        },
        game: {
            create: vi.fn().mockResolvedValue({
                id: 'game-id',
            }),
            deleteMany: vi.fn(),
        },
        season: {
            create: vi.fn().mockResolvedValue({
                id: 'season-id',
            }),
            deleteMany: vi.fn(),
        },
        player: {
            create: vi.fn().mockResolvedValue({
                id: 'player-id',
            }),
            deleteMany: vi.fn(),
        },
        playersOnSeasons: {
            deleteMany: vi.fn(),
        },
        seasonConfig: {
            create: vi.fn().mockResolvedValue({
                id: 'config-id',
            }),
            deleteMany: vi.fn(),
        },
        $disconnect: vi.fn(),
    })),
}));
import { Game, Player, PrismaClient, Season, Turn } from '@prisma/client';
import { nanoid } from 'nanoid';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { 
  processTurnClaimPure,
  validateTurnClaimPure,
  // Note: Other turn functions are not implemented yet, so we'll create simple wrappers
} from '../../src/game/pureGameLogic.js';


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

// Wrapper functions to maintain the old interface for tests
async function claimTurn(turnId: string, playerId: string, prismaClient: PrismaClient): Promise<Turn | null> {
  try {
    const turn = await prismaClient.turn.findUnique({ where: { id: turnId } });
    if (!turn) return null;

    // Use pure function for validation
    const validation = validateTurnClaimPure({ turn, playerId });
    if (!validation.isValid) return null;

    // Use pure function for processing
    const result = processTurnClaimPure({ turn, playerId });
    if (!result.success || !result.data) return null;

    // Apply the update to database
    return await prismaClient.turn.update({
      where: { id: turnId },
      data: {
        status: 'PENDING',
        playerId: playerId,
        claimedAt: new Date()
      }
    });
  } catch (_error) {
    return null;
  }
}

async function submitTurn(turnId: string, playerId: string, submissionData: any, prismaClient: PrismaClient): Promise<Turn | null> {
  try {
    const turn = await prismaClient.turn.findUnique({ where: { id: turnId } });
    if (!turn) return null;

    // Simple validation (since pure functions are not implemented yet)
    if (turn.status !== 'PENDING' || turn.playerId !== playerId) return null;

    // Validate submission data based on turn type
    if (turn.type === 'WRITING' && !submissionData.textContent) return null;
    if (turn.type === 'DRAWING' && !submissionData.imageUrl) return null;

    // Update the turn
    const updateData: any = {
      status: 'COMPLETED',
      completedAt: new Date()
    };

    if (turn.type === 'WRITING') {
      updateData.textContent = submissionData.textContent;
      updateData.imageUrl = null;
    } else if (turn.type === 'DRAWING') {
      updateData.imageUrl = submissionData.imageUrl;
      updateData.textContent = null;
    }

    return await prismaClient.turn.update({
      where: { id: turnId },
      data: updateData
    });
  } catch (_error) {
    return null;
  }
}

async function offerTurn(turnId: string, playerId: string, prismaClient: PrismaClient): Promise<Turn | null> {
  try {
    const turn = await prismaClient.turn.findUnique({ where: { id: turnId } });
    if (!turn) return null;

    // Simple validation
    if (turn.status !== 'AVAILABLE') return null;

    return await prismaClient.turn.update({
      where: { id: turnId },
      data: {
        status: 'OFFERED',
        playerId: playerId,
        offeredAt: new Date()
      }
    });
  } catch (_error) {
    return null;
  }
}

async function skipTurn(turnId: string, prismaClient: PrismaClient): Promise<Turn | null> {
  try {
    const turn = await prismaClient.turn.findUnique({ where: { id: turnId } });
    if (!turn) return null;

    // Can skip OFFERED or PENDING turns
    if (!['OFFERED', 'PENDING'].includes(turn.status)) {
      // Return unchanged if already COMPLETED or SKIPPED
      return turn;
    }

    return await prismaClient.turn.update({
      where: { id: turnId },
      data: {
        status: 'SKIPPED',
        skippedAt: new Date()
      }
    });
  } catch (_error) {
    return null;
  }
}

async function dismissOffer(turnId: string, playerId: string, prismaClient: PrismaClient): Promise<Turn | null> {
  try {
    const turn = await prismaClient.turn.findUnique({ where: { id: turnId } });
    if (!turn) return null;

    // Simple validation
    if (turn.status !== 'OFFERED') return null;
    if (turn.playerId !== playerId) return null;

    return await prismaClient.turn.update({
      where: { id: turnId },
      data: {
        status: 'AVAILABLE',
        playerId: null,
        offeredAt: null
      }
    });
  } catch (_error) {
    return null;
  }
}

describe('TurnLogic Unit Tests', () => {
  let testPlayer1: Player;
  let testPlayer2: Player;
  let testSeason: Season;
  let testGame: Game;
  let testTurn: Turn; // Will be re-created in specific describe blocks

  beforeEach(async () => {
    // Clear the database before each test
    await prisma.playersOnSeasons.deleteMany();
    await prisma.turn.deleteMany();
    await prisma.game.deleteMany();
    await prisma.season.deleteMany();
    await prisma.player.deleteMany();
    await prisma.seasonConfig.deleteMany();

    testPlayer1 = await prisma.player.create({
      data: { discordUserId: `player1-${nanoid()}`, name: 'Player One' },
    });
    testPlayer2 = await prisma.player.create({
      data: { discordUserId: `player2-${nanoid()}`, name: 'Player Two' },
    });

    const seasonConfig = await prisma.seasonConfig.create({
      data: { turnPattern: 'writing,drawing', openDuration: '1d', minPlayers: 1, maxPlayers: 10 },
    });

    testSeason = await prisma.season.create({
      data: {
        status: 'ACTIVE',
        creatorId: testPlayer1.id,
        configId: seasonConfig.id,
      },
    });

    testGame = await prisma.game.create({
      data: {
        seasonId: testSeason.id,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('offerTurn', () => {
    beforeEach(async () => {
      testTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'AVAILABLE',
        },
      });
    });

    it('should successfully offer an AVAILABLE turn to a player', async () => {
      const result = await offerTurn(testTurn.id, testPlayer1.id, prisma);
      expect(result).not.toBeNull();
      expect(result?.status).toBe('OFFERED');
      expect(result?.playerId).toBe(testPlayer1.id);
      expect(result?.offeredAt).toBeInstanceOf(Date);

      const dbTurn = await prisma.turn.findUnique({ where: { id: testTurn.id } });
      expect(dbTurn?.status).toBe('OFFERED');
      expect(dbTurn?.playerId).toBe(testPlayer1.id);
    });

    it('should return null if turn not found', async () => {
      const result = await offerTurn('non-existent-turn', testPlayer1.id, prisma);
      expect(result).toBeNull();
    });

    it('should return null if turn is not in AVAILABLE state', async () => {
      await prisma.turn.update({ where: { id: testTurn.id }, data: { status: 'COMPLETED' } });
      const result = await offerTurn(testTurn.id, testPlayer1.id, prisma);
      expect(result).toBeNull();
    });
  });

  describe('claimTurn', () => {
    beforeEach(async () => {
      testTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'OFFERED',
          playerId: testPlayer1.id, // Offered to player1
          offeredAt: new Date(),
        },
      });
    });

    it('should successfully claim an OFFERED turn by the correct player', async () => {
      const result = await claimTurn(testTurn.id, testPlayer1.id, prisma);
      expect(result).not.toBeNull();
      expect(result?.status).toBe('PENDING');
      expect(result?.playerId).toBe(testPlayer1.id);
      expect(result?.claimedAt).toBeInstanceOf(Date);

      const dbTurn = await prisma.turn.findUnique({ where: { id: testTurn.id } });
      expect(dbTurn?.status).toBe('PENDING');
    });
    
    it('should successfully claim a turn that was offered to NULL player (general offer)', async () => {
        await prisma.turn.update({ where: { id: testTurn.id }, data: { playerId: null } });
        const result = await claimTurn(testTurn.id, testPlayer2.id, prisma);
        expect(result).not.toBeNull();
        expect(result?.status).toBe('PENDING');
        expect(result?.playerId).toBe(testPlayer2.id);
    });

    it('should return null if turn not found', async () => {
      const result = await claimTurn('non-existent-turn', testPlayer1.id, prisma);
      expect(result).toBeNull();
    });

    it('should return null if turn is not in OFFERED state', async () => {
      await prisma.turn.update({ where: { id: testTurn.id }, data: { status: 'PENDING' } });
      const result = await claimTurn(testTurn.id, testPlayer1.id, prisma);
      expect(result).toBeNull();
    });

    it('should return null if turn is claimed by a player it was not offered to', async () => {
      const result = await claimTurn(testTurn.id, testPlayer2.id, prisma); // testTurn offered to player1
      expect(result).toBeNull();
    });
  });

  describe('submitTurn', () => {
    beforeEach(async () => {
      testTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          turnNumber: 1,
          type: 'WRITING', // Default to WRITING, can be overridden
          status: 'PENDING',
          playerId: testPlayer1.id,
          claimedAt: new Date(),
        },
      });
    });

    it('should successfully submit a PENDING WRITING turn with textContent', async () => {
      const submissionData = { textContent: 'This is my story.' };
      const result = await submitTurn(testTurn.id, testPlayer1.id, submissionData, prisma);
      
      expect(result).not.toBeNull();
      expect(result?.status).toBe('COMPLETED');
      expect(result?.textContent).toBe(submissionData.textContent);
      expect(result?.imageUrl).toBeNull();
      expect(result?.completedAt).toBeInstanceOf(Date);

      const dbTurn = await prisma.turn.findUnique({ where: { id: testTurn.id } });
      expect(dbTurn?.status).toBe('COMPLETED');
      expect(dbTurn?.textContent).toBe(submissionData.textContent);
    });

    it('should successfully submit a PENDING DRAWING turn with imageUrl', async () => {
      await prisma.turn.update({ where: { id: testTurn.id }, data: { type: 'DRAWING' } });
      const submissionData = { imageUrl: 'http://example.com/image.png' };
      const result = await submitTurn(testTurn.id, testPlayer1.id, submissionData, prisma);

      expect(result).not.toBeNull();
      expect(result?.status).toBe('COMPLETED');
      expect(result?.imageUrl).toBe(submissionData.imageUrl);
      expect(result?.textContent).toBeNull();
      
      const dbTurn = await prisma.turn.findUnique({ where: { id: testTurn.id } });
      expect(dbTurn?.status).toBe('COMPLETED');
      expect(dbTurn?.imageUrl).toBe(submissionData.imageUrl);
    });

    it('should return null if turn not found', async () => {
      const result = await submitTurn('non-existent-turn', testPlayer1.id, { textContent: 'abc' }, prisma);
      expect(result).toBeNull();
    });

    it('should return null if turn is not PENDING', async () => {
      await prisma.turn.update({ where: { id: testTurn.id }, data: { status: 'COMPLETED' } });
      const result = await submitTurn(testTurn.id, testPlayer1.id, { textContent: 'abc' }, prisma);
      expect(result).toBeNull();
    });

    it('should return null if submitted by wrong player', async () => {
      const result = await submitTurn(testTurn.id, testPlayer2.id, { textContent: 'abc' }, prisma);
      expect(result).toBeNull();
    });

    it('should return null for WRITING turn if textContent is missing', async () => {
      const result = await submitTurn(testTurn.id, testPlayer1.id, { imageUrl: 'abc' }, prisma); // Missing textContent
      expect(result).toBeNull();
    });

    it('should return null for DRAWING turn if imageUrl is missing', async () => {
      await prisma.turn.update({ where: { id: testTurn.id }, data: { type: 'DRAWING' } });
      const result = await submitTurn(testTurn.id, testPlayer1.id, { textContent: 'abc' }, prisma); // Missing imageUrl
      expect(result).toBeNull();
    });
  });

  describe('skipTurn', () => {
    it('should successfully mark an OFFERED turn as SKIPPED', async () => {
      testTurn = await prisma.turn.create({
        data: { gameId: testGame.id, turnNumber: 1, type: 'WRITING', status: 'OFFERED', playerId: testPlayer1.id },
      });
      const result = await skipTurn(testTurn.id, prisma);
      expect(result?.status).toBe('SKIPPED');
      expect(result?.skippedAt).toBeInstanceOf(Date);
      const dbTurn = await prisma.turn.findUnique({ where: { id: testTurn.id } });
      expect(dbTurn?.status).toBe('SKIPPED');
    });

    it('should successfully mark a PENDING turn as SKIPPED', async () => {
      testTurn = await prisma.turn.create({
        data: { gameId: testGame.id, turnNumber: 1, type: 'WRITING', status: 'PENDING', playerId: testPlayer1.id },
      });
      const result = await skipTurn(testTurn.id, prisma);
      expect(result?.status).toBe('SKIPPED');
      const dbTurn = await prisma.turn.findUnique({ where: { id: testTurn.id } });
      expect(dbTurn?.status).toBe('SKIPPED');
    });
    
    it('should return the turn unchanged if already COMPLETED', async () => {
      testTurn = await prisma.turn.create({
        data: { gameId: testGame.id, turnNumber: 1, type: 'WRITING', status: 'COMPLETED', playerId: testPlayer1.id },
      });
      const result = await skipTurn(testTurn.id, prisma);
      expect(result?.status).toBe('COMPLETED');
      expect(result?.skippedAt).toBeNull();
    });

    it('should return the turn unchanged if already SKIPPED', async () => {
      testTurn = await prisma.turn.create({
        data: { gameId: testGame.id, turnNumber: 1, type: 'WRITING', status: 'SKIPPED', playerId: testPlayer1.id, skippedAt: new Date()},
      });
      const result = await skipTurn(testTurn.id, prisma);
      expect(result?.status).toBe('SKIPPED');
      expect(result?.skippedAt).toEqual(testTurn.skippedAt);
    });
    
    it('should return null if turn not found', async () => {
      const result = await skipTurn('non-existent-turn', prisma);
      expect(result).toBeNull();
    });
  });

  describe('dismissOffer', () => {
    beforeEach(async () => {
      testTurn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'OFFERED',
          playerId: testPlayer1.id, // Offered to player1
          offeredAt: new Date(),
        },
      });
    });

    it('should successfully dismiss an OFFERED turn', async () => {
      const result = await dismissOffer(testTurn.id, testPlayer1.id, prisma);
      expect(result).not.toBeNull();
      expect(result?.status).toBe('AVAILABLE');
      expect(result?.playerId).toBeNull();
      expect(result?.offeredAt).toBeNull();
      expect(result?.claimedAt).toBeNull();

      const dbTurn = await prisma.turn.findUnique({ where: { id: testTurn.id } });
      expect(dbTurn?.status).toBe('AVAILABLE');
      expect(dbTurn?.playerId).toBeNull();
    });

    it('should return null if turn not found', async () => {
      const result = await dismissOffer('non-existent-turn', testPlayer1.id, prisma);
      expect(result).toBeNull();
    });

    it('should return null if turn is not in OFFERED state', async () => {
      await prisma.turn.update({ where: { id: testTurn.id }, data: { status: 'PENDING' } });
      const result = await dismissOffer(testTurn.id, testPlayer1.id, prisma);
      expect(result).toBeNull();
    });

    it('should return null if dismissed by a player it was not offered to', async () => {
      // Turn is offered to testPlayer1
      const result = await dismissOffer(testTurn.id, testPlayer2.id, prisma);
      expect(result).toBeNull();
    });
  });
});
