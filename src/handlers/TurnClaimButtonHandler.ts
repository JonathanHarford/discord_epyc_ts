import { ButtonInteraction, CacheType, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js'; // Added ButtonBuilder, ButtonStyle, ActionRowBuilder

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

                // Determine the DM message based on turn type
                // let dmMessage: string; // Now handled inside conditional blocks

                if (result.turn.type === 'WRITING') {
                    // For WRITING turns, prompt with a button to open the submission modal
                    const writeStoryButton = new ButtonBuilder()
                        .setCustomId(`text_submit_prompt_${result.turn.id}`)
                        .setLabel("Write Your Story")
                        .setStyle(ButtonStyle.Primary);

                    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(writeStoryButton);

                    await interaction.reply({
                        content: '✅ Turn claimed! Click the button below to write your story.',
                        components: [actionRow],
                        ephemeral: true
                    });

                    // Comment out the old DM for WRITING turns for now
                    /*
                    // This block was originally before the if/else for turn type specific DMs
                    // const timeouts = await getSeasonTimeouts(prisma, turnId); // turnId is in scope
                    // const submissionTimeoutMinutes = timeouts.writingTimeoutMinutes;
                    // const submissionTimeoutDate = new Date(Date.now() + submissionTimeoutMinutes * 60 * 1000);
                    // const previousTurn = await prisma.turn.findFirst({ // This was also defined above
                    //     where: {
                    //         gameId: result.turn.gameId,
                    //         turnNumber: result.turn.turnNumber - 1,
                    //         status: 'COMPLETED'
                    //     }
                    // });
                    const dmMessage = interpolate(strings.messages.ready.claimSuccessWriting, {
                        previousTurnImage: previousTurn?.imageUrl || '[Previous image not found]',
                        submissionTimeoutFormatted: FormatUtils.formatRemainingTime(submissionTimeoutDate) // submissionTimeoutDate is defined above
                    });
                    await interaction.user.send({ content: dmMessage });
                    */

                } else if (result.turn.type === 'DRAWING') {
                    // New logic for DRAWING turns:
                    const replyMessage = interpolate(strings.messages.submission.drawingPromptEphemeral, {
                        turnId: result.turn.id
                        // Add other relevant variables if the string template needs them e.g. gameId
                    });

                    await interaction.reply({
                        content: replyMessage,
                        ephemeral: true
                    });

                    // Comment out or remove the old DM sending logic for DRAWING turns
                    /*
                    // const timeouts = await getSeasonTimeouts(prisma, turnId); // Defined above
                    // const submissionTimeoutMinutes = timeouts.drawingTimeoutMinutes; // Defined above
                    // const submissionTimeoutDate = new Date(Date.now() + submissionTimeoutMinutes * 60 * 1000); // Defined above
                    // const previousTurn = await prisma.turn.findFirst({ // Defined above
                    //     where: {
                    //         gameId: result.turn.gameId,
                    //         turnNumber: result.turn.turnNumber - 1,
                    //         status: 'COMPLETED'
                    //     }
                    // });
                    const dmMessageDrawing = interpolate(strings.messages.ready.claimSuccessDrawing, {
                        previousTurnWriting: previousTurn?.textContent || '[Previous text not found]',
                        submissionTimeoutFormatted: FormatUtils.formatRemainingTime(submissionTimeoutDate)
                    });
                    await interaction.user.send({ content: dmMessageDrawing });
                    */

                } else {
                    // Fallback for any other unexpected turn types
                    Logger.warn(`TurnClaimButtonHandler: Claimed turn ${result.turn.id} has unexpected type ${result.turn.type}. Sending generic ephemeral reply.`);
                    await interaction.reply({
                        content: "✅ Turn claimed! Instructions for this turn type are not yet fully migrated to the new system. Please await further instructions or contact support.",
                        ephemeral: true
                    });
                }

                // Common logic: Remove the original turn offer message
                try {
                    await interaction.message.delete();
                } catch (deleteError) {
                    Logger.warn(`TurnClaimButtonHandler: Could not delete original message for turn ${turnId}:`, deleteError);
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