import { PrismaClient } from '@prisma/client';

export interface ChannelConfig {
  id: string;
  guildId: string;
  announceChannelId: string | null;
  completedChannelId: string | null;
  adminChannelId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelConfigUpdateOptions {
  announceChannelId?: string | null;
  completedChannelId?: string | null;
  adminChannelId?: string | null;
}

export class ChannelConfigService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get channel configuration for a guild
   */
  async getGuildChannelConfig(guildId: string): Promise<ChannelConfig | null> {
    return await (this.prisma as any).channelConfig.findUnique({
      where: { guildId }
    });
  }

  /**
   * Update or create channel configuration for a guild
   */
  async updateGuildChannelConfig(
    guildId: string, 
    updates: ChannelConfigUpdateOptions
  ): Promise<ChannelConfig> {
    const existingConfig = await (this.prisma as any).channelConfig.findUnique({
      where: { guildId }
    });

    if (existingConfig) {
      return await (this.prisma as any).channelConfig.update({
        where: { guildId },
        data: updates
      });
    } else {
      return await (this.prisma as any).channelConfig.create({
        data: {
          guildId,
          ...updates
        }
      });
    }
  }

  /**
   * Delete channel configuration for a guild
   */
  async deleteGuildChannelConfig(guildId: string): Promise<void> {
    await (this.prisma as any).channelConfig.delete({
      where: { guildId }
    });
  }

  /**
   * Get the announce channel ID for a guild
   */
  async getAnnounceChannelId(guildId: string): Promise<string | null> {
    const config = await this.getGuildChannelConfig(guildId);
    return config?.announceChannelId || null;
  }

  /**
   * Get the completed channel ID for a guild
   */
  async getCompletedChannelId(guildId: string): Promise<string | null> {
    const config = await this.getGuildChannelConfig(guildId);
    return config?.completedChannelId || null;
  }

  /**
   * Get the admin channel ID for a guild
   */
  async getAdminChannelId(guildId: string): Promise<string | null> {
    const config = await this.getGuildChannelConfig(guildId);
    return config?.adminChannelId || null;
  }
} 