import { Game, PrismaClient } from '@prisma/client';
import { Client as DiscordClient } from 'discord.js';

import { ChannelConfigService } from './ChannelConfigService.js';
import { ErrorEventBus, ErrorEventType } from '../events/error-event-bus.js';
import { MessageAdapter } from '../messaging/MessageAdapter.js';
import { MessageHelpers } from '../messaging/MessageHelpers.js';
import { Logger } from '../services/index.js';
import { MessageInstruction } from '../types/MessageInstruction.js';
import { ErrorHandler, ErrorType } from '../utils/error-handler.js';
import { 
  CircuitBreaker, 
  CircuitBreakerState, 
  DEFAULT_CIRCUIT_BREAKER_CONFIG, 
  DEFAULT_RETRY_CONFIG, 
  PerformanceMetrics, 
  PerformanceMonitor, 
  RetryConfig, 
  RetryUtility 
} from '../utils/resilience.js';

/**
 * Configuration for game completion announcements
 */
export interface AnnouncementConfig {
  retryConfig: RetryConfig;
  enableCircuitBreaker: boolean;
  enableFallbackMechanisms: boolean;
  enablePerformanceMonitoring: boolean;
  fallbackChannelId?: string;
  maxAnnouncementAge: number; // Maximum age in ms before announcement is considered stale
}

/**
 * Default configuration for game completion announcements
 */
export const DEFAULT_ANNOUNCEMENT_CONFIG: AnnouncementConfig = {
  retryConfig: {
    ...DEFAULT_RETRY_CONFIG,
    retryableErrors: [
      ...DEFAULT_RETRY_CONFIG.retryableErrors,
      'Unknown Channel',
      'Missing Permissions',
      'Cannot send messages to this channel'
    ]
  },
  enableCircuitBreaker: true,
  enableFallbackMechanisms: true,
  enablePerformanceMonitoring: true,
  maxAnnouncementAge: 300000 // 5 minutes
};

/**
 * Result of an announcement attempt
 */
export interface AnnouncementResult {
  success: boolean;
  error?: string;
  retryCount?: number;
  circuitBreakerState?: CircuitBreakerState;
  fallbackUsed?: boolean;
  duration?: number;
  channelId?: string;
}

/**
 * Enhanced service for handling game completion announcements with comprehensive error handling
 */
export class GameCompletionAnnouncementService {
  private readonly prisma: PrismaClient;
  private readonly discordClient: DiscordClient;
  private readonly channelConfigService: ChannelConfigService;
  private readonly config: AnnouncementConfig;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly errorEventBus: ErrorEventBus;

  constructor(
    prisma: PrismaClient,
    discordClient: DiscordClient,
    config: AnnouncementConfig = DEFAULT_ANNOUNCEMENT_CONFIG
  ) {
    this.prisma = prisma;
    this.discordClient = discordClient;
    this.channelConfigService = new ChannelConfigService(prisma);
    this.config = config;
    this.circuitBreaker = new CircuitBreaker(
      'GameCompletionAnnouncement',
      DEFAULT_CIRCUIT_BREAKER_CONFIG
    );
    this.errorEventBus = ErrorEventBus.getInstance();
  }

  /**
   * Send a game completion announcement with comprehensive error handling
   * @param game The completed game
   * @returns Promise<AnnouncementResult>
   */
  async sendAnnouncement(game: Game): Promise<AnnouncementResult> {
    const context = {
      gameId: game.id,
      seasonId: game.seasonId,
      gameStatus: game.status,
      source: 'GameCompletionAnnouncementService.sendAnnouncement'
    };

    let performanceMetric: PerformanceMetrics | undefined;
    if (this.config.enablePerformanceMonitoring) {
      performanceMetric = PerformanceMonitor.startOperation('game_completion_announcement', context);
    }

    try {
      Logger.info(`Starting enhanced game completion announcement for game ${game.id}`, context);

      // Check if announcement is too old (stale)
      if (game.completedAt) {
        const ageMs = Date.now() - game.completedAt.getTime();
        if (ageMs > this.config.maxAnnouncementAge) {
          Logger.warn(`Game completion announcement is stale (${ageMs}ms old), skipping`, {
            ...context,
            ageMs,
            maxAge: this.config.maxAnnouncementAge
          });
          return { success: false, error: 'Announcement too old' };
        }
      }

      // Execute with retry logic and circuit breaker protection
      const result = await this.executeAnnouncementWithResilience(game, context);

      if (performanceMetric) {
        PerformanceMonitor.completeOperation(
          performanceMetric,
          result.success,
          result.error,
          result.retryCount,
          result.circuitBreakerState
        );
      }

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error(`Critical error in game completion announcement for game ${game.id}`, {
        ...context,
        error: errorMessage
      });

      if (performanceMetric) {
        PerformanceMonitor.completeOperation(
          performanceMetric,
          false,
          errorMessage,
          0,
          this.circuitBreaker.getStatus().state
        );
      }

      // Try fallback mechanisms if enabled
      if (this.config.enableFallbackMechanisms) {
        try {
          const fallbackResult = await this.executeFallbackAnnouncement(game, context, errorMessage);
          return { ...fallbackResult, fallbackUsed: true };
        } catch (fallbackError) {
          Logger.error(`Fallback announcement also failed for game ${game.id}`, {
            ...context,
            originalError: errorMessage,
            fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          });
        }
      }

      return {
        success: false,
        error: errorMessage,
        circuitBreakerState: this.circuitBreaker.getStatus().state
      };
    }
  }

  /**
   * Execute announcement with retry logic and circuit breaker protection
   */
  private async executeAnnouncementWithResilience(
    game: Game,
    context: Record<string, any>
  ): Promise<AnnouncementResult> {
    let retryCount = 0;
    let circuitBreakerState = this.circuitBreaker.getStatus().state;

    const announcementFunction = async (): Promise<AnnouncementResult> => {
      if (this.config.enableCircuitBreaker) {
        return await this.circuitBreaker.execute(
          () => this.executeAnnouncementCore(game, context),
          context
        );
      } else {
        return await this.executeAnnouncementCore(game, context);
      }
    };

    try {
      const result = await RetryUtility.executeWithRetry(
        async () => {
          retryCount++;
          circuitBreakerState = this.circuitBreaker.getStatus().state;
          return await announcementFunction();
        },
        this.config.retryConfig,
        context
      );

      return {
        ...result,
        retryCount: retryCount - 1, // Subtract 1 because first attempt is not a retry
        circuitBreakerState
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Publish error event
      this.publishErrorEvent(
        ErrorHandler.createCustomError(
          ErrorType.BUSINESS_LOGIC,
          'ANNOUNCEMENT_RESILIENCE_FAILED',
          `Game completion announcement failed after retries for game ${game.id}: ${errorMessage}`,
          'Game completion announcement failed despite retry attempts',
          { ...context, retryCount, circuitBreakerState, originalError: error }
        ),
        context
      );

      return {
        success: false,
        error: errorMessage,
        retryCount: retryCount - 1,
        circuitBreakerState
      };
    }
  }

  /**
   * Core announcement logic (without retry/circuit breaker wrapper)
   */
  private async executeAnnouncementCore(
    game: Game,
    context: Record<string, any>
  ): Promise<AnnouncementResult> {
    // Get guild ID
    const guildId = await this.resolveGuildId(game, context);
    if (!guildId) {
      return { success: false, error: 'No guild ID available' };
    }

    // Get configured channel
    const channelId = await this.getConfiguredChannelId(guildId, context);
    if (!channelId) {
      return { success: false, error: 'No configured channel' };
    }

    // Validate Discord channel
    const channel = await this.validateDiscordChannel(channelId, context);
    if (!channel) {
      return { success: false, error: 'Invalid Discord channel' };
    }

    // Get game statistics
    const stats = await this.getGameStatistics(game.id, context);
    if (!stats) {
      return { success: false, error: 'Failed to get game statistics' };
    }

    // Create and send message
    const message = await this.createCompletionMessage(game, stats, channelId, context);
    await this.sendMessage(message, context);

    Logger.info(`Game completion announcement sent successfully for game ${game.id}`, {
      ...context,
      guildId,
      channelId,
      gameStats: stats
    });

    return { success: true, channelId };
  }

  /**
   * Resolve guild ID for the game
   */
  private async resolveGuildId(game: Game, context: Record<string, any>): Promise<string | null> {
    try {
      if (game.seasonId) {
        const season = await this.prisma.season.findUnique({
          where: { id: game.seasonId },
          select: { guildId: true }
        });
        
        if (!season) {
          this.publishErrorEvent(
            ErrorHandler.createCustomError(
              ErrorType.DATABASE,
              'SEASON_NOT_FOUND',
              `Season ${game.seasonId} not found for game ${game.id}`,
              'Game completion announcement failed due to missing season data',
              { ...context, seasonId: game.seasonId }
            ),
            context
          );
          return null;
        }
        
        return season.guildId;
      } else {
        return game.guildId;
      }
    } catch (error) {
      this.publishErrorEvent(
        ErrorHandler.createCustomError(
          ErrorType.DATABASE,
          'GUILD_ID_RESOLUTION_FAILED',
          `Failed to resolve guild ID for game ${game.id}: ${error instanceof Error ? error.message : String(error)}`,
          'Game completion announcement failed due to database error',
          { ...context, originalError: error }
        ),
        context
      );
      throw error;
    }
  }

  /**
   * Get configured channel ID for announcements
   */
  private async getConfiguredChannelId(guildId: string, context: Record<string, any>): Promise<string | null> {
    try {
      const channelId = await this.channelConfigService.getCompletedChannelId(guildId);
      if (!channelId) {
        Logger.info(`No completed channel configured for guild ${guildId}, skipping announcement`, {
          ...context,
          guildId
        });
      }
      return channelId;
    } catch (error) {
      this.publishErrorEvent(
        ErrorHandler.createCustomError(
          ErrorType.DATABASE,
          'CHANNEL_CONFIG_FETCH_FAILED',
          `Failed to get completed channel config for guild ${guildId}: ${error instanceof Error ? error.message : String(error)}`,
          'Game completion announcement failed due to configuration error',
          { ...context, guildId, originalError: error }
        ),
        context
      );
      throw error;
    }
  }

  /**
   * Validate Discord channel exists and is accessible
   */
  private async validateDiscordChannel(channelId: string, context: Record<string, any>): Promise<any> {
    try {
      const channel = await this.discordClient.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        this.publishErrorEvent(
          ErrorHandler.createCustomError(
            ErrorType.DISCORD_API,
            'INVALID_CHANNEL',
            `Completed channel ${channelId} not found or not text-based`,
            'Game completion announcement failed due to invalid channel configuration',
            { ...context, channelId }
          ),
          context
        );
        return null;
      }
      return channel;
    } catch (error) {
      this.publishErrorEvent(
        ErrorHandler.createCustomError(
          ErrorType.DISCORD_API,
          'CHANNEL_FETCH_FAILED',
          `Failed to fetch Discord channel ${channelId}: ${error instanceof Error ? error.message : String(error)}`,
          'Game completion announcement failed due to Discord API error',
          { ...context, channelId, originalError: error }
        ),
        context
      );
      throw error;
    }
  }

  /**
   * Get game statistics for the announcement
   */
  private async getGameStatistics(gameId: string, context: Record<string, any>): Promise<any> {
    try {
      const turns = await this.prisma.turn.findMany({
        where: { gameId }
      });

      const totalTurns = turns.length;
      const completedTurns = turns.filter(t => t.status === 'COMPLETED').length;
      const skippedTurns = turns.filter(t => t.status === 'SKIPPED').length;
      const pendingTurns = turns.filter(t => ['OFFERED', 'PENDING'].includes(t.status)).length;
      
      const completionPercentage = totalTurns > 0 
        ? Math.round(((completedTurns + skippedTurns) / totalTurns) * 100)
        : 0;

      return {
        totalTurns,
        completedTurns,
        skippedTurns,
        pendingTurns,
        completionPercentage
      };
    } catch (error) {
      this.publishErrorEvent(
        ErrorHandler.createCustomError(
          ErrorType.DATABASE,
          'GAME_STATS_ERROR',
          `Error getting game statistics for ${gameId}: ${error instanceof Error ? error.message : String(error)}`,
          'Game completion announcement failed due to database error',
          { ...context, originalError: error }
        ),
        context
      );
      throw error;
    }
  }

  /**
   * Create completion message based on game type
   */
  private async createCompletionMessage(
    game: Game,
    stats: any,
    channelId: string,
    context: Record<string, any>
  ): Promise<MessageInstruction> {
    try {
      if (game.seasonId) {
        // Season game
        return MessageHelpers.info(
          'messages.game.seasonGameCompleted',
          {
            gameId: game.id,
            seasonId: game.seasonId,
            completedTurns: stats.completedTurns,
            totalTurns: stats.totalTurns,
            skippedTurns: stats.skippedTurns,
            completionPercentage: stats.completionPercentage,
            finishedGamesLink: `<#${channelId}>`
          }
        );
      } else {
        // On-demand game - get creator info
        const gameWithCreator = await this.prisma.game.findUnique({
          where: { id: game.id },
          include: { creator: true }
        });
        
        const playerCount = new Set(
          await this.prisma.turn.findMany({
            where: { gameId: game.id },
            select: { playerId: true }
          }).then(turns => turns.map(t => t.playerId))
        ).size;
        
        return MessageHelpers.info(
          'messages.game.onDemandGameCompleted',
          {
            gameId: game.id,
            creatorName: gameWithCreator?.creator?.name || gameWithCreator?.creator?.discordUserId || 'Unknown',
            completedTurns: stats.completedTurns,
            totalTurns: stats.totalTurns,
            playerCount: playerCount,
            completionReason: game.status === 'COMPLETED' ? 'Natural completion' : 'Admin terminated',
            finishedGamesLink: `<#${channelId}>`
          }
        );
      }
    } catch (error) {
      this.publishErrorEvent(
        ErrorHandler.createCustomError(
          ErrorType.BUSINESS_LOGIC,
          'MESSAGE_FORMATTING_FAILED',
          `Failed to format completion message for game ${game.id}: ${error instanceof Error ? error.message : String(error)}`,
          'Game completion announcement failed due to message formatting error',
          { ...context, originalError: error }
        ),
        context
      );
      throw error;
    }
  }

  /**
   * Send the message using MessageAdapter
   */
  private async sendMessage(message: MessageInstruction, context: Record<string, any>): Promise<void> {
    try {
      await MessageAdapter.processInstruction(
        message,
        undefined, // No interaction for channel messages
        'en',
        this.discordClient
      );
    } catch (error) {
      this.publishErrorEvent(
        ErrorHandler.createCustomError(
          ErrorType.DISCORD_API,
          'MESSAGE_SEND_FAILED',
          `Failed to send completion message: ${error instanceof Error ? error.message : String(error)}`,
          'Game completion announcement failed to send',
          { ...context, originalError: error }
        ),
        context
      );
      throw error;
    }
  }

  /**
   * Execute fallback announcement mechanisms
   */
  private async executeFallbackAnnouncement(
    game: Game,
    context: Record<string, any>,
    originalError: string
  ): Promise<AnnouncementResult> {
    Logger.info(`Attempting fallback announcement for game ${game.id}`, {
      ...context,
      originalError
    });

    try {
      // Fallback 1: Try to send a simplified message to the same channel
      if (this.config.fallbackChannelId) {
        try {
          const fallbackChannel = await this.discordClient.channels.fetch(this.config.fallbackChannelId);
          if (fallbackChannel && fallbackChannel.isTextBased()) {
            const fallbackMessage = `🎉 Game ${game.id} has been completed! (Fallback notification due to: ${originalError})`;
            await (fallbackChannel as any).send(fallbackMessage);
            
            Logger.info(`Fallback announcement sent successfully for game ${game.id}`, {
              ...context,
              fallbackChannelId: this.config.fallbackChannelId
            });
            
            return { success: true, channelId: this.config.fallbackChannelId };
          }
        } catch (fallbackError) {
          Logger.warn(`Fallback channel also failed for game ${game.id}`, {
            ...context,
            fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          });
        }
      }

      // Fallback 2: Log the completion for manual processing
      Logger.error(`All announcement methods failed for game ${game.id}, logging for manual processing`, {
        ...context,
        gameId: game.id,
        seasonId: game.seasonId,
        gameStatus: game.status,
        completedAt: game.completedAt,
        originalError,
        requiresManualProcessing: true
      });

      return { success: false, error: 'All fallback mechanisms failed' };

    } catch (error) {
      Logger.error(`Fallback announcement failed for game ${game.id}`, {
        ...context,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Publish error events for monitoring
   */
  private publishErrorEvent(errorInfo: any, context: Record<string, any>): void {
    try {
      this.errorEventBus.publishError(
        ErrorEventType.SERVICE_ERROR,
        errorInfo,
        { service: 'GameCompletionAnnouncementService', ...context }
      );
    } catch (eventError) {
      Logger.error('Failed to publish error event for game completion announcement', {
        originalError: errorInfo,
        eventError: eventError instanceof Error ? eventError.message : String(eventError),
        context
      });
    }
  }

  /**
   * Get performance statistics for monitoring
   */
  getPerformanceStats(): any {
    if (!this.config.enablePerformanceMonitoring) {
      return { message: 'Performance monitoring is disabled' };
    }

    return {
      announcementStats: PerformanceMonitor.getStats('game_completion_announcement'),
      circuitBreakerStatus: this.circuitBreaker.getStatus()
    };
  }

  /**
   * Reset circuit breaker (for administrative purposes)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
    Logger.info('Game completion announcement circuit breaker manually reset');
  }
} 