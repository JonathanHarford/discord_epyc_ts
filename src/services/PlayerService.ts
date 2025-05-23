import { PrismaClient, Player } from '@prisma/client';

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
} 