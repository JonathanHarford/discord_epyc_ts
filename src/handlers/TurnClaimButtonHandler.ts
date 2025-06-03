import { ButtonInteraction, CacheType } from 'discord.js';

import { ButtonHandler } from './buttonHandler.js';
import { interpolate, strings } from '../lang/strings.js';
import prisma from '../lib/prisma.js';
import { Logger } from '../services/index.js';
import { SchedulerService } from '../services/SchedulerService.js';
import { SeasonTurnService } from '../services/SeasonTurnService.js';
import { FormatUtils } from '../utils/format-utils.js';
import { getSeasonTimeouts } from '../utils/seasonConfig.js';

export class TurnClaimButtonHandler implements ButtonHandler {
    customIdPrefix = 'turn_claim_';

    public async execute(interaction: ButtonInteraction<CacheType>): Promise<void> {
        const turnId = interaction.customId.substring(this.customIdPrefix.length);
        const discordUserId = interaction.user.id;

        Logger.info(`TurnClaimButtonHandler: User ${interaction.user.username} (${discordUserId}) attempting to claim turn ${turnId}`);

        if (!turnId || turnId.trim().length === 0) {
            Logger.warn(`TurnClaimButtonHandler: Invalid turnId format from customId: ${interaction.customId}`);
            await interaction.reply({ 
                content: 'Invalid turn reference. Please try again or contact support.', 
                ephemeral: true 
            });
            return;
        }

        try {
            // Find the player record
            const player = await prisma.player.findUnique({ 
                where: { discordUserId } 
            });

            if (!player) {
                Logger.warn(`TurnClaimButtonHandler: Player not found for Discord user ${discordUserId}`);
                await interaction.reply({ 
                    content: strings.messages.ready.playerNotFound, 
                    ephemeral: true 
                });
                return;
            }

            // Create service instances
            const schedulerService = new SchedulerService(prisma);
            const turnService = new SeasonTurnService(prisma, interaction.client, schedulerService);

            // Attempt to claim the turn
            const result = await turnService.claimTurn(turnId, player.id);

            if (result.success && result.turn) {
                // Get season-specific timeout values for submission timeout calculation
                const timeouts = await getSeasonTimeouts(prisma, turnId);
                const submissionTimeoutMinutes = result.turn.type === 'WRITING' 
                    ? timeouts.writingTimeoutMinutes 
                    : timeouts.drawingTimeoutMinutes;
                const submissionTimeoutDate = new Date(Date.now() + submissionTimeoutMinutes * 60 * 1000);

                // Get the previous turn content for context
                const previousTurn = await prisma.turn.findFirst({
                    where: {
                        gameId: result.turn.gameId,
                        turnNumber: result.turn.turnNumber - 1,
                        status: 'COMPLETED'
                    }
                });

                // Determine the success message based on turn type
                let successMessage: string;
                if (result.turn.type === 'WRITING') {
                    successMessage = interpolate(strings.messages.ready.claimSuccessWriting, {
                        previousTurnImage: previousTurn?.imageUrl || '[Previous image not found]',
                        submissionTimeoutFormatted: FormatUtils.formatRemainingTime(submissionTimeoutDate)
                    });
                } else {
                    successMessage = interpolate(strings.messages.ready.claimSuccessDrawing, {
                        previousTurnWriting: previousTurn?.textContent || '[Previous text not found]',
                        submissionTimeoutFormatted: FormatUtils.formatRemainingTime(submissionTimeoutDate)
                    });
                }

                // Send only the success message without redundant "claimed successfully" prefix
                await interaction.reply({ 
                    content: successMessage, 
                    ephemeral: true 
                });

                // Update the original message to show the turn has been claimed
                try {
                    await interaction.message.edit({
                        content: `🎨 This turn has been claimed by ${interaction.user.username}! 🎨`,
                        components: [] // Remove the button
                    });
                } catch (editError) {
                    Logger.warn(`TurnClaimButtonHandler: Could not edit original message for turn ${turnId}:`, editError);
                }

            } else {
                const errorMessage = result.error || 'Failed to claim the turn. Please try again.';
                Logger.warn(`TurnClaimButtonHandler: Failed to claim turn ${turnId} for player ${player.id}: ${errorMessage}`);
                await interaction.reply({ 
                    content: strings.messages.ready.claimFailed, 
                    ephemeral: true 
                });
            }

        } catch (error) {
            Logger.error(`TurnClaimButtonHandler: Error processing turn claim for turn ${turnId} by user ${discordUserId}:`, error);
            await interaction.reply({
                content: 'An error occurred while claiming the turn. Please try again or contact support.',
                ephemeral: true
            });
        }
    }
} 