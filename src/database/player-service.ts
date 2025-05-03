import { PrismaClient } from '../../prisma/generated/index.js';

/**
 * Service for player-related database operations
 */
export class PlayerService {
    constructor(private prisma: PrismaClient) {}

    /**
     * Ensure a user record exists in the database
     */
    public async ensureUser(userId: string): Promise<any> {
        try {
            return await this.prisma.user.upsert({
                where: { id: userId },
                update: {},
                create: { id: userId },
            });
        } catch (error) {
            console.error('Error ensuring user exists:', error);
            throw error;
        }
    }

    /**
     * Ensure a player record exists in the database
     */
    public async ensurePlayer(userId: string): Promise<any> {
        try {
            await this.ensureUser(userId);
            
            return await this.prisma.player.upsert({
                where: { id: userId },
                update: {},
                create: { id: userId },
            });
        } catch (error) {
            console.error('Error ensuring player exists:', error);
            throw error;
        }
    }
} 