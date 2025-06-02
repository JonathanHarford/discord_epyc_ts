import { ButtonInteraction, CacheType } from 'discord.js';

import { ButtonHandler } from './buttonHandler.js';
import { interpolate, strings } from '../lang/strings.js';
import prisma from '../lib/prisma.js';
import { Logger } from '../services/index.js';
import { SchedulerService } from '../services/SchedulerService.js';
import { SeasonTurnService } from '../services/SeasonTurnService.js';

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
                // Determine the success message based on turn type
                let successMessage: string;
                if (result.turn.type === 'WRITING') {
                    successMessage = interpolate(strings.messages.ready.claimSuccessWriting, {
                        previousTurnImage: '[Previous turn image]', // This would need to be fetched from the previous turn
                        submissionTimeoutFormatted: 'your submission timeout' // This would need to be calculated
                    });
                } else {
                    successMessage = interpolate(strings.messages.ready.claimSuccessDrawing, {
                        previousTurnWriting: '[Previous turn text]', // This would need to be fetched from the previous turn
                        submissionTimeoutFormatted: 'your submission timeout' // This would need to be calculated
                    });
                }

                await interaction.reply({ 
                    content: `✅ Turn claimed successfully! ${successMessage}`, 
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