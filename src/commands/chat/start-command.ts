import { ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';

import { DatabaseService } from '../../database/index.js';
import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { 
    GameCreationService,
    Lang, 
    Logger 
} from '../../services/index.js';
import { 
    InteractionUtils, 
    formatReturnsForDisplay
} from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

export class StartCommand implements Command {
    public names = [Lang.getRef('chatCommands.start', Language.Default)];
    public cooldown = new RateLimiter(1, 5000);
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = [];
    
    private dbService: DatabaseService;
    private gameCreationService: GameCreationService;

    constructor() {
        this.dbService = new DatabaseService();
        this.gameCreationService = new GameCreationService();
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
            // Extract parameters from interaction
            const params = {
                serverId: intr.guild.id,
                userId: intr.user.id,
                turnPattern: intr.options.getString('turn_pattern') || undefined,
                writingTimeout: intr.options.getString('writing_timeout') || undefined,
                drawingTimeout: intr.options.getString('drawing_timeout') || undefined,
                minTurns: intr.options.getInteger('min_turns') ?? undefined,
                maxTurns: intr.options.getInteger('max_turns') ?? undefined,
                returns: intr.options.getString('returns') || undefined
            };

            // Use the service to create the game
            const result = await this.gameCreationService.createGame(params, this.dbService);
            
            if (!result.success) {
                // Handle validation errors specially
                if (result.validationErrors && result.validationErrors.length > 0) {
                    await InteractionUtils.send(
                        intr,
                        `❌ Validation failed:\n${result.validationErrors.map(error => `• ${error}`).join('\n')}`
                    );
                    return;
                }
                
                // Handle other errors
                await InteractionUtils.send(intr, `❌ ${result.error}`);
                return;
            }
            
            // Build success message
            let successMessage = `✅ New game created! Game ID: ${result.gameId}\nThe game is currently in setup mode. Use /join to join this game.`;
            
            // Add custom settings summary if provided
            if (result.customSettings && Object.keys(result.customSettings).length > 0) {
                successMessage += '\n\n**Custom Game Settings:**\n';
                
                // Add each custom setting to the message
                if (result.customSettings.turnPattern) {
                    const turnPatternDisplay = result.customSettings.turnPattern === 'drawing,writing' ? 
                        'Drawing → Writing' : 'Writing → Drawing';
                    successMessage += `• Turn Pattern: ${turnPatternDisplay}\n`;
                }
                
                if (result.customSettings.writingTimeout) {
                    successMessage += `• Writing Timeout: ${result.customSettings.writingTimeout}\n`;
                }
                
                if (result.customSettings.drawingTimeout) {
                    successMessage += `• Drawing Timeout: ${result.customSettings.drawingTimeout}\n`;
                }
                
                if (result.customSettings.minTurns) {
                    successMessage += `• Minimum Turns: ${result.customSettings.minTurns}\n`;
                }
                
                if (result.customSettings.maxTurns !== undefined) {
                    successMessage += `• Maximum Turns: ${result.customSettings.maxTurns || 'No limit'}\n`;
                }
                
                if (result.customSettings.returns !== undefined) {
                    successMessage += `• Returns Policy: ${formatReturnsForDisplay(result.customSettings.returns)}\n`;
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
} 