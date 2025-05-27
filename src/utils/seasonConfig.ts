import { PrismaClient } from '@prisma/client';

import { parseDuration } from './datetime.js';
import { Logger } from '../services/index.js';

// Default timeout values in minutes
export const DEFAULT_TIMEOUTS = {
  CLAIM_TIMEOUT_MINUTES: 1440, // 24 hours
  WRITING_TIMEOUT_MINUTES: 1440, // 24 hours  
  DRAWING_TIMEOUT_MINUTES: 4320, // 72 hours (3 days)
} as const;

export interface SeasonTimeouts {
  claimTimeoutMinutes: number;
  writingTimeoutMinutes: number;
  drawingTimeoutMinutes: number;
}

/**
 * Retrieves season-specific timeout values for a given turn.
 * Falls back to sensible defaults if configuration is missing or invalid.
 * 
 * @param prisma - Prisma client instance
 * @param turnId - The ID of the turn to get season config for
 * @returns Promise<SeasonTimeouts> - Timeout values in minutes
 */
export async function getSeasonTimeouts(
  prisma: PrismaClient,
  turnId: string
): Promise<SeasonTimeouts> {
  try {
    // Get the turn with its game and season config
    const turn = await prisma.turn.findUnique({
      where: { id: turnId },
      include: {
        game: {
          include: {
            season: {
              include: {
                config: true
              }
            }
          }
        }
      }
    });

    if (!turn) {
      Logger.warn(`Turn ${turnId} not found, using default timeouts`);
      return getDefaultTimeouts();
    }

    if (!turn.game) {
      Logger.warn(`Game not found for turn ${turnId}, using default timeouts`);
      return getDefaultTimeouts();
    }

    if (!turn.game.season) {
      Logger.warn(`Season not found for turn ${turnId}, using default timeouts`);
      return getDefaultTimeouts();
    }

    if (!turn.game.season.config) {
      Logger.warn(`Season config not found for turn ${turnId}, using default timeouts`);
      return getDefaultTimeouts();
    }

    const config = turn.game.season.config;
    
    // Parse timeout values with fallbacks
    const claimTimeoutMinutes = parseTimeoutToMinutes(
      config.claimTimeout,
      'claimTimeout',
      DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES
    );

    const writingTimeoutMinutes = parseTimeoutToMinutes(
      config.writingTimeout,
      'writingTimeout', 
      DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES
    );

    const drawingTimeoutMinutes = parseTimeoutToMinutes(
      config.drawingTimeout,
      'drawingTimeout',
      DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES
    );

    Logger.info(`Retrieved season timeouts for turn ${turnId}: claim=${claimTimeoutMinutes}m, writing=${writingTimeoutMinutes}m, drawing=${drawingTimeoutMinutes}m`);

    return {
      claimTimeoutMinutes,
      writingTimeoutMinutes,
      drawingTimeoutMinutes
    };

  } catch (error) {
    Logger.error(`Error retrieving season timeouts for turn ${turnId}:`, error);
    return getDefaultTimeouts();
  }
}

/**
 * Parses a timeout duration string to minutes with fallback to default.
 * 
 * @param timeoutStr - Duration string like "1d", "2h", "30m"
 * @param fieldName - Name of the field for logging
 * @param defaultMinutes - Default value to use if parsing fails
 * @returns number - Timeout value in minutes
 */
function parseTimeoutToMinutes(
  timeoutStr: string,
  fieldName: string,
  defaultMinutes: number
): number {
  try {
    const duration = parseDuration(timeoutStr);
    
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

/**
 * Returns the default timeout values.
 * 
 * @returns SeasonTimeouts - Default timeout values in minutes
 */
function getDefaultTimeouts(): SeasonTimeouts {
  return {
    claimTimeoutMinutes: DEFAULT_TIMEOUTS.CLAIM_TIMEOUT_MINUTES,
    writingTimeoutMinutes: DEFAULT_TIMEOUTS.WRITING_TIMEOUT_MINUTES,
    drawingTimeoutMinutes: DEFAULT_TIMEOUTS.DRAWING_TIMEOUT_MINUTES
  };
} 