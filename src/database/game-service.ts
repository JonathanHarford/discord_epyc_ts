import { PrismaClient } from '../../prisma/generated/index.js';
import { generateUniqueId } from './utils.js';

/**
 * Game settings interface
 */
export interface GameSettingsInput {
    turnPattern?: string;
    returns?: string | null;
    writingTimeout?: string;
    writingWarning?: string;
    drawingTimeout?: string;
    drawingWarning?: string;
    staleTimeout?: string;
    minTurns?: number;
    maxTurns?: number | null;
}

/**
 * Service for game-related database operations
 */
export class GameService {
    constructor(private prisma: PrismaClient) {}

    /**
     * Create a new game
     */
    public async createGame(
        serverId: string, 
        creatorId: string, 
        settingsId: string,
        customSettings?: GameSettingsInput
    ): Promise<any> {
        try {
            // If custom settings are provided, create a new game settings record
            let finalSettingsId = settingsId;
            
            if (customSettings && Object.keys(customSettings).length > 0) {
                const newSettings = await this.createCustomGameSettings(serverId, customSettings);
                finalSettingsId = newSettings.id;
            }
            
            return await this.prisma.game.create({
                data: {
                    id: generateUniqueId(),
                    serverId,
                    creatorId,
                    settingsId: finalSettingsId,
                    status: 'setup',
                },
            });
        } catch (error) {
            console.error('Error creating game:', error);
            throw error;
        }
    }

    /**
     * Create custom game settings based on provided options
     */
    private async createCustomGameSettings(
        serverId: string,
        customSettings: GameSettingsInput
    ): Promise<any> {
        try {
            // Generate a unique ID for the custom settings
            const customSettingsId = `${serverId}-custom-${generateUniqueId()}`;
            
            // Get default settings to use as a base
            const defaultSettings = await this.getDefaultGameSettings(serverId);
            
            if (!defaultSettings) {
                throw new Error(`Default game settings not found for server ID ${serverId}`);
            }
            
            // Create new settings with defaults merged with custom settings
            return await this.prisma.gameSettings.create({
                data: {
                    id: customSettingsId,
                    turnPattern: customSettings.turnPattern ?? defaultSettings.turnPattern,
                    returns: customSettings.returns ?? defaultSettings.returns,
                    writingTimeout: customSettings.writingTimeout ?? defaultSettings.writingTimeout,
                    writingWarning: customSettings.writingWarning ?? defaultSettings.writingWarning,
                    drawingTimeout: customSettings.drawingTimeout ?? defaultSettings.drawingTimeout,
                    drawingWarning: customSettings.drawingWarning ?? defaultSettings.drawingWarning,
                    staleTimeout: customSettings.staleTimeout ?? defaultSettings.staleTimeout,
                    minTurns: customSettings.minTurns ?? defaultSettings.minTurns,
                    maxTurns: customSettings.maxTurns ?? defaultSettings.maxTurns,
                }
            });
        } catch (error) {
            console.error('Error creating custom game settings:', error);
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