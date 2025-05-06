import { DatabaseService } from '../database/index.js';
import { z } from 'zod';
import { 
    durationStringSchema, 
    turnPatternSchema, 
    returnsSchema 
} from '../utils/zod-schemas.js';
import { ChannelType } from 'discord.js';

/**
 * Input parameters for configuring game settings
 */
export interface GameSettingsInput {
    turnPattern?: string;
    writingTimeout?: string;
    writingWarning?: string;
    drawingTimeout?: string;
    drawingWarning?: string;
    staleTimeout?: string;
    minTurns?: number;
    maxTurns?: number | null;
    returns?: string | null;
}

/**
 * Input parameters for configuring season settings
 */
export interface SeasonSettingsInput {
    openDuration?: string;
    minPlayers?: number;
    maxPlayers?: number | null;
}

/**
 * Input parameters for configuring channel settings
 */
export interface ChannelConfigInput {
    announcementChannelId?: string;
    completedChannelId?: string | null;
    adminChannelId?: string | null;
}

/**
 * Result of validation operation
 */
export interface ValidationResult<T> {
    success: boolean;
    settings?: T;
    errors?: string[];
}

/**
 * Result of configuration operation
 */
export interface ConfigResult<T> {
    success: boolean;
    settings?: T;
    error?: string;
    validationErrors?: string[];
}

/**
 * Service responsible for configuration validation and management
 */
export class ConfigService {
    /**
     * Get server settings
     * 
     * @param serverId - Server ID
     * @param dbService - Database service
     * @returns Server settings or error
     */
    public async getServerSettings(
        serverId: string,
        dbService: DatabaseService
    ): Promise<ConfigResult<any>> {
        try {
            const serverSettings = await dbService.servers.getServerSettings(serverId);
            
            if (!serverSettings) {
                return {
                    success: false,
                    error: 'Server settings not found'
                };
            }
            
            return {
                success: true,
                settings: serverSettings
            };
        } catch (error) {
            console.error('Error getting server settings:', error);
            return {
                success: false,
                error: 'An error occurred while retrieving server settings'
            };
        }
    }
    
    /**
     * Initialize server settings with default values
     * 
     * @param serverId - Server ID
     * @param serverName - Server name
     * @param defaultChannelId - Default channel ID for announcements
     * @param dbService - Database service
     * @returns Result with initialized settings or error
     */
    public async initializeServerSettings(
        serverId: string,
        serverName: string,
        defaultChannelId: string,
        dbService: DatabaseService
    ): Promise<ConfigResult<any>> {
        try {
            const settings = await dbService.servers.initializeServerSettings(
                serverId,
                serverName,
                defaultChannelId
            );
            
            return {
                success: true,
                settings
            };
        } catch (error) {
            console.error('Error initializing server settings:', error);
            return {
                success: false,
                error: 'An error occurred while initializing server settings'
            };
        }
    }
    
    /**
     * Get or initialize server settings
     * 
     * @param serverId - Server ID
     * @param serverName - Server name
     * @param defaultChannelId - Default channel ID for announcements
     * @param dbService - Database service
     * @returns Server settings
     */
    public async getOrInitializeServerSettings(
        serverId: string,
        serverName: string,
        defaultChannelId: string,
        dbService: DatabaseService
    ): Promise<ConfigResult<any>> {
        // Get server
        const server = await dbService.servers.getServer(serverId);
        
        // If server doesn't exist, initialize settings
        if (!server) {
            return this.initializeServerSettings(
                serverId,
                serverName,
                defaultChannelId,
                dbService
            );
        }
        
        // Get settings
        return this.getServerSettings(serverId, dbService);
    }

    /**
     * Update game settings for a server
     * 
     * @param serverId - Server ID
     * @param input - Game settings to update
     * @param dbService - Database service
     * @returns Updated game settings or error
     */
    public async updateGameSettings(
        serverId: string,
        input: GameSettingsInput,
        dbService: DatabaseService
    ): Promise<ConfigResult<GameSettingsInput>> {
        try {
            // Validate input
            const validationResult = this.validateGameSettings(input);
            
            if (!validationResult.success) {
                return {
                    success: false,
                    error: 'Validation failed',
                    validationErrors: validationResult.errors
                };
            }
            
            // Check if server exists and has settings
            const serverSettingsResult = await this.getServerSettings(serverId, dbService);
            
            if (!serverSettingsResult.success) {
                return {
                    success: false,
                    error: 'Server settings not found. Initialize server first.'
                };
            }
            
            // Update game settings
            const updatedSettings = await dbService.servers.updateDefaultGameSettings(
                serverId,
                validationResult.settings!
            );
            
            return {
                success: true,
                settings: updatedSettings
            };
        } catch (error) {
            console.error('Error updating game settings:', error);
            return {
                success: false,
                error: 'An error occurred while updating game settings'
            };
        }
    }
    
    /**
     * Get default game settings for a server
     * 
     * @param serverId - Server ID
     * @param dbService - Database service
     * @returns Game settings or error
     */
    public async getGameSettings(
        serverId: string,
        dbService: DatabaseService
    ): Promise<ConfigResult<GameSettingsInput>> {
        try {
            const gameSettings = await dbService.servers.getDefaultGameSettings(serverId);
            
            if (!gameSettings) {
                return {
                    success: false,
                    error: 'Game settings not found'
                };
            }
            
            return {
                success: true,
                settings: gameSettings
            };
        } catch (error) {
            console.error('Error getting game settings:', error);
            return {
                success: false,
                error: 'An error occurred while retrieving game settings'
            };
        }
    }
    
    /**
     * Update season settings for a server
     * 
     * @param serverId - Server ID
     * @param input - Season settings to update
     * @param dbService - Database service
     * @returns Updated season settings or error
     */
    public async updateSeasonSettings(
        serverId: string,
        input: SeasonSettingsInput,
        dbService: DatabaseService
    ): Promise<ConfigResult<SeasonSettingsInput>> {
        try {
            // Validate input
            const validationResult = this.validateSeasonSettings(input);
            
            if (!validationResult.success) {
                return {
                    success: false,
                    error: 'Validation failed',
                    validationErrors: validationResult.errors
                };
            }
            
            // Check if server exists and has settings
            const serverSettingsResult = await this.getServerSettings(serverId, dbService);
            
            if (!serverSettingsResult.success) {
                return {
                    success: false,
                    error: 'Server settings not found. Initialize server first.'
                };
            }
            
            // Update season settings
            const updatedSettings = await dbService.servers.updateDefaultSeasonSettings(
                serverId,
                validationResult.settings!
            );
            
            return {
                success: true,
                settings: updatedSettings
            };
        } catch (error) {
            console.error('Error updating season settings:', error);
            return {
                success: false,
                error: 'An error occurred while updating season settings'
            };
        }
    }
    
    /**
     * Get default season settings for a server
     * 
     * @param serverId - Server ID
     * @param dbService - Database service
     * @returns Season settings or error
     */
    public async getSeasonSettings(
        serverId: string,
        dbService: DatabaseService
    ): Promise<ConfigResult<SeasonSettingsInput>> {
        try {
            const seasonSettings = await dbService.servers.getDefaultSeasonSettings(serverId);
            
            if (!seasonSettings) {
                return {
                    success: false,
                    error: 'Season settings not found'
                };
            }
            
            return {
                success: true,
                settings: seasonSettings
            };
        } catch (error) {
            console.error('Error getting season settings:', error);
            return {
                success: false,
                error: 'An error occurred while retrieving season settings'
            };
        }
    }
    
    /**
     * Update channel configuration for a server
     * 
     * @param serverId - Server ID
     * @param input - Channel configuration
     * @param guildChannels - Map of guild channels with their types
     * @param dbService - Database service
     * @returns Updated channel configuration or error
     */
    public async updateChannelConfig(
        serverId: string,
        input: ChannelConfigInput,
        guildChannels: Map<string, { type: number }> | null,
        dbService: DatabaseService
    ): Promise<ConfigResult<ChannelConfigInput>> {
        try {
            // Validate input
            const validationResult = this.validateChannelConfig(input, guildChannels);
            
            if (!validationResult.success) {
                return {
                    success: false,
                    error: 'Validation failed',
                    validationErrors: validationResult.errors
                };
            }
            
            // Update channel configuration
            const updatedConfig = await dbService.servers.updateChannelConfig(
                serverId,
                validationResult.settings!
            );
            
            return {
                success: true,
                settings: updatedConfig
            };
        } catch (error) {
            console.error('Error updating channel configuration:', error);
            return {
                success: false,
                error: 'An error occurred while updating channel configuration'
            };
        }
    }

    /**
     * Validates game settings input
     * 
     * @param input Game settings to validate
     * @returns Validation result with settings or errors
     */
    public validateGameSettings(input: GameSettingsInput): ValidationResult<GameSettingsInput> {
        // If no settings provided, return success with empty settings
        if (Object.keys(input).length === 0) {
            return {
                success: true,
                settings: {}
            };
        }

        // Create a Zod schema for validating all game settings
        const gameSettingsSchema = z.object({
            turnPattern: turnPatternSchema.optional(),
            writingTimeout: durationStringSchema.optional(),
            writingWarning: durationStringSchema.optional(),
            drawingTimeout: durationStringSchema.optional(),
            drawingWarning: durationStringSchema.optional(),
            staleTimeout: durationStringSchema.optional(),
            returns: returnsSchema.optional(),
            minTurns: z.number().int().min(4, { message: 'Minimum turns must be at least 4.' }).optional(),
            maxTurns: z.number().int().nullable().optional()
        }).refine(data => {
            // Skip validation if both are undefined
            if (data.minTurns === undefined || data.maxTurns === undefined || data.maxTurns === null) {
                return true;
            }
            return data.maxTurns > data.minTurns;
        }, {
            message: 'Maximum turns must be greater than minimum turns.',
            path: ['maxTurns']
        });
        
        // Validate inputs
        const validationResult = gameSettingsSchema.safeParse(input);
        
        // Handle validation failures
        if (!validationResult.success) {
            const errors = validationResult.error.format();
            const errorMessages: string[] = [];
            
            // Extract error messages
            for (const [key, value] of Object.entries(errors)) {
                if (key === '_errors') continue;
                
                // Add the specific field error
                if (value && typeof value === 'object' && '_errors' in value && Array.isArray(value._errors) && value._errors.length > 0) {
                    let fieldName = key;
                    
                    // Format field names for display
                    switch (key) {
                        case 'turnPattern': fieldName = 'Turn pattern'; break;
                        case 'writingTimeout': fieldName = 'Writing timeout'; break;
                        case 'writingWarning': fieldName = 'Writing warning'; break;
                        case 'drawingTimeout': fieldName = 'Drawing timeout'; break;
                        case 'drawingWarning': fieldName = 'Drawing warning'; break;
                        case 'staleTimeout': fieldName = 'Stale timeout'; break;
                        case 'returns': fieldName = 'Returns'; break;
                        case 'minTurns': fieldName = 'Minimum turns'; break;
                        case 'maxTurns': fieldName = 'Maximum turns'; break;
                    }
                    
                    errorMessages.push(`${fieldName}: ${value._errors.join(', ')}`);
                }
            }
            
            // Add any top-level refinement errors
            if ('_errors' in errors && Array.isArray(errors._errors) && errors._errors.length > 0) {
                errorMessages.push(...errors._errors);
            }
            
            return {
                success: false,
                errors: errorMessages
            };
        }
        
        // Build validated settings object
        const gameSettings: GameSettingsInput = {};
        const validatedData = validationResult.data;
        
        // Add validated values to game settings
        if (validatedData.turnPattern) {
            gameSettings.turnPattern = validatedData.turnPattern;
        }
        
        if (validatedData.writingTimeout) {
            gameSettings.writingTimeout = validatedData.writingTimeout.value;
        }
        
        if (validatedData.writingWarning) {
            gameSettings.writingWarning = validatedData.writingWarning.value;
        }
        
        if (validatedData.drawingTimeout) {
            gameSettings.drawingTimeout = validatedData.drawingTimeout.value;
        }
        
        if (validatedData.drawingWarning) {
            gameSettings.drawingWarning = validatedData.drawingWarning.value;
        }
        
        if (validatedData.staleTimeout) {
            gameSettings.staleTimeout = validatedData.staleTimeout.value;
        }
        
        // Add integer values
        if (validatedData.minTurns !== undefined) {
            gameSettings.minTurns = validatedData.minTurns;
        }
        
        if (validatedData.maxTurns !== undefined) {
            gameSettings.maxTurns = validatedData.maxTurns;
        }
        
        // Handle returns - convert "none" to null
        if (validatedData.returns) {
            gameSettings.returns = validatedData.returns.toLowerCase() === 'none' ? null : validatedData.returns;
        }
        
        return {
            success: true,
            settings: gameSettings
        };
    }

    /**
     * Validates season settings input
     * 
     * @param input Season settings to validate
     * @returns Validation result with settings or errors
     */
    public validateSeasonSettings(input: SeasonSettingsInput): ValidationResult<SeasonSettingsInput> {
        // If no settings provided, return success with empty settings
        if (Object.keys(input).length === 0) {
            return {
                success: true,
                settings: {}
            };
        }

        // Create a Zod schema for validating all season settings
        const seasonSettingsSchema = z.object({
            openDuration: durationStringSchema.optional(),
            minPlayers: z.number().int().min(2, { message: 'Minimum players must be at least 2.' }).optional(),
            maxPlayers: z.number().int().nullable().optional()
        }).refine(data => {
            // Skip validation if both are undefined
            if (data.minPlayers === undefined || data.maxPlayers === undefined || data.maxPlayers === null) {
                return true;
            }
            return data.maxPlayers > data.minPlayers;
        }, {
            message: 'Maximum players must be greater than minimum players.',
            path: ['maxPlayers']
        });
        
        // Validate inputs
        const validationResult = seasonSettingsSchema.safeParse(input);
        
        // Handle validation failures
        if (!validationResult.success) {
            const errors = validationResult.error.format();
            const errorMessages: string[] = [];
            
            // Extract error messages
            for (const [key, value] of Object.entries(errors)) {
                if (key === '_errors') continue;
                
                // Add the specific field error
                if (value && typeof value === 'object' && '_errors' in value && Array.isArray(value._errors) && value._errors.length > 0) {
                    let fieldName = key;
                    
                    // Format field names for display
                    switch (key) {
                        case 'openDuration': fieldName = 'Open duration'; break;
                        case 'minPlayers': fieldName = 'Minimum players'; break;
                        case 'maxPlayers': fieldName = 'Maximum players'; break;
                    }
                    
                    errorMessages.push(`${fieldName}: ${value._errors.join(', ')}`);
                }
            }
            
            // Add any top-level refinement errors
            if ('_errors' in errors && Array.isArray(errors._errors) && errors._errors.length > 0) {
                errorMessages.push(...errors._errors);
            }
            
            return {
                success: false,
                errors: errorMessages
            };
        }
        
        // Build validated settings object
        const seasonSettings: SeasonSettingsInput = {};
        const validatedData = validationResult.data;
        
        // Add validated values to season settings
        if (validatedData.openDuration) {
            seasonSettings.openDuration = validatedData.openDuration.value;
        }
        
        // Add integer values
        if (validatedData.minPlayers !== undefined) {
            seasonSettings.minPlayers = validatedData.minPlayers;
        }
        
        if (validatedData.maxPlayers !== undefined) {
            seasonSettings.maxPlayers = validatedData.maxPlayers;
        }
        
        return {
            success: true,
            settings: seasonSettings
        };
    }

    /**
     * Validates channel configuration input
     * 
     * @param input Channel configuration to validate
     * @returns Validation result with settings or errors
     */
    public validateChannelConfig(
        input: ChannelConfigInput,
        guildChannels: Map<string, { type: number }> | null
    ): ValidationResult<ChannelConfigInput> {
        // If no settings provided, return success with empty settings
        if (Object.keys(input).length === 0) {
            return {
                success: true,
                settings: {}
            };
        }

        // Create a custom validator for channel IDs
        const channelIdValidator = (id: string | null | undefined) => {
            if (id === null || id === undefined) return true;
            
            // If no guild channels provided, we can't validate the channel type
            if (!guildChannels) return true;
            
            const channel = guildChannels.get(id);
            if (!channel) return false;
            
            // Check if channel is a text channel
            return channel.type === ChannelType.GuildText;
        };
        
        // Errors to collect during validation
        const errorMessages: string[] = [];
        
        // Validate announcement channel if provided
        if (input.announcementChannelId && !channelIdValidator(input.announcementChannelId)) {
            errorMessages.push('Announcement Channel: Must be a valid text channel');
        }
        
        // Validate completed channel if provided
        if (input.completedChannelId !== null && input.completedChannelId !== undefined && !channelIdValidator(input.completedChannelId)) {
            errorMessages.push('Completed Channel: Must be a valid text channel');
        }
        
        // Validate admin channel if provided
        if (input.adminChannelId !== null && input.adminChannelId !== undefined && !channelIdValidator(input.adminChannelId)) {
            errorMessages.push('Admin Channel: Must be a valid text channel');
        }
        
        // Return errors if any
        if (errorMessages.length > 0) {
            return {
                success: false,
                errors: errorMessages
            };
        }
        
        // All validation passed
        return {
            success: true,
            settings: { ...input }
        };
    }
} 