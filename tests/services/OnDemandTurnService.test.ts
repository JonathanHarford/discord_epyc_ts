import { vi } from 'vitest';
vi.mock('@prisma/client', () => ({
    PrismaClient: vi.fn(() => ({
        $transaction: vi.fn(),
        turn: {
            create: vi.fn(),
            deleteMany: vi.fn(),
            update: vi.fn(),
        },
        game: {
            create: vi.fn(),
            deleteMany: vi.fn(),
        },
        gameConfig: {
            create: vi.fn(),
            deleteMany: vi.fn(),
        },
        player: {
            create: vi.fn(),
            deleteMany: vi.fn(),
        },
    })),
}));
import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OnDemandTurnService } from '../../src/services/OnDemandTurnService.js';
import { SchedulerService } from '../../src/services/SchedulerService.js';

describe('OnDemandTurnService', () => {
  let prisma: PrismaClient;
  let onDemandTurnService: OnDemandTurnService;
  let mockSchedulerService: SchedulerService;
  let mockDiscordClient: any;
  let testPlayer: any;
  let testGameConfig: any;
  let testGame: any;

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
    };

    // Create mock SchedulerService
    mockSchedulerService = {
      scheduleJob: vi.fn().mockResolvedValue(true),
      cancelJob: vi.fn().mockResolvedValue(true),
    } as unknown as SchedulerService;

    // Initialize OnDemandTurnService with SchedulerService
    onDemandTurnService = new OnDemandTurnService(prisma, mockDiscordClient, mockSchedulerService);

    // Clean up test data
    await prisma.$transaction([
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.gameConfig.deleteMany(),
      prisma.player.deleteMany(),
    ]);

    // Create test player
    testPlayer = await prisma.player.create({
      data: {
        discordUserId: `test-user-${nanoid()}`,
        name: 'Test Player',
      },
    });

    // Create test game config with short timeouts for testing
    testGameConfig = await prisma.gameConfig.create({
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
    testGame = await prisma.game.create({
      data: {
        status: 'ACTIVE',
        guildId: 'test-guild-id',
        creatorId: testPlayer.id,
        configId: testGameConfig.id,
      },
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.$transaction([
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.gameConfig.deleteMany(),
      prisma.player.deleteMany(),
    ]);
    
    vi.clearAllMocks();
  });

  describe('createInitialTurn', () => {
    it('should schedule timeout and warning jobs when creating initial turn', async () => {
      const gameWithConfig = {
        ...testGame,
        config: testGameConfig,
      };

      const result = await onDemandTurnService.createInitialTurn(gameWithConfig, testPlayer);

      expect(result.success).toBe(true);
      expect(result.turn).toBeDefined();

      // Verify that scheduleJob was called for both warning and timeout
      expect(mockSchedulerService.scheduleJob).toHaveBeenCalledTimes(2);
      
      // Check warning job
      expect(mockSchedulerService.scheduleJob).toHaveBeenCalledWith(
        `turn-warning-${result.turn!.id}`,
        expect.any(Date),
        expect.any(Function),
        { turnId: result.turn!.id },
        'turn-warning'
      );

      // Check timeout job
      expect(mockSchedulerService.scheduleJob).toHaveBeenCalledWith(
        `turn-timeout-${result.turn!.id}`,
        expect.any(Date),
        expect.any(Function),
        { turnId: result.turn!.id },
        'turn-timeout'
      );
    });

    it('should not schedule jobs when SchedulerService is not available', async () => {
      // Create service without SchedulerService
      const serviceWithoutScheduler = new OnDemandTurnService(prisma, mockDiscordClient);
      
      const gameWithConfig = {
        ...testGame,
        config: testGameConfig,
      };

      const result = await serviceWithoutScheduler.createInitialTurn(gameWithConfig, testPlayer);

      expect(result.success).toBe(true);
      expect(result.turn).toBeDefined();

      // Verify that scheduleJob was not called
      expect(mockSchedulerService.scheduleJob).not.toHaveBeenCalled();
    });
  });

  describe('assignTurn', () => {
    it('should schedule timeout and warning jobs when assigning turn', async () => {
      // Create an available turn
      const turn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          turnNumber: 2,
          type: 'WRITING',
          status: 'AVAILABLE',
        },
      });

      const result = await onDemandTurnService.assignTurn(turn.id, testPlayer.id);

      expect(result.success).toBe(true);
      expect(result.turn).toBeDefined();

      // Verify that scheduleJob was called for both warning and timeout
      expect(mockSchedulerService.scheduleJob).toHaveBeenCalledTimes(2);
      
      // Check warning job
      expect(mockSchedulerService.scheduleJob).toHaveBeenCalledWith(
        `turn-warning-${turn.id}`,
        expect.any(Date),
        expect.any(Function),
        { turnId: turn.id },
        'turn-warning'
      );

      // Check timeout job
      expect(mockSchedulerService.scheduleJob).toHaveBeenCalledWith(
        `turn-timeout-${turn.id}`,
        expect.any(Date),
        expect.any(Function),
        { turnId: turn.id },
        'turn-timeout'
      );
    });
  });

  describe('submitTurn', () => {
    it('should cancel timeout job when turn is submitted', async () => {
      // Create a pending turn
      const turn = await prisma.turn.create({
        data: {
          gameId: testGame.id,
          turnNumber: 1,
          type: 'WRITING',
          status: 'PENDING',
          playerId: testPlayer.id,
          claimedAt: new Date(),
        },
      });

      const result = await onDemandTurnService.submitTurn(
        turn.id,
        testPlayer.id,
        'Test content',
        'text'
      );

      expect(result.success).toBe(true);
      expect(result.turn).toBeDefined();

      // Verify that cancelJob was called for the timeout
      expect(mockSchedulerService.cancelJob).toHaveBeenCalledWith(`turn-timeout-${turn.id}`);
    });
  });
}); 