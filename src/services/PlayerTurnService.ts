import { PrismaClient, Turn } from '@prisma/client';

export class PlayerTurnService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Checks if a player has any pending turns (PENDING or OFFERED status)
   * @param playerDiscordUserId The Discord user ID of the player
   * @returns Object with hasPendingTurn boolean and optional turn details
   */
  async checkPlayerPendingTurns(playerDiscordUserId: string): Promise<{
    hasPendingTurn: boolean;
    pendingTurn?: Turn & {
      game: {
        id: string;
        status: string;
        createdAt: Date;
        season?: {
          id: string;
          status: string;
        } | null;
        creator?: {
          name: string;
        } | null;
      };
    };
    error?: string;
  }> {
    try {
      // First find the player by Discord user ID
      const player = await this.prisma.player.findUnique({
        where: { discordUserId: playerDiscordUserId }
      });

      if (!player) {
        return { hasPendingTurn: false };
      }

      // Find any pending or offered turns for this player
      const pendingTurn = await this.prisma.turn.findFirst({
        where: {
          playerId: player.id,
          status: {
            in: ['PENDING', 'OFFERED']
          }
        },
        include: {
          game: {
            select: {
              id: true,
              status: true,
              createdAt: true,
              season: {
                select: {
                  id: true,
                  status: true
                }
              },
              creator: {
                select: {
                  name: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'asc' // Get the oldest pending turn first
        }
      });

      if (pendingTurn) {
        return {
          hasPendingTurn: true,
          pendingTurn
        };
      }

      return { hasPendingTurn: false };

    } catch (error) {
      console.error(`Error checking pending turns for player ${playerDiscordUserId}:`, error);
      return {
        hasPendingTurn: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Gets all pending turns for a player
   * @param playerDiscordUserId The Discord user ID of the player
   * @returns Array of pending turns with game details
   */
  async getPlayerPendingTurns(playerDiscordUserId: string): Promise<{
    pendingTurns: (Turn & {
      game: {
        id: string;
        status: string;
        createdAt: Date;
        season?: {
          id: string;
          status: string;
        } | null;
        creator?: {
          name: string;
        } | null;
      };
    })[];
    error?: string;
  }> {
    try {
      // First find the player by Discord user ID
      const player = await this.prisma.player.findUnique({
        where: { discordUserId: playerDiscordUserId }
      });

      if (!player) {
        return { pendingTurns: [] };
      }

      // Find all pending or offered turns for this player
      const pendingTurns = await this.prisma.turn.findMany({
        where: {
          playerId: player.id,
          status: {
            in: ['PENDING', 'OFFERED']
          }
        },
        include: {
          game: {
            select: {
              id: true,
              status: true,
              createdAt: true,
              season: {
                select: {
                  id: true,
                  status: true
                }
              },
              creator: {
                select: {
                  name: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      return { pendingTurns };

    } catch (error) {
      console.error(`Error getting pending turns for player ${playerDiscordUserId}:`, error);
      return {
        pendingTurns: [],
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
} 