import { PrismaClient } from '@prisma/client';
import { ButtonInteraction, CommandInteraction, Client as DiscordClient, Message } from 'discord.js';

import { EventHandler } from './index.js';
import { interpolate, strings } from '../lang/strings.js';  
import { Logger, SeasonTurnService, TurnOfferingService } from '../services/index.js';
import { PlayerService } from '../services/PlayerService.js';
import { SchedulerService } from '../services/SchedulerService.js';
import { ErrorHandler } from '../utils/index.js';
import { ServerContextService } from '../utils/server-context.js';

/**
 * Enum representing the possible context types of a direct message
 */
export enum DMContextType {
    READY_COMMAND = 'READY_COMMAND',
    TURN_SUBMISSION = 'TURN_SUBMISSION',
    SLASH_COMMAND = 'SLASH_COMMAND',
    OTHER = 'OTHER'
}

/**
 * Handler for direct messages sent to the bot.
 * Responsible for identifying the context of the DM and routing it to the appropriate handler.
 * Now supports ephemeral responses when interaction context is available (Task 71.2)
 */
export class DirectMessageHandler implements EventHandler {
    private prisma: PrismaClient;
    private discordClient: DiscordClient;
    private turnService: SeasonTurnService;
    private playerService: PlayerService;
    private schedulerService: SchedulerService;
    private turnOfferingService: TurnOfferingService;
    private serverContextService: ServerContextService;

    constructor(
        prisma: PrismaClient,
        discordClient: DiscordClient,
        turnService: SeasonTurnService,
        playerService: PlayerService,
        schedulerService: SchedulerService,
        turnOfferingService: TurnOfferingService
    ) {
        this.prisma = prisma;
        this.discordClient = discordClient;
        this.turnService = turnService;
        this.playerService = playerService;
        this.schedulerService = schedulerService;
        this.turnOfferingService = turnOfferingService;
        this.serverContextService = new ServerContextService(prisma, discordClient);
    }

    /**
     * Process a direct message and route it to the appropriate handler based on its context.
     * @param msg The direct message to process
     * @param interaction Optional interaction context for ephemeral responses (Task 71.2)
     */
    public async process(msg: Message, interaction?: CommandInteraction | ButtonInteraction): Promise<void> {
        try {
            // Identify the context of the DM
            const contextType = await this.identifyDMContext(msg);
            
            // Route the DM to the appropriate handler based on context
            await this.routeDM(msg, contextType, interaction);
        } catch (error) {
            // Use the new standardized error handler for DMs
            await ErrorHandler.handleDMError(
                error instanceof Error ? error : new Error(String(error)),
                msg,
                { contextType: 'DM_PROCESSING' }
            );
        }
    }

    /**
     * Identify the context of a direct message based on content, sender, etc.
     * @param msg The direct message to identify
     * @returns The identified context type
     */
    private async identifyDMContext(msg: Message): Promise<DMContextType> {
        // Check if the message content appears to be a /ready command
        if (msg.content.toLowerCase().includes('/ready')) {
            return DMContextType.READY_COMMAND;
        }
        
        // Check if the message content appears to be any other slash command
        if (msg.content.trim().startsWith('/') && !msg.content.toLowerCase().includes('/ready')) {
            return DMContextType.SLASH_COMMAND;
        }
        
        // Check if the message has an attachment (potentially a turn submission)
        if (msg.attachments.size > 0) {
            return DMContextType.TURN_SUBMISSION;
        }
        
        // For now, treat any text as a potential turn submission (will be validated later)
        if (msg.content.trim().length > 0) {
            return DMContextType.TURN_SUBMISSION;
        }
        
        // Default case
        return DMContextType.OTHER;
    }

    /**
     * Route a direct message to the appropriate handler based on its context.
     * @param msg The direct message to route
     * @param contextType The identified context type of the message
     * @param interaction Optional interaction context for ephemeral responses (Task 71.2)
     */
    private async routeDM(msg: Message, contextType: DMContextType, interaction?: CommandInteraction | ButtonInteraction): Promise<void> {
        // Log the routing decision for debugging
        Logger.info(`Routing DM from ${msg.author.tag} with context: ${contextType}`);
        
        switch (contextType) {
            case DMContextType.READY_COMMAND:
                await this.handleReadyCommand(msg, interaction);
                break;
            case DMContextType.SLASH_COMMAND:
                await this.handleSlashCommandDM(msg, interaction);
                break;
            case DMContextType.TURN_SUBMISSION:
                await this.handleTurnSubmission(msg, interaction);
                break;
            case DMContextType.OTHER:
                await this.handleOtherDM(msg, interaction);
                break;
        }
    }

    /**
     * Send a message either as ephemeral response (if interaction available) or DM (fallback)
     * @param message The message content to send
     * @param msg The original DM message
     * @param interaction Optional interaction for ephemeral response
     */
    private async sendResponse(message: string, msg: Message, interaction?: CommandInteraction | ButtonInteraction): Promise<void> {
        if (interaction && interaction.guild) {
            // Prefer ephemeral response when interaction context is available (Task 71.2)
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        content: message,
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: message,
                        ephemeral: true
                    });
                }
                return;
            } catch (error) {
                Logger.warn('Failed to send ephemeral response, falling back to DM:', error);
                // Fall through to DM sending
            }
        }
        
        // Fallback to DM
        await msg.author.send(message);
    }

    /**
     * Handle a direct message that appears to be a /ready command.
     * Now redirects users to the in-channel slash command and button-based system (Task 71 Phase 2).
     * @param msg The direct message to handle
     * @param interaction Optional interaction context for ephemeral responses (Task 71.2)
     */
    private async handleReadyCommand(msg: Message, interaction?: CommandInteraction | ButtonInteraction): Promise<void> {
        const wrappedHandler = ErrorHandler.wrapDMHandler(
            async () => {
                Logger.info(`Received DM /ready command from ${msg.author.tag} (${msg.author.id}) - redirecting to slash command system`);
                
                // 1. Find the player by Discord user ID to provide context
                const player = await this.playerService.getPlayerByDiscordId(msg.author.id);
                if (!player) {
                    await this.sendResponse(strings.messages.ready.playerNotFound, msg, interaction);
                    return;
                }

                // 2. Check if player has any offered or pending turns to provide specific guidance
                const [offeredTurns, pendingTurns] = await Promise.all([
                    this.turnService.getTurnsForPlayer(player.id, 'OFFERED'),
                    this.turnService.getTurnsForPlayer(player.id, 'PENDING')
                ]);
                
                // 3. Create appropriate guidance message based on player's turn status
                let readyGuidance: string;
                
                if (pendingTurns.length > 0) {
                    // Player has a pending turn - guide them to submit it
                    const pendingTurn = pendingTurns[0];
                    const serverContext = await this.serverContextService.getTurnServerContext(pendingTurn.id);
                    
                    if (serverContext.channelId && serverContext.guildId) {
                        readyGuidance = `🎨 **You already have a turn to complete!**

👉 **Go to <#${serverContext.channelId}> in ${serverContext.serverName}** and click the **"Submit Turn"** button to complete your turn.

**Your Turn:** #${pendingTurn.turnNumber} (${pendingTurn.type})

_DM-based commands have moved to slash commands and buttons for better privacy and user experience._`;
                    } else if (serverContext.guildId) {
                        readyGuidance = `🎨 **You already have a turn to complete!**

👉 **Go to ${serverContext.serverName}** and click the **"Submit Turn"** button to complete your turn.

**Your Turn:** #${pendingTurn.turnNumber} (${pendingTurn.type})

_DM-based commands have moved to slash commands and buttons for better privacy and user experience._`;
                    } else {
                        readyGuidance = `🎨 **You already have a turn to complete!**

👉 **Go to the game server** and click the **"Submit Turn"** button to complete your turn.

**Your Turn:** #${pendingTurn.turnNumber} (${pendingTurn.type})

_DM-based commands have moved to slash commands and buttons for better privacy and user experience._`;
                    }
                } else if (offeredTurns.length > 0) {
                    // Player has offered turns - guide them to claim via slash command
                    const offeredTurn = offeredTurns[0];
                    const serverContext = await this.serverContextService.getTurnServerContext(offeredTurn.id);
                    
                    if (serverContext.channelId && serverContext.guildId) {
                        readyGuidance = `🎨 **Ready commands have moved to a better system!**

👉 **Go to <#${serverContext.channelId}> in ${serverContext.serverName}** and use \`/ready\` to claim your turn.

**Available Turn:** #${offeredTurn.turnNumber} (${offeredTurn.type})

_DM-based commands have moved to slash commands and buttons for better privacy and user experience._`;
                    } else if (serverContext.guildId) {
                        readyGuidance = `🎨 **Ready commands have moved to a better system!**

👉 **Go to ${serverContext.serverName}** and use \`/ready\` to claim your turn.

**Available Turn:** #${offeredTurn.turnNumber} (${offeredTurn.type})

_DM-based commands have moved to slash commands and buttons for better privacy and user experience._`;
                    } else {
                        readyGuidance = `🎨 **Ready commands have moved to a better system!**

👉 **Go to the game server** and use \`/ready\` to claim your turn.

**Available Turn:** #${offeredTurn.turnNumber} (${offeredTurn.type})

_DM-based commands have moved to slash commands and buttons for better privacy and user experience._`;
                    }
                } else {
                    // No turns available - general guidance
                    readyGuidance = `🎨 **Ready commands have moved to a better system!**

👉 **Use \`/ready\` in a server channel** where the bot is available to check for and claim available turns.

**Current Status:** No turns waiting for you right now.

_DM-based commands have moved to slash commands and buttons for better privacy and user experience._`;
                }
                
                // 4. Send the guidance message
                await this.sendResponse(readyGuidance, msg, interaction);

                Logger.info(`Redirected DM /ready command from player ${player.id} (${msg.author.tag}) to slash command system`);
            },
            msg,
            { dmContextType: DMContextType.READY_COMMAND }
        );
        
        await wrappedHandler();
    }

    /**
     * Handle a direct message that appears to be a slash command (other than /ready).
     * @param msg The direct message to handle
     * @param interaction Optional interaction context for ephemeral responses (Task 71.2)
     */
    private async handleSlashCommandDM(msg: Message, interaction?: CommandInteraction | ButtonInteraction): Promise<void> {
        const wrappedHandler = ErrorHandler.wrapDMHandler(
            async () => {
                Logger.info(`Received slash command in DM from ${msg.author.tag}: ${msg.content}`);
                await this.sendResponse('I only do commands on servers! Please use slash commands in a server channel where I\'m available. Most game interactions now use buttons and ephemeral messages for a better experience.', msg, interaction);
            },
            msg,
            { dmContextType: DMContextType.SLASH_COMMAND }
        );
        
        await wrappedHandler();
    }

    /**
     * Handle a direct message that appears to be a turn submission.
     * Now redirects users to the in-channel modal-based system (Task 71 Phase 2).
     * @param msg The direct message to handle
     * @param interaction Optional interaction context for ephemeral responses (Task 71.2)
     */
    private async handleTurnSubmission(msg: Message, interaction?: CommandInteraction | ButtonInteraction): Promise<void> {
        const wrappedHandler = ErrorHandler.wrapDMHandler(
            async () => {
                Logger.info(`Received DM turn submission from ${msg.author.tag} (${msg.author.id}) - redirecting to modal system`);
                
                // 1. Find the player by Discord user ID
                const player = await this.playerService.getPlayerByDiscordId(msg.author.id);
                if (!player) {
                    await this.sendResponse(interpolate(strings.messages.submission.playerNotFound, { discordUserId: msg.author.id }), msg, interaction);
                    return;
                }

                // 2. Find turns currently PENDING for this player
                const pendingTurns = await this.turnService.getTurnsForPlayer(player.id, 'PENDING');
                
                if (pendingTurns.length === 0) {
                    await this.sendResponse(interpolate(strings.messages.submission.noPendingTurns, { playerName: player.name }), msg, interaction);
                    return;
                }

                // 3. Get the first pending turn (should only be one)
                const turnToSubmit = pendingTurns[0];
                
                // 4. Get server context to direct user to the correct channel
                const serverContext = await this.serverContextService.getTurnServerContext(turnToSubmit.id);
                
                // 5. Determine submission type and create appropriate guidance message
                let submissionGuidance: string;
                
                if (msg.attachments.size > 0) {
                    // Image submission attempt - guide to slash command with file attachment
                    if (serverContext.channelId && serverContext.guildId) {
                        submissionGuidance = `🖼️ **Image submissions have moved to a better system!**

👉 **Go to <#${serverContext.channelId}> in ${serverContext.serverName}** and:
1. Use \`/ready\` to claim your turn (if not already claimed)
2. Click the **"Submit Turn"** button
3. Use the modal form for your submission

For **image submissions**, you can also use slash commands with file attachments in the channel for a smoother experience.

_DM-based submissions are being phased out for better privacy and user experience._`;
                    } else if (serverContext.guildId) {
                        submissionGuidance = `🖼️ **Image submissions have moved to a better system!**

👉 **Go to ${serverContext.serverName}** and:
1. Use \`/ready\` to claim your turn (if not already claimed)
2. Click the **"Submit Turn"** button
3. Use the modal form for your submission

For **image submissions**, you can also use slash commands with file attachments in the channel for a smoother experience.

_DM-based submissions are being phased out for better privacy and user experience._`;
                    } else {
                        submissionGuidance = `🖼️ **Image submissions have moved to a better system!**

👉 **Go to the game server** and:
1. Use \`/ready\` to claim your turn (if not already claimed)
2. Click the **"Submit Turn"** button
3. Use the modal form for your submission

For **image submissions**, you can also use slash commands with file attachments in the channel for a smoother experience.

_DM-based submissions are being phased out for better privacy and user experience._`;
                    }
                } else if (msg.content.trim().length > 0) {
                    // Text submission attempt - guide to modal system
                    if (serverContext.channelId && serverContext.guildId) {
                        submissionGuidance = `✍️ **Text submissions have moved to a better system!**

👉 **Go to <#${serverContext.channelId}> in ${serverContext.serverName}** and:
1. Use \`/ready\` to claim your turn (if not already claimed)
2. Click the **"Submit Turn"** button
3. Use the modal form to enter your text

**Your Turn:** #${turnToSubmit.turnNumber} (${turnToSubmit.type})

_DM-based submissions are being phased out for better privacy and user experience._`;
                    } else if (serverContext.guildId) {
                        submissionGuidance = `✍️ **Text submissions have moved to a better system!**

👉 **Go to ${serverContext.serverName}** and:
1. Use \`/ready\` to claim your turn (if not already claimed)
2. Click the **"Submit Turn"** button
3. Use the modal form to enter your text

**Your Turn:** #${turnToSubmit.turnNumber} (${turnToSubmit.type})

_DM-based submissions are being phased out for better privacy and user experience._`;
                    } else {
                        submissionGuidance = `✍️ **Text submissions have moved to a better system!**

👉 **Go to the game server** and:
1. Use \`/ready\` to claim your turn (if not already claimed)
2. Click the **"Submit Turn"** button
3. Use the modal form to enter your text

**Your Turn:** #${turnToSubmit.turnNumber} (${turnToSubmit.type})

_DM-based submissions are being phased out for better privacy and user experience._`;
                    }
                } else {
                    // No valid content found - general guidance
                    if (serverContext.channelId && serverContext.guildId) {
                        submissionGuidance = `🎨 **Turn submissions have moved to a better system!**

👉 **Go to <#${serverContext.channelId}> in ${serverContext.serverName}** and:
1. Use \`/ready\` to claim your turn (if not already claimed)
2. Click the **"Submit Turn"** button
3. Use the modal form for your submission

**Your Turn:** #${turnToSubmit.turnNumber} (${turnToSubmit.type})

_DM-based submissions are being phased out for better privacy and user experience._`;
                    } else {
                        submissionGuidance = `🎨 **Turn submissions have moved to a better system!**

👉 **Go to the game server** and use \`/ready\` to claim your turn, then click the **"Submit Turn"** button.

**Your Turn:** #${turnToSubmit.turnNumber} (${turnToSubmit.type})

_DM-based submissions are being phased out for better privacy and user experience._`;
                    }
                }
                
                // 6. Send the guidance message
                await this.sendResponse(submissionGuidance, msg, interaction);

                Logger.info(`Redirected DM turn submission from player ${player.id} (${msg.author.tag}) to modal system for turn ${turnToSubmit.id}`);
            },
            msg,
            { dmContextType: DMContextType.TURN_SUBMISSION }
        );
        
        await wrappedHandler();
    }

    /**
     * Handle a direct message that doesn't match any known context.
     * @param msg The direct message to handle
     * @param interaction Optional interaction context for ephemeral responses (Task 71.2)
     */
    private async handleOtherDM(msg: Message, interaction?: CommandInteraction | ButtonInteraction): Promise<void> {
        const wrappedHandler = ErrorHandler.wrapDMHandler(
            async () => {
                // This is a placeholder implementation
                Logger.info(`Received unrecognized DM from ${msg.author.tag}`);
                await this.sendResponse('I\'m not sure what you\'re trying to do. If you\'re trying to join a game or check your status, please use the slash commands in a server channel where I\'m available. Most interactions now use buttons and ephemeral messages for better privacy and user experience.', msg, interaction);
            },
            msg,
            { dmContextType: DMContextType.OTHER }
        );
        
        await wrappedHandler();
    }
} 