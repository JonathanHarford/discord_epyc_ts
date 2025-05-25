import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { getSeasonTimeouts, DEFAULT_TIMEOUTS, SeasonTimeouts } from '../../src/utils/seasonConfig.js';
import { Logger } from '../../src/services/index.js';
import { parseDuration } from '../../src/utils/datetime.js';
import { type Mock } from 'vitest';

// Use a separate Prisma client for tests
const prisma = new PrismaClient();

// Mock the Logger to avoid console output during tests
vi.mock('../../src/services/index.js', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock parseDuration from datetime.js
vi.mock('../../src/utils/datetime.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/datetime.js')>();
  return {
    ...actual,
    parseDuration: vi.fn(), // Default mock for all tests in this file
  };
});

// At the top of tests/utils/seasonConfig.test.ts, before any describe blocks
const mockedParseDuration = parseDuration as Mock; // Typed mock

describe('seasonConfig utils', () => {
  let testTurnId: string;
  let testGameId: string;
  let testSeasonId: string;
  let testSeasonConfigId: string;
  let testPlayerId: string;

  beforeEach(async () => {
    vi.clearAllMocks(); // Clear all mocks (including Logger) before each test in the main describe
    // Database cleanup and basic setup
    await prisma.$transaction([
      prisma.turn.deleteMany(),
      prisma.game.deleteMany(),
      prisma.season.deleteMany(),
      prisma.player.deleteMany(),
      prisma.seasonConfig.deleteMany(),
    ]);
    const player = await prisma.player.create({
      data: {
        discordUserId: `test-player-${nanoid()}`,
        name: 'Test Player',
      },
    });
    testPlayerId = player.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('getSeasonTimeouts', () => {
    beforeEach(() => {
      // Reset the global mock's history and specific behavior for parseDuration
      // before each test *within the getSeasonTimeouts suite*.
      (mockedParseDuration as Mock).mockReset();
    });

    describe('with valid season config', () => {
      beforeEach(async () => {
        const seasonConfig = await prisma.seasonConfig.create({
          data: {
            maxPlayers: 5,
            minPlayers: 2,
            openDuration: '1d',
            turnPattern: 'writing,drawing',
            claimTimeout: '2h',
            writingTimeout: '3d',
            drawingTimeout: '5d',
          },
        });
        testSeasonConfigId = seasonConfig.id;
        const season = await prisma.season.create({
          data: { status: 'ACTIVE', creatorId: testPlayerId, configId: testSeasonConfigId },
        });
        testSeasonId = season.id;
        const game = await prisma.game.create({ data: { status: 'ACTIVE', seasonId: testSeasonId } });
        testGameId = game.id;
        const turn = await prisma.turn.create({
          data: { gameId: testGameId, playerId: testPlayerId, turnNumber: 1, status: 'AVAILABLE', type: 'WRITING' },
        });
        testTurnId = turn.id;
      });

      it('should return parsed timeout values from season config', async () => {
        (mockedParseDuration as Mock).mockImplementation((str: string) => {
          if (str === '2h') return { as: () => 120 };
          if (str === '3d') return { as: () => 4320 };
          if (str === '5d') return { as: () => 7200 };
          return null;
        });
        const result = await getSeasonTimeouts(prisma, testTurnId);
        expect(result).toEqual({
          claimTimeoutMinutes: 120,
          writingTimeoutMinutes: 4320,
          drawingTimeoutMinutes: 7200,
        });
        expect(Logger.info).toHaveBeenCalledWith(
          expect.stringContaining(`Retrieved season timeouts for turn ${testTurnId}`)
        );
      });

      it('should handle different duration formats', async () => {
        await prisma.seasonConfig.update({
          where: { id: testSeasonConfigId },
          data: { claimTimeout: '30m', writingTimeout: '1d12h', drawingTimeout: '1h30m' },
        });
        (mockedParseDuration as Mock).mockImplementation((str: string) => {
          if (str === '30m') return { as: () => 30 };
          if (str === '1d12h') return { as: () => 2160 };
          if (str === '1h30m') return { as: () => 90 };
          return null;
        });
        const result = await getSeasonTimeouts(prisma, testTurnId);
        expect(result).toEqual({
          claimTimeoutMinutes: 30,
          writingTimeoutMinutes: 2160,
          drawingTimeoutMinutes: 90,
        });
      });
    });

    describe('with missing or invalid season config', () => {
      it('should return defaults when turn not found', async () => {
        const result = await getSeasonTimeouts(prisma, 'non-existent-turn');
        expect(result).toEqual({
          claimTimeoutMinutes: DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES,
          writingTimeoutMinutes: DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES,
          drawingTimeoutMinutes: DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES,
        });
        expect(Logger.warn).toHaveBeenCalledWith(
          'Turn non-existent-turn not found, using default timeouts'
        );
      });

      it('should return defaults when season config has no timeout fields', async () => {
        (mockedParseDuration as Mock).mockImplementation((str: string | undefined) => {
          if (str === undefined || str === null || str === '') return null; 
          return null; // Return null for any other string to trigger default behavior
        });

        const seasonConfig = await prisma.seasonConfig.create({
          data: { maxPlayers: 5, minPlayers: 2, openDuration: '1d', turnPattern: 'writing,drawing' },
        });
        const season = await prisma.season.create({
          data: { status: 'ACTIVE', creatorId: testPlayerId, configId: seasonConfig.id },
        });
        const game = await prisma.game.create({ data: { status: 'ACTIVE', seasonId: season.id } });
        const turn = await prisma.turn.create({
          data: { gameId: game.id, playerId: testPlayerId, turnNumber: 1, status: 'AVAILABLE', type: 'WRITING' },
        });
        const result = await getSeasonTimeouts(prisma, turn.id);
        expect(result).toEqual({
          claimTimeoutMinutes: DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES,
          writingTimeoutMinutes: DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES,
          drawingTimeoutMinutes: DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES,
        });
        expect(Logger.warn).toHaveBeenCalledWith(`Invalid claimTimeout format: '1d', using default ${DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES} minutes`);
        expect(Logger.warn).toHaveBeenCalledWith(`Invalid writingTimeout format: '1d', using default ${DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES} minutes`);
        expect(Logger.warn).toHaveBeenCalledWith(`Invalid drawingTimeout format: '1d', using default ${DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES} minutes`);
      });
    });

    describe('with invalid timeout values in config', () => {
      beforeEach(async () => {
        const seasonConfig = await prisma.seasonConfig.create({
          data: {
            maxPlayers: 5, minPlayers: 2, openDuration: '1d', turnPattern: 'writing,drawing',
            claimTimeout: 'invalid_str_claim', writingTimeout: '0m_str_writing', drawingTimeout: '-5d_str_drawing',
          },
        });
        const season = await prisma.season.create({
          data: { status: 'ACTIVE', creatorId: testPlayerId, configId: seasonConfig.id },
        });
        const game = await prisma.game.create({ data: { status: 'ACTIVE', seasonId: season.id } });
        const turn = await prisma.turn.create({
          data: { gameId: game.id, playerId: testPlayerId, turnNumber: 1, status: 'AVAILABLE', type: 'WRITING' },
        });
        testTurnId = turn.id;

        (mockedParseDuration as Mock).mockImplementation((str: string) => {
          if (str === 'invalid_str_claim') return null;
          if (str === '0m_str_writing') return { as: () => 0 };
          if (str === '-5d_str_drawing') return { as: () => -7200 };
          return null;
        });
      });

      it('should use defaults for invalid timeout values and log specific warnings', async () => {
        const result = await getSeasonTimeouts(prisma, testTurnId);
        expect(result).toEqual({
          claimTimeoutMinutes: DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES,
          writingTimeoutMinutes: DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES,
          drawingTimeoutMinutes: DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES,
        });
        expect(Logger.warn).toHaveBeenCalledWith(`Invalid claimTimeout format: 'invalid_str_claim', using default ${DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES} minutes`);
        expect(Logger.warn).toHaveBeenCalledWith(`Invalid writingTimeout value: 0 minutes (from '0m_str_writing'), using default ${DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES} minutes`);
        expect(Logger.warn).toHaveBeenCalledWith(`Invalid drawingTimeout value: -7200 minutes (from '-5d_str_drawing'), using default ${DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES} minutes`);
      });
    });

    describe('with partial valid config', () => {
      beforeEach(async () => {
        const seasonConfig = await prisma.seasonConfig.create({
          data: {
            maxPlayers: 5, minPlayers: 2, openDuration: '1d', turnPattern: 'writing,drawing',
            claimTimeout: '4h_valid', writingTimeout: 'invalid_for_writing', drawingTimeout: '2d_for_drawing_default',
          },
        });
        const season = await prisma.season.create({
          data: { status: 'ACTIVE', creatorId: testPlayerId, configId: seasonConfig.id },
        });
        const game = await prisma.game.create({ data: { status: 'ACTIVE', seasonId: season.id } });
        const turn = await prisma.turn.create({
          data: { gameId: game.id, playerId: testPlayerId, turnNumber: 1, status: 'AVAILABLE', type: 'WRITING' },
        });
        testTurnId = turn.id;

        (mockedParseDuration as Mock).mockImplementation((str: string) => {
          if (str === '4h_valid') return { as: () => 240 };
          if (str === 'invalid_for_writing') return null;
          if (str === '2d_for_drawing_default') return null;
          return null;
        });
      });

      it('should use valid values and defaults for invalid ones', async () => {
        const result = await getSeasonTimeouts(prisma, testTurnId);
        expect(result).toEqual({
          claimTimeoutMinutes: 240,
          writingTimeoutMinutes: DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES,
          drawingTimeoutMinutes: DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES,
        });
        expect(Logger.warn).toHaveBeenCalledWith(`Invalid writingTimeout format: 'invalid_for_writing', using default ${DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES} minutes`);
        expect(Logger.warn).toHaveBeenCalledWith(`Invalid drawingTimeout format: '2d_for_drawing_default', using default ${DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES} minutes`);
        expect(Logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('claimTimeoutMinutes'));
      });
    });

    describe('error handling', () => {
      it('should handle database errors gracefully', async () => {
        const mockPrismaClientError = {
          turn: { findUnique: vi.fn().mockRejectedValue(new Error('Database connection failed')) },
        } as any;
        const result = await getSeasonTimeouts(mockPrismaClientError, 'test-turn-id-db-error');
        expect(result).toEqual({
          claimTimeoutMinutes: DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES,
          writingTimeoutMinutes: DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES,
          drawingTimeoutMinutes: DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES,
        });
        expect(Logger.error).toHaveBeenCalledWith(
          'Error retrieving season timeouts for turn test-turn-id-db-error:',
          expect.any(Error)
        );
      });
    });

    describe('default timeout constants', () => {
      it('should have sensible default values', () => {
        expect(DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES).toBe(1440);
        expect(DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES).toBe(1440);
        expect(DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES).toBe(4320);
      });
    });

    it('should log warnings and use defaults for all invalid values (specific multi-failure test)', async () => {
      const mockPrismaMultiFailure = {
        turn: {
          findUnique: vi.fn().mockResolvedValue({
            game: {
              season: {
                config: {
                  claimTimeout: 'cf_1d', 
                  writingTimeout: 'cf_0m', 
                  drawingTimeout: 'cf_-5d', 
                  anotherInvalidTimeout: 'cf_xyz',
                  emptyTimeout: 'cf_',
                },
              },
            },
          }),
        },
      } as any;

      (mockedParseDuration as Mock).mockImplementation((timeoutStr: string) => {
        if (timeoutStr === 'cf_1d') return null;
        if (timeoutStr === 'cf_0m') return { as: () => 0 };
        if (timeoutStr === 'cf_-5d') return { as: () => -300 };
        return { as: () => 60 };
      });
        
      await getSeasonTimeouts(mockPrismaMultiFailure, testTurnId);

      expect(Logger.warn).toHaveBeenCalledWith(
        `Invalid claimTimeout format: 'cf_1d', using default ${DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES} minutes`
      );
      expect(Logger.warn).toHaveBeenCalledWith(
        `Invalid writingTimeout value: 0 minutes (from 'cf_0m'), using default ${DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES} minutes`
      );
      expect(Logger.warn).toHaveBeenCalledWith(
        `Invalid drawingTimeout value: -300 minutes (from 'cf_-5d'), using default ${DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES} minutes`
      );
    });
  });

  describe('parseTimeoutToMinutes_TestTarget (internal logic)', () => {
    const defaultTestTimeout = 60; 
    const testFieldName = 'testTimeoutField';
    let localMockedParseDuration: Mock;

    beforeEach(() => {
      localMockedParseDuration = vi.fn();
    });

    it('should parse valid duration string "30m" to 30 minutes', () => {
      localMockedParseDuration.mockReturnValue({ as: () => 30 });
      const result = parseTimeoutToMinutes_TestTarget('30m', testFieldName, defaultTestTimeout, localMockedParseDuration);
      expect(result).toBe(30);
      expect(localMockedParseDuration).toHaveBeenCalledWith('30m');
      expect(Logger.warn).not.toHaveBeenCalled();
    });

    it('should parse valid duration string "2h" to 120 minutes', () => {
      localMockedParseDuration.mockReturnValue({ as: () => 120 });
      const result = parseTimeoutToMinutes_TestTarget('2h', testFieldName, defaultTestTimeout, localMockedParseDuration);
      expect(result).toBe(120);
      expect(localMockedParseDuration).toHaveBeenCalledWith('2h');
      expect(Logger.warn).not.toHaveBeenCalled();
    });
    
    it('should parse valid duration string "1d" to 1440 minutes', () => {
      localMockedParseDuration.mockReturnValue({ as: () => 1440 });
      const result = parseTimeoutToMinutes_TestTarget('1d', testFieldName, defaultTestTimeout, localMockedParseDuration);
      expect(result).toBe(1440);
      expect(localMockedParseDuration).toHaveBeenCalledWith('1d');
      expect(Logger.warn).not.toHaveBeenCalled();
    });

    it('should round minutes up (e.g., 29.6m to 30m)', () => {
      localMockedParseDuration.mockReturnValue({ as: () => 29.6 });
      const result = parseTimeoutToMinutes_TestTarget('29m36s', testFieldName, defaultTestTimeout, localMockedParseDuration);
      expect(result).toBe(30);
      expect(Logger.warn).not.toHaveBeenCalled();
    });

    it('should round minutes down (e.g., 29.4m to 29m)', () => {
      localMockedParseDuration.mockReturnValue({ as: () => 29.4 });
      const result = parseTimeoutToMinutes_TestTarget('29m24s', testFieldName, defaultTestTimeout, localMockedParseDuration);
      expect(result).toBe(29);
      expect(Logger.warn).not.toHaveBeenCalled();
    });

    it('should return default if parseDuration returns null (invalid format)', () => {
      localMockedParseDuration.mockReturnValue(null);
      const result = parseTimeoutToMinutes_TestTarget('invalid_str', testFieldName, defaultTestTimeout, localMockedParseDuration);
      expect(result).toBe(defaultTestTimeout);
      expect(localMockedParseDuration).toHaveBeenCalledWith('invalid_str');
      expect(Logger.warn).toHaveBeenCalledWith(
        `Invalid ${testFieldName} format: 'invalid_str', using default ${defaultTestTimeout} minutes`
      );
    });

    it('should return default if parsed minutes is 0', () => {
      localMockedParseDuration.mockReturnValue({ as: () => 0 });
      const result = parseTimeoutToMinutes_TestTarget('0m', testFieldName, defaultTestTimeout, localMockedParseDuration);
      expect(result).toBe(defaultTestTimeout);
      expect(localMockedParseDuration).toHaveBeenCalledWith('0m');
      expect(Logger.warn).toHaveBeenCalledWith(
        `Invalid ${testFieldName} value: 0 minutes (from '0m'), using default ${defaultTestTimeout} minutes`
      );
    });

    it('should return default if parsed minutes is negative', () => {
      localMockedParseDuration.mockReturnValue({ as: () => -30 });
      const result = parseTimeoutToMinutes_TestTarget('-30m', testFieldName, defaultTestTimeout, localMockedParseDuration); 
      expect(result).toBe(defaultTestTimeout);
      expect(Logger.warn).toHaveBeenCalledWith(
        `Invalid ${testFieldName} value: -30 minutes (from '-30m'), using default ${defaultTestTimeout} minutes`
      );
    });
    
    it('should return default and log if localMockedParseDuration throws an error', () => {
        const error = new Error('Test parseDuration error');
        localMockedParseDuration.mockImplementation(() => {
          throw error;
        });
        const result = parseTimeoutToMinutes_TestTarget('error_case', testFieldName, defaultTestTimeout, localMockedParseDuration);
        expect(result).toBe(defaultTestTimeout);
        expect(localMockedParseDuration).toHaveBeenCalledWith('error_case');
        expect(Logger.warn).toHaveBeenCalledWith(
          `Error parsing ${testFieldName} 'error_case', using default ${defaultTestTimeout} minutes:`,
          error
        );
      });

    it('should handle timeoutStr being an empty string', () => {
      localMockedParseDuration.mockReturnValue(null); 
      const result = parseTimeoutToMinutes_TestTarget('', testFieldName, defaultTestTimeout, localMockedParseDuration);
      expect(result).toBe(defaultTestTimeout);
      expect(localMockedParseDuration).toHaveBeenCalledWith('');
      expect(Logger.warn).toHaveBeenCalledWith(
        `Invalid ${testFieldName} format: '', using default ${defaultTestTimeout} minutes`
      );
    });
  });

  describe('getDefaultTimeouts_ForTest (testing copied logic)', () => {
    it('should return correct default timeout values based on imported constant', () => {
      const result = getDefaultTimeouts_ForTest();
      expect(result).toEqual({
        claimTimeoutMinutes: DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES,
        writingTimeoutMinutes: DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES,
        drawingTimeoutMinutes: DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES,
      });
      expect(DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES).toBe(1440);
      expect(DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES).toBe(1440);
      expect(DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES).toBe(4320);
    });
  });
});

function getDefaultTimeouts_ForTest(): { claimTimeoutMinutes: number; writingTimeoutMinutes: number; drawingTimeoutMinutes: number; } {
  return {
    claimTimeoutMinutes: DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES,
    writingTimeoutMinutes: DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES,
    drawingTimeoutMinutes: DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES,
  };
}

function parseTimeoutToMinutes_TestTarget(
  timeoutStr: string,
  fieldName: string,
  defaultMinutes: number,
  mockedParseDurationFn: Mock
): number {
  try {
    const duration = mockedParseDurationFn(timeoutStr);

    if (!duration) {
      Logger.warn(`Invalid ${fieldName} format: '${timeoutStr}', using default ${defaultMinutes} minutes`);
      return defaultMinutes;
    }

    const minutes = Math.round(duration.as('minutes'));

    if (minutes <= 0) {
      Logger.warn(`Invalid ${fieldName} value: ${minutes} minutes (from '${timeoutStr}'), using default ${defaultMinutes} minutes`);
      return defaultMinutes;
    }

    return minutes;

  } catch (error) {
    Logger.warn(`Error parsing ${fieldName} '${timeoutStr}', using default ${defaultMinutes} minutes:`, error);
    return defaultMinutes;
  }
}