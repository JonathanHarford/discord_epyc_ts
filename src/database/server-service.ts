import { PrismaClient } from '../../prisma/generated/index.js';

/**
 * Service for server-related database operations
 */
export class ServerService {
    constructor(private prisma: PrismaClient) {}

    /**
     * Get server information
     */
    public async getServer(serverId: string): Promise<any> {
        try {
            return await this.prisma.server.findUnique({
                where: { id: serverId },
            });
        } catch (error) {
            console.error('Error getting server:', error);
            throw error;
        }
    }

    /**
     * Get server settings
     */
    public async getServerSettings(serverId: string): Promise<any> {
        try {
            return await this.prisma.serverSettings.findUnique({
                where: { id: serverId },
            });
        } catch (error) {
            console.error('Error getting server settings:', error);
            throw error;
        }
    }

    /**
     * Update server channel configurations
     * @param serverId - Server ID
     * @param channelConfig - Channel configuration object
     * @returns Updated server settings
     */
    public async updateChannelConfig(
        serverId: string, 
        channelConfig: {
            announcementChannelId?: string;
            completedChannelId?: string | null;
            adminChannelId?: string | null;
        }
    ): Promise<any> {
        try {
            // Get current settings to preserve other values
            const currentSettings = await this.getServerSettings(serverId);
            
            // Update settings
            return await this.prisma.serverSettings.update({
                where: { id: serverId },
                data: {
                    ...channelConfig
                },
            });
        } catch (error) {
            console.error('Error updating server channel config:', error);
            throw error;
        }
    }

    /**
     * Initialize server settings with default values if they don't exist
     * @param serverId - Server ID
     * @param serverName - Server name
     * @param defaultChannelId - Default channel ID to use for announcements
     * @returns Created server and settings
     */
    public async initializeServerSettings(
        serverId: string,
        serverName: string,
        defaultChannelId: string
    ): Promise<any> {
        try {
            // Create default game settings
            const defaultGameSettings = await this.prisma.gameSettings.create({
                data: {
                    id: `${serverId}-default-game`,
                    turnPattern: "drawing,writing",
                    writingTimeout: "1d",
                    writingWarning: "1m",
                    drawingTimeout: "1d",
                    drawingWarning: "10m",
                    staleTimeout: "7d",
                    minTurns: 6
                }
            });

            // Create default season settings
            const defaultSeasonSettings = await this.prisma.seasonSettings.create({
                data: {
                    id: `${serverId}-default-season`,
                    openDuration: "7d",
                    minPlayers: 2
                }
            });

            // Create or update server
            const server = await this.prisma.server.upsert({
                where: { id: serverId },
                update: { name: serverName },
                create: {
                    id: serverId,
                    name: serverName
                }
            });

            // Create server settings
            return await this.prisma.serverSettings.create({
                data: {
                    id: serverId,
                    announcementChannelId: defaultChannelId,
                    defaultGameSettingsId: defaultGameSettings.id,
                    defaultSeasonSettingsId: defaultSeasonSettings.id
                }
            });
        } catch (error) {
            console.error('Error initializing server settings:', error);
            throw error;
        }
    }
} 