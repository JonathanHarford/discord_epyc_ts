import { PrismaClient } from '../../prisma/generated/index.js';
import { generateUniqueId } from './utils.js';

/**
 * Service for game-related database operations
 */
export class GameService {
    constructor(private prisma: PrismaClient) {}

    /**
     * Create a new game
     */
    public async createGame(serverId: string, creatorId: string, settingsId: string): Promise<any> {
        try {
            return await this.prisma.game.create({
                data: {
                    id: generateUniqueId(),
                    serverId,
                    creatorId,
                    settingsId,
                    status: 'setup',
                },
            });
        } catch (error) {
            console.error('Error creating game:', error);
            throw error;
        }
    }

    /**
     * Get default game settings for a server
     */
    public async getDefaultGameSettings(serverId: string): Promise<any> {
        try {
            const serverSettings = await this.prisma.serverSettings.findUnique({
                where: { id: serverId },
                include: { defaultGameSettings: true },
            });

            return serverSettings?.defaultGameSettings;
        } catch (error) {
            console.error('Error getting default game settings:', error);
            throw error;
        }
    }
} 