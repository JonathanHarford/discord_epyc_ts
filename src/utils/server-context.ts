import { PrismaClient } from '@prisma/client';
import { Client as DiscordClient } from 'discord.js';

export interface ServerContext {
  serverName: string;
  guildId?: string;
  channelId?: string;
}

/**
 * Get server context information for a game or season to include in DM messages
 */
export class ServerContextService {
  private prisma: PrismaClient;
  private discordClient: DiscordClient;

  constructor(prisma: PrismaClient, discordClient: DiscordClient) {
    this.prisma = prisma;
    this.discordClient = discordClient;
  }

  /**
   * Get server context for a game
   * @param gameId The game ID
   * @returns Server context information
   */
  async getGameServerContext(gameId: string): Promise<ServerContext> {
    try {
      const game = await this.prisma.game.findUnique({
        where: { id: gameId },
        include: {
          season: true
        }
      });

      if (!game) {
        return { serverName: 'Unknown Server' };
      }

      // For season games, use the season's guild info
      if (game.season && game.season.guildId) {
        return await this.getServerContextFromGuildId(game.season.guildId, game.season.channelId);
      }

      // For on-demand games, use the game's guild info
      if (game.guildId) {
        return await this.getServerContextFromGuildId(game.guildId);
      }

      // Fallback for DM-created games/seasons
      return { serverName: 'Direct Message' };
    } catch (error) {
      console.error('Error getting game server context:', error);
      return { serverName: 'Unknown Server' };
    }
  }

  /**
   * Get server context for a season
   * @param seasonId The season ID
   * @returns Server context information
   */
  async getSeasonServerContext(seasonId: string): Promise<ServerContext> {
    try {
      const season = await this.prisma.season.findUnique({
        where: { id: seasonId }
      });

      if (!season) {
        return { serverName: 'Unknown Server' };
      }

      if (season.guildId) {
        return await this.getServerContextFromGuildId(season.guildId, season.channelId);
      }

      // Fallback for DM-created seasons
      return { serverName: 'Direct Message' };
    } catch (error) {
      console.error('Error getting season server context:', error);
      return { serverName: 'Unknown Server' };
    }
  }

  /**
   * Get server context from a guild ID
   * @param guildId The Discord guild ID
   * @param channelId Optional channel ID for additional context
   * @returns Server context information
   */
  private async getServerContextFromGuildId(guildId: string, channelId?: string): Promise<ServerContext> {
    try {
      const guild = await this.discordClient.guilds.fetch(guildId);
      
      if (!guild) {
        return { 
          serverName: 'Unknown Server',
          guildId,
          channelId
        };
      }

      return {
        serverName: guild.name,
        guildId,
        channelId
      };
    } catch (error) {
      console.error(`Error fetching guild ${guildId}:`, error);
      return { 
        serverName: 'Unknown Server',
        guildId,
        channelId
      };
    }
  }

  /**
   * Get server context for a turn (convenience method)
   * @param turnId The turn ID
   * @returns Server context information
   */
  async getTurnServerContext(turnId: string): Promise<ServerContext> {
    try {
      const turn = await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: {
          game: {
            include: {
              season: true
            }
          }
        }
      });

      if (!turn || !turn.game) {
        return { serverName: 'Unknown Server' };
      }

      return await this.getGameServerContext(turn.game.id);
    } catch (error) {
      console.error('Error getting turn server context:', error);
      return { serverName: 'Unknown Server' };
    }
  }
} 