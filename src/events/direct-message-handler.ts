import { Message } from 'discord.js';
import { createRequire } from 'node:module';
import { EventHandler } from './index.js';
import { Logger } from '../services/index.js';
import { ErrorHandler } from '../utils/index.js';
import { TurnService } from '../services/TurnService.js';
import { PlayerService } from '../services/PlayerService.js';
import { SchedulerService } from '../services/SchedulerService.js';
import { TurnOfferingService } from '../services/TurnOfferingService.js';
import { MessageHelpers } from '../messaging/MessageHelpers.js';
import { MessageAdapter } from '../messaging/MessageAdapter.js';
import { Language } from '../models/enum-helpers/language.js';

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
    private turnService: TurnService;
    private playerService: PlayerService;
    private schedulerService: SchedulerService;
    private turnOfferingService: TurnOfferingService;

    constructor(
        turnService: TurnService,
        playerService: PlayerService,
        schedulerService: SchedulerService,
        turnOfferingService: TurnOfferingService
    ) {
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
                    const errorInstruction = MessageHelpers.commandError(
                        'ready.player_not_found',
                        { discordUserId: msg.author.id },
                        false // Not ephemeral for DMs
                    );
                    errorInstruction.formatting = { ...errorInstruction.formatting, dm: true };
                    errorInstruction.context = { userId: msg.author.id };
                    
                    await MessageAdapter.processInstruction(
                        errorInstruction,
                        undefined,
                        Language.Default,
                        msg.client
                    );
                    return;
                }

                // 2. Find turns currently OFFERED to this player
                const offeredTurns = await this.turnService.getTurnsForPlayer(player.id, 'OFFERED');
                
                if (offeredTurns.length === 0) {
                    const noTurnsInstruction = MessageHelpers.commandError(
                        'ready.no_offered_turns',
                        { playerName: player.name },
                        false
                    );
                    noTurnsInstruction.formatting = { ...noTurnsInstruction.formatting, dm: true };
                    noTurnsInstruction.context = { userId: msg.author.id };
                    
                    await MessageAdapter.processInstruction(
                        noTurnsInstruction,
                        undefined,
                        Language.Default,
                        msg.client
                    );
                    return;
                }

                // 3. Check if player already has a PENDING turn (can't claim multiple)
                const pendingTurns = await this.turnService.getTurnsForPlayer(player.id, 'PENDING');
                if (pendingTurns.length > 0) {
                    const pendingTurn = pendingTurns[0];
                    const alreadyPendingInstruction = MessageHelpers.commandError(
                        'ready.already_has_pending_turn',
                        { 
                            gameId: pendingTurn.gameId,
                            seasonId: (pendingTurn as any).game?.season?.id,
                            turnNumber: pendingTurn.turnNumber,
                            turnType: pendingTurn.type
                        },
                        false
                    );
                    alreadyPendingInstruction.formatting = { ...alreadyPendingInstruction.formatting, dm: true };
                    alreadyPendingInstruction.context = { userId: msg.author.id };
                    
                    await MessageAdapter.processInstruction(
                        alreadyPendingInstruction,
                        undefined,
                        Language.Default,
                        msg.client
                    );
                    return;
                }

                // 4. If multiple turns are offered, claim the first one (oldest)
                const turnToClaim = offeredTurns[0];
                
                // 5. Claim the turn using TurnService
                const claimResult = await this.turnService.claimTurn(turnToClaim.id, player.id);
                
                if (!claimResult.success) {
                    const claimErrorInstruction = MessageHelpers.commandError(
                        'ready.claim_failed',
                        { 
                            error: claimResult.error,
                            turnId: turnToClaim.id
                        },
                        false
                    );
                    claimErrorInstruction.formatting = { ...claimErrorInstruction.formatting, dm: true };
                    claimErrorInstruction.context = { userId: msg.author.id };
                    
                    await MessageAdapter.processInstruction(
                        claimErrorInstruction,
                        undefined,
                        Language.Default,
                        msg.client
                    );
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
                // TODO: Get actual timeout values from season config
                const submissionTimeoutMinutes = turnToClaim.type === 'WRITING' ? 1440 : 4320; // 1 day for writing, 3 days for drawing
                const submissionTimeoutDate = new Date(Date.now() + submissionTimeoutMinutes * 60 * 1000);
                
                const submissionTimeoutJobId = `turn-submission-timeout-${turnToClaim.id}`;
                const submissionJobScheduled = await this.schedulerService.scheduleJob(
                    submissionTimeoutJobId,
                    submissionTimeoutDate,
                    async () => {
                        // TODO: This should call the submission timeout handler (Task 17)
                        Logger.info(`Submission timeout triggered for turn ${turnToClaim.id}`);
                        // For now, just log - actual handler will be implemented in Task 17
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
                const successInstruction = MessageHelpers.commandSuccess(
                    'ready.claim_success',
                    {
                        gameId: turnToClaim.gameId,
                        seasonId: (turnToClaim as any).game?.season?.id,
                        turnNumber: turnToClaim.turnNumber,
                        turnType: turnToClaim.type,
                        submissionTimeoutMinutes: submissionTimeoutMinutes
                    },
                    false
                );
                successInstruction.formatting = { ...successInstruction.formatting, dm: true };
                successInstruction.context = { userId: msg.author.id };
                
                await MessageAdapter.processInstruction(
                    successInstruction,
                    undefined,
                    Language.Default,
                    msg.client
                );

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
                    const errorInstruction = MessageHelpers.commandError(
                        'submission.player_not_found',
                        { discordUserId: msg.author.id },
                        false // Not ephemeral for DMs
                    );
                    errorInstruction.formatting = { ...errorInstruction.formatting, dm: true };
                    errorInstruction.context = { userId: msg.author.id };
                    
                    await MessageAdapter.processInstruction(
                        errorInstruction,
                        undefined,
                        Language.Default,
                        msg.client
                    );
                    return;
                }

                // 2. Find turns currently PENDING for this player
                const pendingTurns = await this.turnService.getTurnsForPlayer(player.id, 'PENDING');
                
                if (pendingTurns.length === 0) {
                    const noTurnsInstruction = MessageHelpers.commandError(
                        'submission.no_pending_turns',
                        { playerName: player.name },
                        false
                    );
                    noTurnsInstruction.formatting = { ...noTurnsInstruction.formatting, dm: true };
                    noTurnsInstruction.context = { userId: msg.author.id };
                    
                    await MessageAdapter.processInstruction(
                        noTurnsInstruction,
                        undefined,
                        Language.Default,
                        msg.client
                    );
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
                        const noAttachmentInstruction = MessageHelpers.commandError(
                            'submission.no_attachment_found',
                            {},
                            false
                        );
                        noAttachmentInstruction.formatting = { ...noAttachmentInstruction.formatting, dm: true };
                        noAttachmentInstruction.context = { userId: msg.author.id };
                        
                        await MessageAdapter.processInstruction(
                            noAttachmentInstruction,
                            undefined,
                            Language.Default,
                            msg.client
                        );
                        return;
                    }
                    
                    // Validate that it's an image
                    if (!attachment.contentType?.startsWith('image/')) {
                        const invalidFileInstruction = MessageHelpers.commandError(
                            'submission.invalid_file_type',
                            { fileType: attachment.contentType || 'unknown' },
                            false
                        );
                        invalidFileInstruction.formatting = { ...invalidFileInstruction.formatting, dm: true };
                        invalidFileInstruction.context = { userId: msg.author.id };
                        
                        await MessageAdapter.processInstruction(
                            invalidFileInstruction,
                            undefined,
                            Language.Default,
                            msg.client
                        );
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
                    const noContentInstruction = MessageHelpers.commandError(
                        'submission.no_content_found',
                        {},
                        false
                    );
                    noContentInstruction.formatting = { ...noContentInstruction.formatting, dm: true };
                    noContentInstruction.context = { userId: msg.author.id };
                    
                    await MessageAdapter.processInstruction(
                        noContentInstruction,
                        undefined,
                        Language.Default,
                        msg.client
                    );
                    return;
                }

                // 5. Validate content type matches turn type
                if ((turnToSubmit.type === 'WRITING' && contentType !== 'text') ||
                    (turnToSubmit.type === 'DRAWING' && contentType !== 'image')) {
                    const wrongContentTypeInstruction = MessageHelpers.commandError(
                        'submission.wrong_content_type',
                        { 
                            expectedType: turnToSubmit.type === 'WRITING' ? 'text' : 'image',
                            receivedType: contentType,
                            turnType: turnToSubmit.type
                        },
                        false
                    );
                    wrongContentTypeInstruction.formatting = { ...wrongContentTypeInstruction.formatting, dm: true };
                    wrongContentTypeInstruction.context = { userId: msg.author.id };
                    
                    await MessageAdapter.processInstruction(
                        wrongContentTypeInstruction,
                        undefined,
                        Language.Default,
                        msg.client
                    );
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
                    const submitErrorInstruction = MessageHelpers.commandError(
                        'submission.submit_failed',
                        { 
                            error: submitResult.error,
                            turnId: turnToSubmit.id
                        },
                        false
                    );
                    submitErrorInstruction.formatting = { ...submitErrorInstruction.formatting, dm: true };
                    submitErrorInstruction.context = { userId: msg.author.id };
                    
                    await MessageAdapter.processInstruction(
                        submitErrorInstruction,
                        undefined,
                        Language.Default,
                        msg.client
                    );
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
                const successInstruction = MessageHelpers.commandSuccess(
                    'submission.submit_success',
                    {
                        gameId: turnToSubmit.gameId,
                        seasonId: (turnToSubmit as any).game?.season?.id,
                        turnNumber: turnToSubmit.turnNumber,
                        turnType: turnToSubmit.type,
                        contentType: contentType,
                        contentPreview: contentType === 'text' ? content.substring(0, 100) : 'Image uploaded'
                    },
                    false
                );
                successInstruction.formatting = { ...successInstruction.formatting, dm: true };
                successInstruction.context = { userId: msg.author.id };
                
                await MessageAdapter.processInstruction(
                    successInstruction,
                    undefined,
                    Language.Default,
                    msg.client
                );

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