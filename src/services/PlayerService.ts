import { Player, PrismaClient } from '@prisma/client';

import { MessageHelpers } from '../messaging/MessageHelpers.js';
import { MessageInstruction } from '../types/MessageInstruction.js';

export class PlayerService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Ban a player by setting their bannedAt timestamp
   * @param discordUserId The Discord user ID of the player to ban
   * @param reason Optional reason for the ban
   * @returns The updated player object
   */
  async banPlayer(discordUserId: string, reason?: string): Promise<Player> {
    try {
      // First check if player exists
      const existingPlayer = await this.prisma.player.findUnique({
        where: { discordUserId }
      });

      if (!existingPlayer) {
        throw new Error(`Player with Discord ID ${discordUserId} not found`);
      }

      if (existingPlayer.bannedAt) {
        throw new Error(`Player ${existingPlayer.name} is already banned`);
      }

      // Update player to set bannedAt timestamp
      const bannedPlayer = await this.prisma.player.update({
        where: { discordUserId },
        data: { bannedAt: new Date() }
      });

      console.log(`Player ${bannedPlayer.name} (${discordUserId}) has been banned${reason ? ` for: ${reason}` : ''}`);
      return bannedPlayer;
    } catch (error) {
      console.error('Error in PlayerService.banPlayer:', error);
      throw error;
    }
  }

  /**
   * Unban a player by setting their bannedAt to null
   * @param discordUserId The Discord user ID of the player to unban
   * @returns The updated player object
   */
  async unbanPlayer(discordUserId: string): Promise<Player> {
    try {
      // First check if player exists
      const existingPlayer = await this.prisma.player.findUnique({
        where: { discordUserId }
      });

      if (!existingPlayer) {
        throw new Error(`Player with Discord ID ${discordUserId} not found`);
      }

      if (!existingPlayer.bannedAt) {
        throw new Error(`Player ${existingPlayer.name} is not currently banned`);
      }

      // Update player to remove bannedAt timestamp
      const unbannedPlayer = await this.prisma.player.update({
        where: { discordUserId },
        data: { bannedAt: null }
      });

      console.log(`Player ${unbannedPlayer.name} (${discordUserId}) has been unbanned`);
      return unbannedPlayer;
    } catch (error) {
      console.error('Error in PlayerService.unbanPlayer:', error);
      throw error;
    }
  }

  /**
   * Check if a player is currently banned
   * @param discordUserId The Discord user ID to check
   * @returns True if the player is banned, false otherwise
   */
  async isPlayerBanned(discordUserId: string): Promise<boolean> {
    try {
      const player = await this.prisma.player.findUnique({
        where: { discordUserId },
        select: { bannedAt: true }
      });

      return player?.bannedAt !== null && player?.bannedAt !== undefined;
    } catch (error) {
      console.error('Error in PlayerService.isPlayerBanned:', error);
      return false;
    }
  }

  /**
   * Get a player by their Discord user ID
   * @param discordUserId The Discord user ID
   * @returns The player object or null if not found
   */
  async getPlayerByDiscordId(discordUserId: string): Promise<Player | null> {
    try {
      return await this.prisma.player.findUnique({
        where: { discordUserId }
      });
    } catch (error) {
      console.error('Error in PlayerService.getPlayerByDiscordId:', error);
      return null;
    }
  }

  /**
   * List all players, optionally filtered by season ID and banned status
   * @param seasonId Optional season ID to filter players by
   * @param bannedOnly Optional flag to show only banned players
   * @returns A MessageInstruction with the list of players
   */
  async listPlayers(seasonId?: string, bannedOnly?: boolean): Promise<MessageInstruction> {
    console.log(`PlayerService.listPlayers: Listing players${seasonId ? ` for season ${seasonId}` : ''}${bannedOnly ? ' (banned only)' : ''}`);
    
    try {
      // Define a proper type for the where clause based on Prisma's PlayerWhereInput
      let whereClause: {
        bannedAt?: { not: null } | null;
        seasons?: {
          some: {
            seasonId: string;
          };
        };
      } = {};
      
      // Filter by banned status if specified
      if (bannedOnly === true) {
        whereClause.bannedAt = { not: null };
      } else if (bannedOnly === false) {
        whereClause.bannedAt = null;
      }
      
      // Filter by season if specified
      if (seasonId) {
        whereClause.seasons = {
          some: {
            seasonId: seasonId
          }
        };
      }

      const players = await this.prisma.player.findMany({
        where: whereClause,
        include: {
          _count: {
            select: {
              seasons: true,
              turns: true
            }
          },
          seasons: {
            include: {
              season: {
                select: {
                  id: true,
                  status: true
                }
              }
            },
            ...(seasonId ? { where: { seasonId } } : { take: 5 }),
            orderBy: {
              joinedAt: 'desc'
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      const templateData = {
        players: players.map(player => ({
          id: player.id,
          name: player.name,
          discordUserId: player.discordUserId,
          isBanned: player.bannedAt !== null,
          bannedAt: player.bannedAt?.toISOString(),
          seasonCount: player._count.seasons,
          turnCount: player._count.turns,
          recentSeasons: player.seasons.map(s => ({ 
            id: s.season.id, 
            status: s.season.status,
            joinedAt: s.joinedAt.toISOString()
          })),
          createdAt: player.createdAt.toISOString()
        })),
        totalCount: players.length,
        ...(seasonId && { seasonFilter: seasonId }),
        bannedFilter: bannedOnly
      };

      return MessageHelpers.embedMessage(
        'success',
        'messages.admin.listPlayersSuccess',
        templateData,
        true // Admin messages should be ephemeral
      );
    } catch (error) {
      console.error('Error in PlayerService.listPlayers:', error);
      return MessageHelpers.embedMessage(
        'error',
        'messages.admin.listPlayersError',
        { error: error instanceof Error ? error.message : 'Unknown error' },
        true // Admin error messages should be ephemeral
      );
    }
  }
} 