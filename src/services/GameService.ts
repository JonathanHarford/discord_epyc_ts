import { PrismaClient, Game, Season, Player, Turn, Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import { checkGameCompletion } from '../game/gameLogic.js';

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

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
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
      const gameCreationPromises = season.players.map(async (_playerOnSeason, index) => {
        return prismaClient.game.create({
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

      // Check if the game is completed using existing game logic
      const isCompleted = await checkGameCompletion(gameId, this.prisma);

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

      // Check if the game is now completed
      const isGameCompleted = await checkGameCompletion(gameId, this.prisma);

      if (isGameCompleted) {
        // Mark the game as completed
        const completedGame = await this.completeGame(gameId);
        
        if (!completedGame) {
          return { success: false, error: 'Failed to mark game as completed' };
        }

        console.log(`Game ${gameId} marked as completed after turn ${turnId} completion`);
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
} 