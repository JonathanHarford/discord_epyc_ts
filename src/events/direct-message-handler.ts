import { Message } from 'discord.js';
import { createRequire } from 'node:module';
import { EventHandler } from './index.js';
import { Logger } from '../services/index.js';
import { ErrorHandler } from '../utils/index.js';

const require = createRequire(import.meta.url);
let Logs = require('../../lang/logs.json');

/**
 * Enum representing the possible context types of a direct message
 */
export enum DMContextType {
    READY_COMMAND = 'READY_COMMAND',
    TURN_SUBMISSION = 'TURN_SUBMISSION',
    OTHER = 'OTHER'
}

/**
 * Handler for direct messages sent to the bot.
 * Responsible for identifying the context of the DM and routing it to the appropriate handler.
 */
export class DirectMessageHandler implements EventHandler {
    constructor() {}

    /**
     * Process a direct message and route it to the appropriate handler based on its context.
     * @param msg The direct message to process
     */
    public async process(msg: Message): Promise<void> {
        try {
            // Identify the context of the DM
            const contextType = await this.identifyDMContext(msg);
            
            // Route the DM to the appropriate handler based on context
            await this.routeDM(msg, contextType);
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
     */
    private async routeDM(msg: Message, contextType: DMContextType): Promise<void> {
        // Log the routing decision for debugging
        Logger.info(`Routing DM from ${msg.author.tag} with context: ${contextType}`);
        
        switch (contextType) {
            case DMContextType.READY_COMMAND:
                await this.handleReadyCommand(msg);
                break;
            case DMContextType.TURN_SUBMISSION:
                await this.handleTurnSubmission(msg);
                break;
            case DMContextType.OTHER:
                await this.handleOtherDM(msg);
                break;
        }
    }

    /**
     * Handle a direct message that appears to be a /ready command.
     * @param msg The direct message to handle
     */
    private async handleReadyCommand(msg: Message): Promise<void> {
        const wrappedHandler = ErrorHandler.wrapDMHandler(
            async () => {
                // This is a placeholder implementation
                // Actual implementation will be added in a future task
                Logger.info(`Received /ready command from ${msg.author.tag}`);
                await msg.reply('Ready command received. This feature is not fully implemented yet.');
            },
            msg,
            { dmContextType: DMContextType.READY_COMMAND }
        );
        
        await wrappedHandler();
    }

    /**
     * Handle a direct message that appears to be a turn submission.
     * @param msg The direct message to handle
     */
    private async handleTurnSubmission(msg: Message): Promise<void> {
        const wrappedHandler = ErrorHandler.wrapDMHandler(
            async () => {
                // This is a placeholder implementation
                // Actual implementation will be added in a future task
                Logger.info(`Received potential turn submission from ${msg.author.tag}`);
                await msg.reply('Turn submission received. This feature is not fully implemented yet.');
            },
            msg,
            { dmContextType: DMContextType.TURN_SUBMISSION }
        );
        
        await wrappedHandler();
    }

    /**
     * Handle a direct message that doesn't match any known context.
     * @param msg The direct message to handle
     */
    private async handleOtherDM(msg: Message): Promise<void> {
        const wrappedHandler = ErrorHandler.wrapDMHandler(
            async () => {
                // This is a placeholder implementation
                Logger.info(`Received unrecognized DM from ${msg.author.tag}`);
                await msg.reply("I'm not sure what you're trying to do. If you're trying to join a game, please use the appropriate commands in a server channel.");
            },
            msg,
            { dmContextType: DMContextType.OTHER }
        );
        
        await wrappedHandler();
    }
} 