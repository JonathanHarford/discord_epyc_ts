import { ButtonInteraction } from 'discord.js';

import { ButtonHandler } from '../handlers/buttonHandler.js';
import { interpolate, strings } from '../lang/strings.js';
import { Logger, SeasonTurnService, TurnOfferingService } from '../services/index.js';
import { PlayerService } from '../services/PlayerService.js';
import { SchedulerService } from '../services/SchedulerService.js';
import { FormatUtils } from '../utils/format-utils.js';
import { getSeasonTimeouts } from '../utils/seasonConfig.js';

/**
 * Button handler for ready command interactions
 * Handles turn claiming via ephemeral button interactions instead of DM commands
 */
export class ReadyButton implements ButtonHandler {
    public customIdPrefix = 'ready_claim';

    constructor(
        private prisma: any,
        private turnService: SeasonTurnService,
        private playerService: PlayerService,
        private schedulerService: SchedulerService,
        private turnOfferingService: TurnOfferingService
    ) {}

    public async execute(intr: ButtonInteraction): Promise<void> {
        try {
            Logger.info(`Processing ready button click from ${intr.user.tag} (${intr.user.id})`);
            
            // 1. Find the player by Discord user ID
            const player = await this.playerService.getPlayerByDiscordId(intr.user.id);
            if (!player) {
                await intr.reply({
                    content: strings.messages.ready.playerNotFound,
                    ephemeral: true
                });
                return;
            }

            // 2. Find turns currently OFFERED to this player
            const offeredTurns = await this.turnService.getTurnsForPlayer(player.id, 'OFFERED');
            
            if (offeredTurns.length === 0) {
                await intr.reply({
                    content: strings.messages.ready.noOfferedTurns,
                    ephemeral: true
                });
                return;
            }

            // 3. Check if player already has a PENDING turn (can't claim multiple)
            const pendingTurns = await this.turnService.getTurnsForPlayer(player.id, 'PENDING');
            if (pendingTurns.length > 0) {
                // Send the standard message
                await intr.reply({
                    content: strings.messages.ready.alreadyHasPendingTurn,
                    ephemeral: true
                });
                
                // Re-send the pending turn prompt as ephemeral follow-up
                const pendingTurn = pendingTurns[0];
                const timeouts = await getSeasonTimeouts(this.prisma, pendingTurn.id);
                const submissionTimeoutMinutes = pendingTurn.type === 'WRITING' 
                    ? timeouts.writingTimeoutMinutes 
                    : timeouts.drawingTimeoutMinutes;
                
                // Get the previous turn content for context
                const previousTurn = await this.prisma.turn.findFirst({
                    where: {
                        gameId: pendingTurn.gameId,
                        turnNumber: pendingTurn.turnNumber - 1,
                        status: 'COMPLETED'
                    }
                });
                
                // Calculate submission timeout expiration time
                const submissionTimeoutDate = new Date(pendingTurn.updatedAt.getTime() + submissionTimeoutMinutes * 60 * 1000);
                
                // Send appropriate claim success message based on turn type
                const messageKey = pendingTurn.type === 'WRITING' 
                    ? strings.messages.ready.claimSuccessWriting
                    : strings.messages.ready.claimSuccessDrawing;
                
                const messageData = pendingTurn.type === 'WRITING' 
                    ? {
                        previousTurnImage: previousTurn?.imageUrl || '[Previous image not found]',
                        submissionTimeoutFormatted: FormatUtils.formatRemainingTime(submissionTimeoutDate)
                    }
                    : {
                        previousTurnWriting: previousTurn?.textContent || '[Previous text not found]',
                        submissionTimeoutFormatted: FormatUtils.formatRemainingTime(submissionTimeoutDate)
                    };

                await intr.followUp({
                    content: interpolate(messageKey, messageData),
                    ephemeral: true
                });
                return;
            }

            // 4. If multiple turns are offered, claim the first one (oldest)
            const turnToClaim = offeredTurns[0];
            
            // 5. Claim the turn using SeasonTurnService
            const claimResult = await this.turnService.claimTurn(turnToClaim.id, player.id);
            
            if (!claimResult.success) {
                await intr.reply({
                    content: strings.messages.ready.claimFailed,
                    ephemeral: true
                });
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
                async (_jobData) => {
                    Logger.info(`Submission timeout triggered for turn ${turnToClaim.id}`);
                    
                    // Import and create the SubmissionTimeoutHandler
                    const { SubmissionTimeoutHandler } = await import('../handlers/SubmissionTimeoutHandler.js');
                    const submissionTimeoutHandler = new SubmissionTimeoutHandler(
                        this.prisma,
                        intr.client,
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

            // 8. Send confirmation ephemeral message to the player
            // Get the previous turn content for context
            const previousTurn = await this.prisma.turn.findFirst({
                where: {
                    gameId: turnToClaim.gameId,
                    turnNumber: turnToClaim.turnNumber - 1,
                    status: 'COMPLETED'
                }
            });
            
            // Send appropriate claim success message based on turn type
            const messageKey = turnToClaim.type === 'WRITING' 
                ? strings.messages.ready.claimSuccessWriting
                : strings.messages.ready.claimSuccessDrawing;
            
            const messageData = turnToClaim.type === 'WRITING' 
                ? {
                    previousTurnImage: previousTurn?.imageUrl || '[Previous image not found]',
                    submissionTimeoutFormatted: FormatUtils.formatRemainingTime(submissionTimeoutDate)
                }
                : {
                    previousTurnWriting: previousTurn?.textContent || '[Previous text not found]',
                    submissionTimeoutFormatted: FormatUtils.formatRemainingTime(submissionTimeoutDate)
                };

            await intr.reply({
                content: interpolate(messageKey, messageData),
                ephemeral: true
            });

            Logger.info(`Successfully processed ready button for player ${player.id} (${intr.user.tag}), claimed turn ${turnToClaim.id}`);
        } catch (error) {
            Logger.error(`Error processing ready button for ${intr.user.tag}:`, error);
            
            const { ErrorHandler } = await import('../utils/error-handler.js');
            await ErrorHandler.handleButtonError(
                error instanceof Error ? error : new Error('Unknown error'),
                intr,
                { context: 'ready_command' }
            );
        }
    }
} 