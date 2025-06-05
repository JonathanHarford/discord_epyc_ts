import { ModalSubmitInteraction } from 'discord.js';

import { ModalHandler } from './modalHandler.js';
import { strings } from '../lang/strings.js';
import prisma from '../lib/prisma.js';
import { Logger } from '../services/index.js';
import { SchedulerService } from '../services/SchedulerService.js';
import { SeasonTurnService } from '../services/SeasonTurnService.js';

export class TurnSubmitModalHandler implements ModalHandler {
    customIdPrefix = 'turn_submit_modal_';

    public async execute(interaction: ModalSubmitInteraction): Promise<void> {
        const turnId = interaction.customId.substring(this.customIdPrefix.length);
        const discordUserId = interaction.user.id;

        Logger.info(`TurnSubmitModalHandler: User ${interaction.user.username} (${discordUserId}) submitting turn ${turnId}`);

        if (!turnId || turnId.trim().length === 0) {
            Logger.warn(`TurnSubmitModalHandler: Invalid turnId format from customId: ${interaction.customId}`);
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
                Logger.warn(`TurnSubmitModalHandler: Player not found for Discord user ${discordUserId}`);
                await interaction.reply({ 
                    content: strings.messages.ready.playerNotFound, 
                    ephemeral: true 
                });
                return;
            }

            // Get the turn content from the modal
            const turnContent = interaction.fields.getTextInputValue('turn_content');

            if (!turnContent || turnContent.trim().length === 0) {
                await interaction.reply({ 
                    content: 'Turn content cannot be empty. Please try again.', 
                    ephemeral: true 
                });
                return;
            }

            // Get the turn to determine its type
            const turn = await prisma.turn.findUnique({
                where: { id: turnId }
            });

            if (!turn) {
                Logger.warn(`TurnSubmitModalHandler: Turn ${turnId} not found`);
                await interaction.reply({ 
                    content: 'Turn not found. Please try again or contact support.', 
                    ephemeral: true 
                });
                return;
            }

            // Verify the turn belongs to this player and is in PENDING status
            if (turn.playerId !== player.id) {
                Logger.warn(`TurnSubmitModalHandler: Turn ${turnId} does not belong to player ${player.id}`);
                await interaction.reply({ 
                    content: 'This turn does not belong to you.', 
                    ephemeral: true 
                });
                return;
            }

            if (turn.status !== 'PENDING') {
                Logger.warn(`TurnSubmitModalHandler: Turn ${turnId} is not in PENDING status (current: ${turn.status})`);
                await interaction.reply({ 
                    content: 'This turn is not available for submission.', 
                    ephemeral: true 
                });
                return;
            }

            // Create service instances
            const schedulerService = new SchedulerService(prisma);
            const turnService = new SeasonTurnService(prisma, interaction.client, schedulerService);

            // Submit the turn
            const contentType = turn.type === 'WRITING' ? 'text' : 'image';
            const result = await turnService.submitTurn(turnId, player.id, turnContent, contentType);

            if (result.success) {
                await interaction.reply({ 
                    content: `✅ Turn submitted successfully! Your ${turn.type.toLowerCase()} has been recorded.`, 
                    ephemeral: true 
                });

                Logger.info(`TurnSubmitModalHandler: Successfully submitted turn ${turnId} for player ${player.id}`);
            } else {
                const errorMessage = result.error || 'Failed to submit the turn. Please try again.';
                Logger.warn(`TurnSubmitModalHandler: Failed to submit turn ${turnId} for player ${player.id}: ${errorMessage}`);
                await interaction.reply({ 
                    content: `Failed to submit turn: ${errorMessage}`, 
                    ephemeral: true 
                });
            }

        } catch (error) {
            Logger.error(`TurnSubmitModalHandler: Error processing turn submission for turn ${turnId} by user ${discordUserId}:`, error);
            await interaction.reply({
                content: 'An error occurred while submitting the turn. Please try again or contact support.',
                ephemeral: true
            });
        }
    }
} 