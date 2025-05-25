import { PrismaClient } from '@prisma/client';
import { Client as DiscordClient, Message } from 'discord.js';
import { createRequire } from 'node:module';
import { EventHandler } from './index.js';
import { Logger } from '../services/index.js';
import { ErrorHandler } from '../utils/index.js';
import { TurnService } from '../services/TurnService.js';
import { PlayerService } from '../services/PlayerService.js';
import { SchedulerService } from '../services/SchedulerService.js';
import { TurnOfferingService } from '../services/TurnOfferingService.js';
import { SimpleMessage } from '../messaging/SimpleMessage.js';
import { strings, interpolate } from '../lang/strings.js';
import { getSeasonTimeouts } from '../utils/seasonConfig.js';

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
    private prisma: PrismaClient;
    private discordClient: DiscordClient;
    private turnService: TurnService;
    private playerService: PlayerService;
    private schedulerService: SchedulerService;
    private turnOfferingService: TurnOfferingService;

    constructor(
        prisma: PrismaClient,
        discordClient: DiscordClient,
        turnService: TurnService,
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
    }

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
                Logger.info(`Processing /ready command from ${msg.author.tag} (${msg.author.id})`);
                
                // 1. Find the player by Discord user ID
                const player = await this.playerService.getPlayerByDiscordId(msg.author.id);
                if (!player) {
                    await msg.author.send(strings.messages.ready.playerNotFound);
                    return;
                }

                // 2. Find turns currently OFFERED to this player
                const offeredTurns = await this.turnService.getTurnsForPlayer(player.id, 'OFFERED');
                
                if (offeredTurns.length === 0) {
                    await msg.author.send(strings.messages.ready.noOfferedTurns);
                    return;
                }

                // 3. Check if player already has a PENDING turn (can't claim multiple)
                const pendingTurns = await this.turnService.getTurnsForPlayer(player.id, 'PENDING');
                if (pendingTurns.length > 0) {
                    await msg.author.send(strings.messages.ready.alreadyHasPendingTurn);
                    return;
                }

                // 4. If multiple turns are offered, claim the first one (oldest)
                const turnToClaim = offeredTurns[0];
                
                // 5. Claim the turn using TurnService
                const claimResult = await this.turnService.claimTurn(turnToClaim.id, player.id);
                
                if (!claimResult.success) {
                    await msg.author.send(strings.messages.ready.claimFailed);
                    return;
                }

                // 6. Cancel the claim timeout timer for this turn
                const claimTimeoutJobId = `turn-claim-timeout-${turnToClaim.id}`;
                const timeoutCancelled = await this.schedulerService.cancelJob(claimTimeoutJobId);
                if (timeoutCancelled) {
                    Logger.info(`Cancelled claim timeout job ${claimTimeoutJobId} for turn ${turnToClaim.id}`);
                } else {
                    Logger.warn(`No claim timeout job found to cancel for turn ${turnToClaim.id}`);
                }

                // 7. Schedule submission timeout timer based on turn type
                // Get season-specific timeout values
                const timeouts = await getSeasonTimeouts(this.prisma, turnToClaim.id);
                const submissionTimeoutMinutes = turnToClaim.type === 'WRITING' 
                    ? timeouts.writingTimeoutMinutes 
                    : timeouts.drawingTimeoutMinutes;
                const submissionTimeoutDate = new Date(Date.now() + submissionTimeoutMinutes * 60 * 1000);
                
                const submissionTimeoutJobId = `turn-submission-timeout-${turnToClaim.id}`;
                const submissionJobScheduled = await this.schedulerService.scheduleJob(
                    submissionTimeoutJobId,
                    submissionTimeoutDate,
                    async (jobData) => {
                        Logger.info(`Submission timeout triggered for turn ${turnToClaim.id}`);
                        
                        // Import and create the SubmissionTimeoutHandler
                        const { SubmissionTimeoutHandler } = await import('../handlers/SubmissionTimeoutHandler.js');
                        const submissionTimeoutHandler = new SubmissionTimeoutHandler(
                            this.prisma,
                            this.discordClient,
                            this.turnService,
                            this.turnOfferingService
                        );

                        // Execute the submission timeout handling
                        const result = await submissionTimeoutHandler.handleSubmissionTimeout(turnToClaim.id, player.id);

                        if (!result.success) {
                            throw new Error(`Submission timeout handling failed: ${result.error}`);
                        }

                        Logger.info(`Submission timeout handling completed successfully for turn ${turnToClaim.id}`);
                    },
                    { turnId: turnToClaim.id, playerId: player.id },
                    'turn-submission-timeout'
                );

                if (submissionJobScheduled) {
                    Logger.info(`Scheduled submission timeout for turn ${turnToClaim.id} at ${submissionTimeoutDate.toISOString()}`);
                } else {
                    Logger.warn(`Failed to schedule submission timeout for turn ${turnToClaim.id}`);
                }

                // 8. Send confirmation DM to the player
                const successMessage = interpolate(strings.messages.ready.claimSuccess, {
                    gameId: turnToClaim.gameId,
                    seasonId: (turnToClaim as any).game?.season?.id,
                    turnNumber: turnToClaim.turnNumber,
                    turnType: turnToClaim.type
                });
                await msg.author.send(successMessage);

                Logger.info(`Successfully processed /ready command for player ${player.id} (${msg.author.tag}), claimed turn ${turnToClaim.id}`);
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
                Logger.info(`Processing turn submission from ${msg.author.tag} (${msg.author.id})`);
                
                // 1. Find the player by Discord user ID
                const player = await this.playerService.getPlayerByDiscordId(msg.author.id);
                if (!player) {
                    await msg.author.send(interpolate(strings.messages.submission.playerNotFound, { discordUserId: msg.author.id }));
                    return;
                }

                // 2. Find turns currently PENDING for this player
                const pendingTurns = await this.turnService.getTurnsForPlayer(player.id, 'PENDING');
                
                if (pendingTurns.length === 0) {
                    await msg.author.send(interpolate(strings.messages.submission.noPendingTurns, { playerName: player.name }));
                    return;
                }

                // 3. Get the first pending turn (should only be one)
                const turnToSubmit = pendingTurns[0];
                
                // 4. Determine content type and extract content
                let content: string;
                let contentType: 'text' | 'image';
                
                if (msg.attachments.size > 0) {
                    // Handle image submission
                    const attachment = msg.attachments.first();
                    if (!attachment) {
                        await msg.author.send(strings.messages.submission.noAttachmentFound);
                        return;
                    }
                    
                    // Validate that it's an image
                    if (!attachment.contentType?.startsWith('image/')) {
                        await msg.author.send(interpolate(strings.messages.submission.invalidFileType, { fileType: attachment.contentType || 'unknown' }));
                        return;
                    }
                    
                    content = attachment.url;
                    contentType = 'image';
                } else if (msg.content.trim().length > 0) {
                    // Handle text submission
                    content = msg.content.trim();
                    contentType = 'text';
                } else {
                    // No valid content found
                    await msg.author.send(strings.messages.submission.noContentFound);
                    return;
                }

                // 5. Validate content type matches turn type
                if ((turnToSubmit.type === 'WRITING' && contentType !== 'text') ||
                    (turnToSubmit.type === 'DRAWING' && contentType !== 'image')) {
                    await msg.author.send(interpolate(strings.messages.submission.wrongContentType, { 
                        expectedType: turnToSubmit.type === 'WRITING' ? 'text' : 'image',
                        receivedType: contentType,
                        turnType: turnToSubmit.type
                    }));
                    return;
                }

                // 6. Submit the turn using TurnService
                const submitResult = await this.turnService.submitTurn(
                    turnToSubmit.id,
                    player.id,
                    content,
                    contentType
                );
                
                if (!submitResult.success) {
                    await msg.author.send(interpolate(strings.messages.submission.submitFailed, { 
                        error: submitResult.error,
                        turnId: turnToSubmit.id
                    }));
                    return;
                }

                // 7. Cancel the submission timeout timer for this turn
                const submissionTimeoutJobId = `turn-submission-timeout-${turnToSubmit.id}`;
                const timeoutCancelled = await this.schedulerService.cancelJob(submissionTimeoutJobId);
                if (timeoutCancelled) {
                    Logger.info(`Cancelled submission timeout job ${submissionTimeoutJobId} for turn ${turnToSubmit.id}`);
                } else {
                    Logger.warn(`No submission timeout job found to cancel for turn ${turnToSubmit.id}`);
                }

                // 8. Trigger the turn offering mechanism to find and offer the next turn
                try {
                    const offeringResult = await this.turnOfferingService.offerNextTurn(
                        turnToSubmit.gameId,
                        'turn_completed'
                    );
                    
                    if (offeringResult.success) {
                        Logger.info(`Successfully offered next turn ${offeringResult.turn?.id} to player ${offeringResult.player?.id} after turn ${turnToSubmit.id} completion`);
                    } else {
                        Logger.warn(`Failed to offer next turn after turn ${turnToSubmit.id} completion: ${offeringResult.error}`);
                        // Don't fail the entire submission process if turn offering fails
                    }
                } catch (offeringError) {
                    Logger.error(`Error in turn offering after turn ${turnToSubmit.id} completion:`, offeringError);
                    // Don't fail the entire submission process if turn offering fails
                }

                // 9. Send confirmation DM to the player
                await msg.author.send(interpolate(strings.messages.submission.submitSuccess, {
                    gameId: turnToSubmit.gameId,
                    seasonId: (turnToSubmit as any).game?.season?.id,
                    turnNumber: turnToSubmit.turnNumber,
                    turnType: turnToSubmit.type,
                    contentType: contentType,
                    contentPreview: contentType === 'text' ? content.substring(0, 100) : 'Image uploaded'
                }));

                Logger.info(`Successfully processed turn submission for player ${player.id} (${msg.author.tag}), completed turn ${turnToSubmit.id}`);
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