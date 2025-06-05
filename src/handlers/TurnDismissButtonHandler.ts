import { ButtonInteraction, CacheType } from 'discord.js';

import { ButtonHandler } from './buttonHandler.js';
import { strings } from '../lang/strings.js';
import prisma from '../lib/prisma.js';
import { Logger } from '../services/index.js';
import { SchedulerService } from '../services/SchedulerService.js';
import { SeasonTurnService } from '../services/SeasonTurnService.js';

export class TurnDismissButtonHandler implements ButtonHandler {
    customIdPrefix = 'turn_dismiss_';

    public async execute(interaction: ButtonInteraction<CacheType>): Promise<void> {
        const turnId = interaction.customId.substring(this.customIdPrefix.length);
        const discordUserId = interaction.user.id;

        Logger.info(`TurnDismissButtonHandler: User ${interaction.user.username} (${discordUserId}) attempting to dismiss turn ${turnId}`);

        if (!turnId || turnId.trim().length === 0) {
            Logger.warn(`TurnDismissButtonHandler: Invalid turnId format from customId: ${interaction.customId}`);
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
                Logger.warn(`TurnDismissButtonHandler: Player not found for Discord user ${discordUserId}`);
                await interaction.reply({ 
                    content: strings.messages.ready.playerNotFound, 
                    ephemeral: true 
                });
                return;
            }

            // Create service instances
            const schedulerService = new SchedulerService(prisma);
            const turnService = new SeasonTurnService(prisma, interaction.client, schedulerService);

            // Attempt to dismiss the turn offer
            const result = await turnService.dismissOffer(turnId);

            if (result.success) {
                // Acknowledge the dismissal
                await interaction.reply({ 
                    content: '✅ Turn offer dismissed. You will not receive this turn.', 
                    ephemeral: true 
                });

                Logger.info(`TurnDismissButtonHandler: Successfully dismissed turn ${turnId} for player ${player.id}`);
            } else {
                const errorMessage = result.error || 'Failed to dismiss the turn offer. Please try again.';
                Logger.warn(`TurnDismissButtonHandler: Failed to dismiss turn ${turnId} for player ${player.id}: ${errorMessage}`);
                await interaction.reply({ 
                    content: 'Failed to dismiss the turn offer. Please try again or contact support.', 
                    ephemeral: true 
                });
            }

        } catch (error) {
            Logger.error(`TurnDismissButtonHandler: Error processing turn dismissal for turn ${turnId} by user ${discordUserId}:`, error);
            await interaction.reply({
                content: 'An error occurred while dismissing the turn offer. Please try again or contact support.',
                ephemeral: true
            });
        }
    }
} 