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
} 