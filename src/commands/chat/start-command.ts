import { ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';
import { z } from 'zod';

import { DatabaseService } from '../../database/index.js';
import { GameSettingsInput } from '../../database/game-service.js';
import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { Lang, Logger } from '../../services/index.js';
import { 
    InteractionUtils, 
    formatReturnsForDisplay, 
    durationStringSchema, 
    turnPatternSchema, 
    returnsSchema,
    DurationUtils
} from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

export class StartCommand implements Command {
    public names = [Lang.getRef('chatCommands.start', Language.Default)];
    public cooldown = new RateLimiter(1, 5000);
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = [];
    
    private dbService: DatabaseService;

    constructor() {
        this.dbService = new DatabaseService();
    }

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        // Can only be used in a server
        if (!intr.guild) {
            await InteractionUtils.send(
                intr, 
                'This command can only be used in a server.'
            );
            return;
        }
        
        try {
            // Ensure user exists in database
            await this.dbService.players.ensurePlayer(intr.user.id);
            
            // Get server information
            const server = await this.dbService.servers.getServer(intr.guild.id);
            
            // If server doesn't exist in DB yet
            if (!server) {
                await InteractionUtils.send(
                    intr, 
                    'Server needs to be set up first. Please contact an administrator.'
                );
                return;
            }
            
            // Get default game settings
            const defaultGameSettings = await this.dbService.games.getDefaultGameSettings(intr.guild.id);
            
            if (!defaultGameSettings) {
                await InteractionUtils.send(
                    intr,
                    'Server game settings haven\'t been configured. Please contact an administrator.'
                );
                return;
            }
            
            // Extract custom parameters from interaction
            const customSettings = await this.extractCustomGameSettings(intr);
            
            // If validation failed and message was sent, return
            if (!customSettings && intr.replied) {
                return;
            }
            
            // Create a new game with custom settings if provided
            const game = await this.dbService.games.createGame(
                intr.guild.id,
                intr.user.id,
                defaultGameSettings.id,
                customSettings || undefined
            );
            
            // Build success message
            let successMessage = `✅ New game created! Game ID: ${game.id}\nThe game is currently in setup mode. Use /join to join this game.`;
            
            // Add custom settings summary if provided
            if (customSettings && Object.keys(customSettings).length > 0) {
                successMessage += '\n\n**Custom Game Settings:**\n';
                
                // Add each custom setting to the message
                if (customSettings.turnPattern) {
                    const turnPatternDisplay = customSettings.turnPattern === 'drawing,writing' ? 
                        'Drawing → Writing' : 'Writing → Drawing';
                    successMessage += `• Turn Pattern: ${turnPatternDisplay}\n`;
                }
                
                if (customSettings.writingTimeout) {
                    successMessage += `• Writing Timeout: ${customSettings.writingTimeout}\n`;
                }
                
                if (customSettings.drawingTimeout) {
                    successMessage += `• Drawing Timeout: ${customSettings.drawingTimeout}\n`;
                }
                
                if (customSettings.minTurns) {
                    successMessage += `• Minimum Turns: ${customSettings.minTurns}\n`;
                }
                
                if (customSettings.maxTurns !== undefined) {
                    successMessage += `• Maximum Turns: ${customSettings.maxTurns || 'No limit'}\n`;
                }
                
                if (customSettings.returns !== undefined) {
                    successMessage += `• Returns Policy: ${formatReturnsForDisplay(customSettings.returns)}\n`;
                }
            }
            
            await InteractionUtils.send(intr, successMessage);
            
        } catch (error) {
            await InteractionUtils.send(
                intr,
                'An error occurred while creating a new game. Please try again later.'
            );
            console.error('Error in StartCommand:', error);
        }
    }
    
    /**
     * Extract and validate custom game settings from the interaction
     * @param intr - Chat input interaction
     * @returns Validated custom settings or null if validation failed
     */
    private async extractCustomGameSettings(intr: ChatInputCommandInteraction): Promise<GameSettingsInput | null> {
        // Get game settings options
        const turnPattern = intr.options.getString('turn_pattern');
        const writingTimeout = intr.options.getString('writing_timeout');
        const drawingTimeout = intr.options.getString('drawing_timeout');
        const minTurns = intr.options.getInteger('min_turns');
        const maxTurns = intr.options.getInteger('max_turns');
        const returns = intr.options.getString('returns');
        
        // If no options were provided, return null (use defaults)
        if (!turnPattern && !writingTimeout && !drawingTimeout && 
            minTurns === null && maxTurns === null && !returns) {
            return null;
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
        
        // Create an input object from the command options
        const input: Record<string, any> = {};
        
        if (turnPattern) input.turnPattern = turnPattern;
        if (writingTimeout) input.writingTimeout = writingTimeout;
        if (drawingTimeout) input.drawingTimeout = drawingTimeout;
        if (returns) input.returns = returns;
        if (minTurns !== null) input.minTurns = minTurns;
        if (maxTurns !== null) input.maxTurns = maxTurns;
        
        // Validate all inputs with Zod
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
            
            await InteractionUtils.send(
                intr,
                `❌ Validation failed:\n${errorMessages.map(error => `• ${error}`).join('\n')}`
            );
            return null;
        }
        
        // At this point validation has passed
        // Prepare game settings update
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
        
        return gameSettings;
    }
} 