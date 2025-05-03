import { ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';

import { DatabaseService } from '../../database/index.js';
import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { Lang } from '../../services/index.js';
import { InteractionUtils } from '../../utils/index.js';
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
            const gameSettings = await this.dbService.games.getDefaultGameSettings(intr.guild.id);
            
            if (!gameSettings) {
                await InteractionUtils.send(
                    intr,
                    'Server game settings haven\'t been configured. Please contact an administrator.'
                );
                return;
            }
            
            // Create a new game
            const game = await this.dbService.games.createGame(
                intr.guild.id,
                intr.user.id,
                gameSettings.id
            );
            
            await InteractionUtils.send(
                intr,
                `✅ New game created! Game ID: ${game.id}\nThe game is currently in setup mode. Use /join to join this game.`
            );
            
        } catch (error) {
            await InteractionUtils.send(
                intr,
                'An error occurred while creating a new game. Please try again later.'
            );
            console.error('Error in StartCommand:', error);
        }
    }
} 