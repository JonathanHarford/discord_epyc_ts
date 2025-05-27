import { Game, GameConfig, Player, Prisma, PrismaClient, Turn } from '@prisma/client';
import { Client as DiscordClient } from 'discord.js';
import { DateTime } from 'luxon';
import { nanoid } from 'nanoid';

import { ChannelConfigService } from './ChannelConfigService.js';
import { OnDemandTurnService } from './OnDemandTurnService.js';
import { SchedulerService } from './SchedulerService.js';
import { MessageAdapter } from '../messaging/MessageAdapter.js';
import { MessageHelpers } from '../messaging/MessageHelpers.js';
import { MessageInstruction } from '../types/MessageInstruction.js';
import { parseDuration } from '../utils/datetime.js';

export interface GameWithConfig extends Game {
  config: GameConfig;
  creator: Player;
  turns: Turn[];
}

export interface GameCreationResult {
  success: boolean;
  game?: GameWithConfig;
  error?: string;
}

export interface GameJoinResult {
  success: boolean;
  game?: GameWithConfig;
  turn?: Turn;
  error?: string;
}

export interface GameListResult {
  success: boolean;
  activeGames?: GameWithConfig[];
  availableGames?: GameWithConfig[];
  error?: string;
}

export interface ReturnPolicyCheck {
  canJoin: boolean;
  reason?: string;
  turnsUntilEligible?: number;
}

export class OnDemandGameService {
  private prisma: PrismaClient;
  private discordClient: DiscordClient;
  private turnService: OnDemandTurnService;
  private schedulerService?: SchedulerService;
  private channelConfigService: ChannelConfigService;

  constructor(
    prisma: PrismaClient,
    discordClient: DiscordClient,
    schedulerService?: SchedulerService
  ) {
    this.prisma = prisma;
    this.discordClient = discordClient;
    this.schedulerService = schedulerService;
    this.turnService = new OnDemandTurnService(prisma, discordClient, schedulerService);
    this.channelConfigService = new ChannelConfigService(prisma);
  }

  /**
   * Creates a new on-demand game
   * @param creatorId The ID of the player creating the game
   * @param guildId The Discord guild ID where the game was created
   * @returns Game creation result
   */
  async createGame(
    creatorId: string,
    guildId: string
  ): Promise<GameCreationResult> {
    try {
      // Get the creator player
      const creator = await this.prisma.player.findUnique({
        where: { id: creatorId }
      });

      if (!creator) {
        return { success: false, error: 'Creator not found' };
      }

      // Check if creator is banned
      if (creator.bannedAt) {
        return { success: false, error: 'Banned players cannot create games' };
      }

      // Get the guild's default game config
      const config = await this.getGuildDefaultGameConfig(guildId);

      // Create the game
      const game = await this.prisma.game.create({
        data: {
          id: nanoid(),
          status: 'SETUP',
          creatorId: creatorId,
          guildId: guildId,
          configId: config.id,
          lastActivityAt: new Date(),
        },
        include: {
          config: true,
          creator: true,
          turns: true
        }
      });

      // Create the initial turn for the creator
      const turnResult = await this.turnService.createInitialTurn(game, creator);
      if (!turnResult.success) {
        // Rollback game creation
        await this.prisma.game.delete({ where: { id: game.id } });
        return { success: false, error: turnResult.error };
      }

      // Update game status to PENDING (waiting for more players)
      const updatedGame = await this.prisma.game.update({
        where: { id: game.id },
        data: { status: 'PENDING' },
        include: {
          config: true,
          creator: true,
          turns: true
        }
      });

      console.log(`On-demand game ${game.id} created by ${creatorId} in guild ${guildId}`);
      return { success: true, game: updatedGame as GameWithConfig };

    } catch (error) {
      console.error(`Error creating on-demand game:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Allows a player to join an available on-demand game
   * @param playerId The ID of the player joining
   * @param guildId The Discord guild ID
   * @returns Game join result
   */
  async joinGame(
    playerId: string,
    guildId: string
  ): Promise<GameJoinResult> {
    try {
      // Get the player
      const player = await this.prisma.player.findUnique({
        where: { id: playerId }
      });

      if (!player) {
        return { success: false, error: 'Player not found' };
      }

      // Check if player is banned
      if (player.bannedAt) {
        return { success: false, error: 'Banned players cannot join games' };
      }

      // Find the best available game for this player
      const gameResult = await this.findBestAvailableGame(playerId, guildId);
      if (!gameResult.success || !gameResult.game) {
        return { success: false, error: gameResult.error || 'No available games found' };
      }

      const game = gameResult.game;

      // Find the available turn in this game
      const availableTurn = await this.prisma.turn.findFirst({
        where: {
          gameId: game.id,
          status: 'AVAILABLE'
        },
        include: {
          game: { include: { config: true } },
          previousTurn: true
        }
      });

      if (!availableTurn) {
        return { success: false, error: 'No available turns in the selected game' };
      }

      // Assign the turn to the player
      const turnResult = await this.turnService.assignTurn(availableTurn.id, playerId);
      if (!turnResult.success) {
        return { success: false, error: turnResult.error };
      }

      // Update game status to ACTIVE if it was PENDING
      if (game.status === 'PENDING') {
        await this.prisma.game.update({
          where: { id: game.id },
          data: { status: 'ACTIVE' }
        });
      }

      // Get the updated game with all details
      const updatedGame = await this.prisma.game.findUnique({
        where: { id: game.id },
        include: {
          config: true,
          creator: true,
          turns: true
        }
      });

      console.log(`Player ${playerId} joined game ${game.id}`);
      return { 
        success: true, 
        game: updatedGame as GameWithConfig, 
        turn: turnResult.turn 
      };

    } catch (error) {
      console.error(`Error joining game:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Finds the best available game for a player to join
   * @param playerId The ID of the player
   * @param guildId The Discord guild ID
   * @returns The best available game or error
   */
  async findBestAvailableGame(
    playerId: string,
    guildId: string
  ): Promise<{ success: boolean; game?: GameWithConfig; error?: string }> {
    try {
      // Get all games in this guild that have available turns
      const availableGames = await this.prisma.game.findMany({
        where: {
          guildId: guildId,
          seasonId: null, // Only on-demand games
          status: {
            in: ['PENDING', 'ACTIVE']
          },
          turns: {
            some: {
              status: 'AVAILABLE'
            }
          }
        },
        include: {
          config: true,
          creator: true,
          turns: {
            orderBy: { turnNumber: 'asc' }
          }
        }
      });

      if (availableGames.length === 0) {
        return { success: false, error: 'No available games found' };
      }

      // Filter games based on return policy
      const eligibleGames: GameWithConfig[] = [];
      
      for (const game of availableGames) {
        const returnCheck = await this.checkReturnPolicy(playerId, game.id, game.config!);
        if (returnCheck.canJoin) {
          eligibleGames.push(game as GameWithConfig);
        }
      }

      if (eligibleGames.length === 0) {
        return { success: false, error: 'No eligible games found (return policy restrictions)' };
      }

      // Sort by soonest expiring (based on last activity + stale timeout)
      const sortedGames = eligibleGames.sort((a, b) => {
        const aExpiry = DateTime.fromJSDate(a.lastActivityAt).plus(parseDuration(a.config.staleTimeout));
        const bExpiry = DateTime.fromJSDate(b.lastActivityAt).plus(parseDuration(b.config.staleTimeout));
        return aExpiry.toMillis() - bExpiry.toMillis();
      });

      return { success: true, game: sortedGames[0] };

    } catch (error) {
      console.error(`Error finding best available game:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Checks if a player can join a game based on return policy
   * @param playerId The ID of the player
   * @param gameId The ID of the game
   * @param config The game configuration
   * @returns Return policy check result
   */
  async checkReturnPolicy(
    playerId: string,
    gameId: string,
    config: GameConfig
  ): Promise<ReturnPolicyCheck> {
    try {
      // If no return policy is set, anyone can join
      if (!config.returnCount || config.returnCount === 0) {
        return { canJoin: true };
      }

      // Count how many times this player has already played in this game
      const playerTurns = await this.prisma.turn.count({
        where: {
          gameId: gameId,
          playerId: playerId,
          status: {
            in: ['COMPLETED', 'SKIPPED']
          }
        }
      });

      // If player hasn't exceeded return count, they can join
      if (playerTurns < config.returnCount) {
        return { canJoin: true };
      }

      // Check cooldown period if return cooldown is set
      if (config.returnCooldown && config.returnCooldown > 0) {
        // Get the player's last turn in this game
        const lastPlayerTurn = await this.prisma.turn.findFirst({
          where: {
            gameId: gameId,
            playerId: playerId,
            status: {
              in: ['COMPLETED', 'SKIPPED']
            }
          },
          orderBy: { turnNumber: 'desc' }
        });

        if (lastPlayerTurn) {
          // Count turns by other players since the player's last turn
          const turnsSinceLastPlay = await this.prisma.turn.count({
            where: {
              gameId: gameId,
              turnNumber: {
                gt: lastPlayerTurn.turnNumber
              },
              playerId: {
                not: playerId
              },
              status: {
                in: ['COMPLETED', 'SKIPPED']
              }
            }
          });

          if (turnsSinceLastPlay >= config.returnCooldown) {
            return { canJoin: true };
          }

          return {
            canJoin: false,
            reason: 'Return cooldown not met',
            turnsUntilEligible: config.returnCooldown - turnsSinceLastPlay
          };
        }
      }

      return {
        canJoin: false,
        reason: 'Return limit exceeded'
      };

    } catch (error) {
      console.error(`Error checking return policy:`, error);
      return { canJoin: false, reason: 'Error checking return policy' };
    }
  }

  /**
   * Lists games for a player (active games they're in and available games they can join)
   * @param playerId The ID of the player
   * @param guildId The Discord guild ID
   * @returns Game list result
   */
  async listGamesForPlayer(
    playerId: string,
    guildId: string
  ): Promise<GameListResult> {
    try {
      // Get active games where the player has a pending turn
      const activeGames = await this.prisma.game.findMany({
        where: {
          guildId: guildId,
          seasonId: null,
          status: {
            in: ['PENDING', 'ACTIVE']
          },
          turns: {
            some: {
              playerId: playerId,
              status: 'PENDING'
            }
          }
        },
        include: {
          config: true,
          creator: true,
          turns: {
            orderBy: { turnNumber: 'asc' }
          }
        }
      });

      // Get available games the player can join
      const availableGames = await this.prisma.game.findMany({
        where: {
          guildId: guildId,
          seasonId: null,
          status: {
            in: ['PENDING', 'ACTIVE']
          },
          turns: {
            some: {
              status: 'AVAILABLE'
            }
          }
        },
        include: {
          config: true,
          creator: true,
          turns: {
            orderBy: { turnNumber: 'asc' }
          }
        }
      });

      // Filter available games based on return policy
      const eligibleAvailableGames: GameWithConfig[] = [];
      for (const game of availableGames) {
        const returnCheck = await this.checkReturnPolicy(playerId, game.id, game.config!);
        if (returnCheck.canJoin) {
          eligibleAvailableGames.push(game as GameWithConfig);
        }
      }

      return {
        success: true,
        activeGames: activeGames as GameWithConfig[],
        availableGames: eligibleAvailableGames
      };

    } catch (error) {
      console.error(`Error listing games for player:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Gets detailed information about a specific game
   * @param gameId The ID of the game
   * @returns The game with details or null if not found
   */
  async getGameDetails(gameId: string): Promise<GameWithConfig | null> {
    try {
      const game = await this.prisma.game.findUnique({
        where: { id: gameId },
        include: {
          config: true,
          creator: true,
          turns: {
            orderBy: { turnNumber: 'asc' },
            include: {
              player: true
            }
          }
        }
      });

      return game as GameWithConfig | null;

    } catch (error) {
      console.error(`Error getting game details:`, error);
      return null;
    }
  }

  /**
   * Checks if a game should be completed based on completion criteria
   * @param gameId The ID of the game to check
   * @returns Whether the game should be completed
   */
  async checkGameCompletion(gameId: string): Promise<{ shouldComplete: boolean; reason?: string }> {
    try {
      const game = await this.prisma.game.findUnique({
        where: { id: gameId },
        include: {
          config: true,
          turns: {
            orderBy: { turnNumber: 'asc' }
          }
        }
      });

      if (!game || !game.config) {
        return { shouldComplete: false, reason: 'Game or config not found' };
      }

      const completedTurns = game.turns.filter(turn => 
        turn.status === 'COMPLETED' || turn.status === 'SKIPPED'
      );

      // Check if we've reached max turns
      if (game.config.maxTurns && completedTurns.length >= game.config.maxTurns) {
        return { shouldComplete: true, reason: 'Maximum turns reached' };
      }

      // Check if we've met minimum turns and the game is stale
      if (completedTurns.length >= game.config.minTurns) {
        const staleThreshold = DateTime.fromJSDate(game.lastActivityAt)
          .plus(parseDuration(game.config.staleTimeout));
        
        if (DateTime.now() >= staleThreshold) {
          return { shouldComplete: true, reason: 'Game is stale' };
        }
      }

      return { shouldComplete: false };

    } catch (error) {
      console.error(`Error checking game completion:`, error);
      return { shouldComplete: false, reason: 'Error checking completion' };
    }
  }

  /**
   * Completes a game and handles announcements
   * @param gameId The ID of the game to complete
   * @returns Success status
   */
  async completeGame(gameId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const game = await this.prisma.game.findUnique({
        where: { id: gameId },
        include: {
          config: true,
          creator: true,
          turns: {
            orderBy: { turnNumber: 'asc' },
            include: {
              player: true
            }
          }
        }
      });

      if (!game) {
        return { success: false, error: 'Game not found' };
      }

      // Update game status to COMPLETED
      await this.prisma.game.update({
        where: { id: gameId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });

      // Cancel any pending timeouts for this game
      if (this.schedulerService) {
        await this.schedulerService.cancelJobsForGame(gameId);
      }

      // Send completion announcement to configured channel
      await this.sendGameCompletionAnnouncement(game);

      console.log(`Game ${gameId} completed successfully`);
      return { success: true };

    } catch (error) {
      console.error(`Error completing game ${gameId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Terminates a game (admin action)
   * @param gameId The ID of the game to terminate
   * @returns Success status
   */
  async terminateGame(gameId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const game = await this.prisma.game.findUnique({
        where: { id: gameId }
      });

      if (!game) {
        return { success: false, error: 'Game not found' };
      }

      // Update game status to TERMINATED
      await this.prisma.game.update({
        where: { id: gameId },
        data: {
          status: 'TERMINATED',
          updatedAt: new Date()
        }
      });

      // Cancel any pending timeouts for this game
      if (this.schedulerService) {
        await this.schedulerService.cancelJobsForGame(gameId);
      }

      console.log(`Game ${gameId} terminated by admin`);
      return { success: true };

    } catch (error) {
      console.error(`Error terminating game ${gameId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Gets the guild's default game configuration
   * @param guildId The Discord guild ID
   * @returns The default GameConfig for the guild
   */
  private async getGuildDefaultGameConfig(guildId: string): Promise<GameConfig> {
    try {
      // First, try to find a guild-specific default
      const guildDefault = await this.prisma.gameConfig.findUnique({
        where: { isGuildDefaultFor: guildId }
      });

      if (guildDefault) {
        return guildDefault;
      }

      // If no guild-specific default, create one with system defaults
      const newGuildDefault = await this.prisma.gameConfig.create({
        data: {
          isGuildDefaultFor: guildId,
          // All other fields will use their schema defaults
        }
      });

      return newGuildDefault;
    } catch (error) {
      console.error(`Error getting guild default game config for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Lists all games in a guild (admin function)
   * @param guildId The Discord guild ID
   * @param status Optional status filter
   * @returns List of games
   */
  async listAllGames(
    guildId: string,
    status?: string
  ): Promise<{ success: boolean; games?: GameWithConfig[]; error?: string }> {
    try {
      const whereClause: any = {
        guildId: guildId,
        seasonId: null // Only on-demand games
      };

      if (status) {
        whereClause.status = status;
      }

      const games = await this.prisma.game.findMany({
        where: whereClause,
        include: {
          config: true,
          creator: true,
          turns: {
            orderBy: { turnNumber: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return { success: true, games: games as GameWithConfig[] };

    } catch (error) {
      console.error(`Error listing all games:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Sends a game completion announcement to the configured channel
   * @param game The completed game with all related data
   */
  private async sendGameCompletionAnnouncement(game: any): Promise<void> {
    try {
      if (!game.guildId) {
        console.log(`Game ${game.id} has no guild ID, skipping completion announcement`);
        return;
      }

      // Get the completed channel from config
      const completedChannelId = await this.channelConfigService.getCompletedChannelId(game.guildId);
      if (!completedChannelId) {
        console.log(`No completed channel configured for guild ${game.guildId}, skipping announcement`);
        return;
      }

      // Get the channel
      const channel = await this.discordClient.channels.fetch(completedChannelId);
      if (!channel || !channel.isTextBased()) {
        console.error(`Completed channel ${completedChannelId} not found or not text-based`);
        return;
      }

      // Format game results
      const completedTurns = game.turns.filter((turn: any) => 
        turn.status === 'COMPLETED' || turn.status === 'SKIPPED'
      );
      const totalTurns = game.turns.length;
      const playerCount = new Set(game.turns.map((turn: any) => turn.playerId)).size;

      // Create completion message
      const completionMessage = MessageHelpers.info(
        'messages.ondemand.gameCompleted',
        {
          gameId: game.id,
          creatorName: game.creator.displayName || game.creator.discordUserId,
          completedTurns: completedTurns.length,
          totalTurns: totalTurns,
          playerCount: playerCount,
          completionReason: game.status === 'COMPLETED' ? 'Natural completion' : 'Admin terminated'
        }
      );

      // Send the message
      await MessageAdapter.processInstruction(
        completionMessage,
        undefined, // No interaction for channel messages
        'en',
        this.discordClient
      );

      console.log(`Game completion announcement sent to channel ${completedChannelId} for game ${game.id}`);

    } catch (error) {
      console.error(`Error sending game completion announcement for game ${game.id}:`, error);
    }
  }
} 