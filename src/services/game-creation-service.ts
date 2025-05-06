import { DatabaseService } from '../database/index.js';
import { GameSettingsInput } from '../database/game-service.js';
import { z } from 'zod';
import { 
    durationStringSchema, 
    turnPatternSchema, 
    returnsSchema 
} from '../utils/zod-schemas.js';

/**
 * Parameters for creating a game
 */
export interface CreateGameParams {
    serverId: string;
    userId: string;
    turnPattern?: string;
    writingTimeout?: string;
    drawingTimeout?: string;
    minTurns?: number;
    maxTurns?: number | null;
    returns?: string | null;
}

/**
 * Result of a game creation attempt
 */
export interface GameCreationResult {
    success: boolean;
    gameId?: string;
    customSettings?: GameSettingsInput;
    error?: string;
    validationErrors?: string[];
}

/**
 * Service responsible for game creation logic
 */
export class GameCreationService {
    /**
     * Creates a new game with the provided parameters
     * 
     * @param params - Parameters for creating the game
     * @param dbService - Database service for database operations
     * @returns Result of the game creation attempt
     */
    public async createGame(
        params: CreateGameParams,
        dbService: DatabaseService
    ): Promise<GameCreationResult> {
        try {
            // Ensure user exists in database
            await dbService.players.ensurePlayer(params.userId);
            
            // Get server information
            const server = await dbService.servers.getServer(params.serverId);
            
            // If server doesn't exist in DB yet
            if (!server) {
                return {
                    success: false,
                    error: 'Server needs to be set up first.'
                };
            }
            
            // Get default game settings
            const defaultGameSettings = await dbService.games.getDefaultGameSettings(params.serverId);
            
            if (!defaultGameSettings) {
                return {
                    success: false,
                    error: 'Server game settings haven\'t been configured.'
                };
            }
            
            // Validate and build custom settings
            const validationResult = this.validateSettings(params);
            
            if (!validationResult.success) {
                return {
                    success: false,
                    error: 'Validation failed',
                    validationErrors: validationResult.errors
                };
            }
            
            // Use the validated settings
            const customSettings = validationResult.settings;
            
            // Create a new game with custom settings if provided
            const game = await dbService.games.createGame(
                params.serverId,
                params.userId,
                defaultGameSettings.id,
                Object.keys(customSettings).length > 0 ? customSettings : undefined
            );
            
            return {
                success: true,
                gameId: game.id,
                customSettings: Object.keys(customSettings).length > 0 ? customSettings : undefined
            };
            
        } catch (error) {
            console.error('Error in GameCreationService:', error);
            return {
                success: false,
                error: 'An error occurred while creating a new game.'
            };
        }
    }
    
    /**
     * Validate game settings using Zod
     * 
     * @param params - Parameters to validate
     * @returns Validation result with settings or errors
     */
    private validateSettings(params: CreateGameParams): { 
        success: boolean; 
        settings: GameSettingsInput;
        errors?: string[];
    } {
        // Create input object with only the settings properties
        const input: Record<string, any> = {};
        
        if (params.turnPattern) input.turnPattern = params.turnPattern;
        if (params.writingTimeout) input.writingTimeout = params.writingTimeout;
        if (params.drawingTimeout) input.drawingTimeout = params.drawingTimeout;
        if (params.returns) input.returns = params.returns;
        if (params.minTurns !== undefined) input.minTurns = params.minTurns;
        if (params.maxTurns !== undefined) input.maxTurns = params.maxTurns;
        
        // If no custom settings provided, return empty settings
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
            drawingTimeout: durationStringSchema.optional(),
            returns: returnsSchema.optional(),
            minTurns: z.number().int().min(4, { message: 'Minimum turns must be at least 4.' }).optional(),
            maxTurns: z.number().int().optional()
        }).refine(data => {
            // Skip validation if both are undefined
            if (data.minTurns === undefined || data.maxTurns === undefined) {
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
                        case 'drawingTimeout': fieldName = 'Drawing timeout'; break;
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
                settings: {},
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
        
        if (validatedData.drawingTimeout) {
            gameSettings.drawingTimeout = validatedData.drawingTimeout.value;
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
} 