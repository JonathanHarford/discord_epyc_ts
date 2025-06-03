import type { CheckGameCompletionInput } from '../game/types.js';
import { Game, Player, Prisma, PrismaClient, Season, Turn } from '@prisma/client';
import { Client as DiscordClient } from 'discord.js';
import { nanoid } from 'nanoid';

import { ChannelConfigService } from './ChannelConfigService.js';
import { Logger } from './logger.js';
import { ErrorEventBus, ErrorEventType } from '../events/error-event-bus.js';
import { checkGameCompletionPure } from '../game/pureGameLogic.js';
import { MessageAdapter } from '../messaging/MessageAdapter.js';
import { MessageHelpers } from '../messaging/MessageHelpers.js';
import { ErrorHandler, ErrorType } from '../utils/error-handler.js';

// Extended Game type that includes related data
export interface GameWithDetails extends Game {
  season: Season;
  turns: Turn[];
}

export interface GameWithTurnsAndPlayers extends Game {
  season: {
    players: {
      player: Player;
    }[];
  };
  turns: (Turn & {
    player: Player | null;
  })[];
}

export interface GameCreationResult {
  success: boolean;
  games?: Game[];
  error?: string;
}

export interface GameStatusResult {
  success: boolean;
  game?: GameWithDetails;
  isCompleted?: boolean;
  error?: string;
}

export class GameService {
  private prisma: PrismaClient;
  private discordClient: DiscordClient;
  private channelConfigService: ChannelConfigService;

  constructor(prisma: PrismaClient, discordClient: DiscordClient) {
    this.prisma = prisma;
    this.discordClient = discordClient;
    this.channelConfigService = new ChannelConfigService(prisma);
  }

  /**
   * Creates games for a season when it's activated.
   * Creates one game per player in the season.
   * @param seasonId The ID of the season to create games for
   * @param tx Optional Prisma transaction client
   * @returns A result object indicating success or failure with created games
   */
  async createGamesForSeason(
    seasonId: string, 
    tx?: Prisma.TransactionClient
  ): Promise<GameCreationResult> {
    try {
      const prismaClient = tx || this.prisma;

      // Get the season with its players
      const season = await prismaClient.season.findUnique({
        where: { id: seasonId },
        include: {
          players: {
            include: {
              player: true
            }
          }
        }
      });

      if (!season) {
        return { success: false, error: 'Season not found' };
      }

      if (season.players.length === 0) {
        return { success: false, error: 'Season has no players' };
      }

      // Create one game per player
      const gameCreationPromises = season.players.map(async (_playerOnSeason, _index) => {
        return await prismaClient.game.create({
          data: {
            id: nanoid(),
            status: 'SETUP', // Games start in SETUP, will be activated individually
            seasonId: seasonId,
            // Could add additional game metadata here if needed
          }
        });
      });

      const createdGames = await Promise.all(gameCreationPromises);
      
      console.log(`Created ${createdGames.length} games for season ${seasonId}`);
      return { success: true, games: createdGames };

    } catch (error) {
      console.error(`Error creating games for season ${seasonId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Gets the current status of a game including its completion state
   * @param gameId The ID of the game to check
   * @returns A result object with game details and completion status
   */
  async getGameStatus(gameId: string): Promise<GameStatusResult> {
    try {
      const game = await this.prisma.game.findUnique({
        where: { id: gameId },
        include: {
          season: true,
          turns: {
            orderBy: {
              turnNumber: 'asc'
            }
          }
        }
      });

      if (!game) {
        return { success: false, error: 'Game not found' };
      }

      // Check if the game is completed using pure game logic
      const seasonPlayers = game.season ? await this.prisma.player.findMany({
        where: {
          seasons: {
            some: {
              seasonId: game.seasonId
            }
          }
        }
      }) : [];

      const completedOrSkippedTurns = await this.prisma.turn.findMany({
        where: {
          gameId: gameId,
          status: {
            in: ['COMPLETED', 'SKIPPED']
          }
        },
        include: {
          player: true
        }
      });

      const gameCompletionInput: CheckGameCompletionInput = {
        gameId: gameId,
        seasonPlayers: seasonPlayers,
        completedOrSkippedTurns: completedOrSkippedTurns
      };

      const completionResult = checkGameCompletionPure(gameCompletionInput);
      const isCompleted = completionResult.isCompleted;

      return {
        success: true,
        game: game as GameWithDetails,
        isCompleted
      };

    } catch (error) {
      console.error(`Error getting game status for ${gameId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Activates a specific game (sets status to ACTIVE)
   * @param gameId The ID of the game to activate
   * @param tx Optional Prisma transaction client
   * @returns The updated game or null if failed
   */
  async activateGame(gameId: string, tx?: Prisma.TransactionClient): Promise<Game | null> {
    try {
      const prismaClient = tx || this.prisma;

      const updatedGame = await prismaClient.game.update({
        where: { id: gameId },
        data: {
          status: 'ACTIVE',
          updatedAt: new Date()
        }
      });

      console.log(`Game ${gameId} activated successfully`);
      return updatedGame;

    } catch (error) {
      console.error(`Error activating game ${gameId}:`, error);
      return null;
    }
  }

  /**
   * Marks a game as completed and sets the completion timestamp
   * @param gameId The ID of the game to complete
   * @param tx Optional Prisma transaction client
   * @returns The updated game or null if failed
   */
  async completeGame(gameId: string, tx?: Prisma.TransactionClient): Promise<Game | null> {
    try {
      const prismaClient = tx || this.prisma;

      const updatedGame = await prismaClient.game.update({
        where: { id: gameId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          updatedAt: new Date()
        }
      });

      console.log(`Game ${gameId} marked as completed`);
      return updatedGame;

    } catch (error) {
      console.error(`Error completing game ${gameId}:`, error);
      return null;
    }
  }

  /**
   * Gets all games for a season with optional status filter
   * @param seasonId The ID of the season
   * @param status Optional status filter
   * @returns Array of games
   */
  async getGamesForSeason(seasonId: string, status?: string): Promise<Game[]> {
    try {
      const where: Prisma.GameWhereInput = { seasonId };
      if (status) {
        where.status = status;
      }

      return await this.prisma.game.findMany({
        where,
        orderBy: {
          createdAt: 'asc'
        }
      });

    } catch (error) {
      console.error(`Error getting games for season ${seasonId}:`, error);
      return [];
    }
  }

  /**
   * Gets a game with its turns and player information for game logic operations
   * @param gameId The ID of the game
   * @returns Game with detailed turn and player information or null
   */
  async getGameWithTurnsAndPlayers(gameId: string): Promise<GameWithTurnsAndPlayers | null> {
    try {
      return await this.prisma.game.findUnique({
        where: { id: gameId },
        include: {
          season: {
            include: {
              players: {
                include: {
                  player: true
                }
              }
            }
          },
          turns: {
            include: {
              player: true
            },
            orderBy: {
              turnNumber: 'asc'
            }
          }
        }
      });

    } catch (error) {
      console.error(`Error getting game with turns and players for ${gameId}:`, error);
      return null;
    }
  }

  /**
   * Handles turn completion event for a game
   * This method is called when a turn is completed or skipped
   * It checks if the game is now complete and handles the completion
   * @param turnId The ID of the completed/skipped turn
   * @returns Success status and any error message
   */
  async handleTurnCompletion(turnId: string): Promise<{ success: boolean; error?: string; gameCompleted?: boolean }> {
    try {
      // Get the turn to find its game
      const turn = await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: {
          game: true
        }
      });

      if (!turn) {
        return { success: false, error: 'Turn not found' };
      }

      const gameId = turn.gameId;

      // Check if the game is now completed using pure game logic
      const seasonPlayers = await this.prisma.player.findMany({
        where: {
          seasons: {
            some: {
              seasonId: turn.game.seasonId
            }
          }
        }
      });

      const completedOrSkippedTurns = await this.prisma.turn.findMany({
        where: {
          gameId: gameId,
          status: {
            in: ['COMPLETED', 'SKIPPED']
          }
        },
        include: {
          player: true
        }
      });

      const gameCompletionInput: CheckGameCompletionInput = {
        gameId: gameId,
        seasonPlayers: seasonPlayers,
        completedOrSkippedTurns: completedOrSkippedTurns
      };

      const completionResult = checkGameCompletionPure(gameCompletionInput);
      const isGameCompleted = completionResult.isCompleted;

      if (isGameCompleted) {
        // Mark the game as completed
        const completedGame = await this.completeGame(gameId);
        
        if (!completedGame) {
          return { success: false, error: 'Failed to mark game as completed' };
        }

        // Send game completion announcement - don't let announcement failures prevent game completion
        try {
          await this.sendGameCompletionAnnouncement(completedGame);
        } catch (announcementError) {
          // Log the announcement failure but don't fail the entire operation
          Logger.error(`Game completion announcement failed for game ${gameId}, but game completion was successful`, {
            gameId,
            turnId,
            announcementError: announcementError instanceof Error ? announcementError.message : String(announcementError),
            source: 'GameService.handleTurnCompletion'
          });
          
          // Publish error event for monitoring
          const errorInfo = ErrorHandler.createCustomError(
            ErrorType.BUSINESS_LOGIC,
            'ANNOUNCEMENT_FAILED_AFTER_COMPLETION',
            `Game ${gameId} completed successfully but announcement failed: ${announcementError instanceof Error ? announcementError.message : String(announcementError)}`,
            'Game was completed but announcement could not be sent',
            { gameId, turnId, originalError: announcementError }
          );
          
          this.publishErrorEvent(errorInfo, { gameId, turnId });
        }

        Logger.info(`Game ${gameId} marked as completed after turn ${turnId} completion`, { gameId, turnId });
        return { success: true, gameCompleted: true };
      }

      return { success: true, gameCompleted: false };

    } catch (error) {
      console.error(`Error handling turn completion for turn ${turnId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Updates the status of a game
   * @param gameId The ID of the game to update
   * @param newStatus The new status to set
   * @param tx Optional Prisma transaction client
   * @returns The updated game or null if failed
   */
  async updateGameStatus(
    gameId: string, 
    newStatus: string, 
    tx?: Prisma.TransactionClient
  ): Promise<Game | null> {
    try {
      const prismaClient = tx || this.prisma;

      const updatedGame = await prismaClient.game.update({
        where: { id: gameId },
        data: {
          status: newStatus,
          updatedAt: new Date(),
          // Set completedAt if transitioning to COMPLETED
          ...(newStatus === 'COMPLETED' && { completedAt: new Date() })
        }
      });

      console.log(`Game ${gameId} status updated to ${newStatus}`);
      return updatedGame;

    } catch (error) {
      console.error(`Error updating game ${gameId} status to ${newStatus}:`, error);
      return null;
    }
  }

  /**
   * Finds a game by ID
   * @param gameId The ID of the game to find
   * @returns The game or null if not found
   */
  async findGameById(gameId: string): Promise<Game | null> {
    try {
      return await this.prisma.game.findUnique({
        where: { id: gameId }
      });

    } catch (error) {
      console.error(`Error finding game ${gameId}:`, error);
      return null;
    }
  }

  /**
   * Gets statistics for a game (turn counts, completion percentage, etc.)
   * @param gameId The ID of the game
   * @returns Game statistics object
   */
  async getGameStatistics(gameId: string): Promise<{
    totalTurns: number;
    completedTurns: number;
    skippedTurns: number;
    pendingTurns: number;
    completionPercentage: number;
  } | null> {
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
      console.error(`Error getting game statistics for ${gameId}:`, error);
      return null;
    }
  }

  /**
   * Sends a game completion announcement to the configured channel
   * @param game The completed game
   */
  private async sendGameCompletionAnnouncement(game: Game): Promise<void> {
    const context = {
      gameId: game.id,
      seasonId: game.seasonId,
      gameStatus: game.status,
      source: 'GameService.sendGameCompletionAnnouncement'
    };

    try {
      Logger.info(`Starting game completion announcement process for game ${game.id}`, context);

      let guildId: string | null = null;

      // Get guildId - handle both season games and on-demand games
      try {
        if (game.seasonId) {
          // Season game - get guildId from season
          const season = await this.prisma.season.findUnique({
            where: { id: game.seasonId }
          });
          guildId = season?.guildId || null;
          
          if (!season) {
            const errorInfo = ErrorHandler.createCustomError(
              ErrorType.DATABASE,
              'SEASON_NOT_FOUND',
              `Season ${game.seasonId} not found for game ${game.id}`,
              'Game completion announcement failed due to missing season data',
              { ...context, seasonId: game.seasonId }
            );
            this.publishErrorEvent(errorInfo, context);
            return;
          }
        } else {
          // On-demand game - use game.guildId directly
          guildId = game.guildId;
        }
      } catch (error) {
        const errorInfo = ErrorHandler.createCustomError(
          ErrorType.DATABASE,
          'GUILD_ID_RESOLUTION_FAILED',
          `Failed to resolve guild ID for game ${game.id}: ${error instanceof Error ? error.message : String(error)}`,
          'Game completion announcement failed due to database error',
          { ...context, originalError: error }
        );
        this.publishErrorEvent(errorInfo, context);
        throw error;
      }

      if (!guildId) {
        Logger.info(`Game ${game.id} has no guild ID, skipping completion announcement`, context);
        return;
      }

      // Get the completed channel from config
      let completedChannelId: string | null = null;
      try {
        completedChannelId = await this.channelConfigService.getCompletedChannelId(guildId);
        if (!completedChannelId) {
          Logger.info(`No completed channel configured for guild ${guildId}, skipping announcement`, { ...context, guildId });
          return;
        }
      } catch (error) {
        const errorInfo = ErrorHandler.createCustomError(
          ErrorType.DATABASE,
          'CHANNEL_CONFIG_FETCH_FAILED',
          `Failed to get completed channel config for guild ${guildId}: ${error instanceof Error ? error.message : String(error)}`,
          'Game completion announcement failed due to configuration error',
          { ...context, guildId, originalError: error }
        );
        this.publishErrorEvent(errorInfo, context);
        throw error;
      }

      // Get the Discord channel
      let channel;
      try {
        channel = await this.discordClient.channels.fetch(completedChannelId);
        if (!channel || !channel.isTextBased()) {
          const errorInfo = ErrorHandler.createCustomError(
            ErrorType.DISCORD_API,
            'INVALID_CHANNEL',
            `Completed channel ${completedChannelId} not found or not text-based`,
            'Game completion announcement failed due to invalid channel configuration',
            { ...context, guildId, completedChannelId }
          );
          this.publishErrorEvent(errorInfo, context);
          return;
        }
      } catch (error) {
        const errorInfo = ErrorHandler.createCustomError(
          ErrorType.DISCORD_API,
          'CHANNEL_FETCH_FAILED',
          `Failed to fetch Discord channel ${completedChannelId}: ${error instanceof Error ? error.message : String(error)}`,
          'Game completion announcement failed due to Discord API error',
          { ...context, guildId, completedChannelId, originalError: error }
        );
        this.publishErrorEvent(errorInfo, context);
        throw error;
      }

      // Get game statistics for the announcement
      let stats;
      try {
        stats = await this.getGameStatistics(game.id);
        if (!stats) {
          const errorInfo = ErrorHandler.createCustomError(
            ErrorType.DATABASE,
            'GAME_STATS_FETCH_FAILED',
            `Failed to get statistics for game ${game.id}`,
            'Game completion announcement failed due to missing game statistics',
            context
          );
          this.publishErrorEvent(errorInfo, context);
          return;
        }
      } catch (error) {
        const errorInfo = ErrorHandler.createCustomError(
          ErrorType.DATABASE,
          'GAME_STATS_ERROR',
          `Error getting game statistics for ${game.id}: ${error instanceof Error ? error.message : String(error)}`,
          'Game completion announcement failed due to database error',
          { ...context, originalError: error }
        );
        this.publishErrorEvent(errorInfo, context);
        throw error;
      }

      // Create completion message based on game type
      let completionMessage;
      try {
        if (game.seasonId) {
          // Season game
          completionMessage = MessageHelpers.info(
            'messages.game.seasonGameCompleted',
            {
              gameId: game.id,
              seasonId: game.seasonId,
              completedTurns: stats.completedTurns,
              totalTurns: stats.totalTurns,
              skippedTurns: stats.skippedTurns,
              completionPercentage: stats.completionPercentage,
              finishedGamesLink: `<#${completedChannelId}>`
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
          
          completionMessage = MessageHelpers.info(
            'messages.game.onDemandGameCompleted',
            {
              gameId: game.id,
              creatorName: gameWithCreator?.creator?.name || gameWithCreator?.creator?.discordUserId || 'Unknown',
              completedTurns: stats.completedTurns,
              totalTurns: stats.totalTurns,
              playerCount: playerCount,
              completionReason: game.status === 'COMPLETED' ? 'Natural completion' : 'Admin terminated',
              finishedGamesLink: `<#${completedChannelId}>`
            }
          );
        }
      } catch (error) {
        const errorInfo = ErrorHandler.createCustomError(
          ErrorType.BUSINESS_LOGIC,
          'MESSAGE_FORMATTING_FAILED',
          `Failed to format completion message for game ${game.id}: ${error instanceof Error ? error.message : String(error)}`,
          'Game completion announcement failed due to message formatting error',
          { ...context, originalError: error }
        );
        this.publishErrorEvent(errorInfo, context);
        throw error;
      }

      // Send the message
      try {
        await MessageAdapter.processInstruction(
          completionMessage,
          undefined, // No interaction for channel messages
          'en',
          this.discordClient
        );

        Logger.info(`Game completion announcement sent successfully to channel ${completedChannelId} for game ${game.id}`, {
          ...context,
          guildId,
          completedChannelId,
          gameStats: stats
        });

      } catch (error) {
        const errorInfo = ErrorHandler.createCustomError(
          ErrorType.DISCORD_API,
          'MESSAGE_SEND_FAILED',
          `Failed to send completion message for game ${game.id}: ${error instanceof Error ? error.message : String(error)}`,
          'Game completion announcement failed to send',
          { ...context, guildId, completedChannelId, originalError: error }
        );
        this.publishErrorEvent(errorInfo, context);
        throw error;
      }

    } catch (error) {
      // Final catch-all error handler
      const errorInfo = ErrorHandler.createCustomError(
        ErrorType.UNKNOWN,
        'ANNOUNCEMENT_PROCESS_FAILED',
        `Unexpected error in game completion announcement process for game ${game.id}: ${error instanceof Error ? error.message : String(error)}`,
        'Game completion announcement failed due to an unexpected error',
        { ...context, originalError: error }
      );
      
      Logger.error(`Critical error in game completion announcement for game ${game.id}`, {
        ...context,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      this.publishErrorEvent(errorInfo, context);
      
      // Re-throw to ensure the calling method knows the announcement failed
      // but the game completion itself should still be recorded
      throw error;
    }
  }

  /**
   * Publishes error events to the error event bus for monitoring and alerting
   * @param errorInfo The error information
   * @param context Additional context
   */
  private publishErrorEvent(errorInfo: any, context: Record<string, any>): void {
    try {
      const eventBus = ErrorEventBus.getInstance();
      eventBus.publishError(
        ErrorEventType.SERVICE_ERROR,
        errorInfo,
        { service: 'GameService', method: 'sendGameCompletionAnnouncement', ...context }
      );
    } catch (eventError) {
      // If we can't publish the error event, at least log it
      Logger.error('Failed to publish error event for game completion announcement', {
        originalError: errorInfo,
        eventError: eventError instanceof Error ? eventError.message : String(eventError),
        context
      });
    }
  }
} 