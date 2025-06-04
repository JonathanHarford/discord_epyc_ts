import { ModalSubmitInteraction } from 'discord.js';

import { ModalHandler } from './modalHandler.js';
import prisma from '../lib/prisma.js';
import { ConfigService } from '../services/ConfigService.js';
import { Logger } from '../services/logger.js';

export class AdminSeasonConfigModalHandler implements ModalHandler {
    customIdPrefix = 'admin_season_config';

    public async execute(interaction: ModalSubmitInteraction): Promise<void> {
        if (!interaction.guild) {
            await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            return;
        }

        try {
            // Extract values from modal fields
            const turnPattern = interaction.fields.getTextInputValue('turn_pattern');
            const claimTimeoutStr = interaction.fields.getTextInputValue('claim_timeout');
            const writingTimeoutStr = interaction.fields.getTextInputValue('writing_timeout');
            const drawingTimeoutStr = interaction.fields.getTextInputValue('drawing_timeout');
            const openDurationStr = interaction.fields.getTextInputValue('open_duration');

            // Convert to duration strings (assuming input is in minutes)
            const claimTimeout = `${claimTimeoutStr}m`;
            const writingTimeout = `${writingTimeoutStr}m`;
            const drawingTimeout = `${drawingTimeoutStr}m`;
            const openDuration = `${openDurationStr}m`;

            // Validate numeric inputs
            const claimTimeoutNum = parseInt(claimTimeoutStr);
            const writingTimeoutNum = parseInt(writingTimeoutStr);
            const drawingTimeoutNum = parseInt(drawingTimeoutStr);
            const openDurationNum = parseInt(openDurationStr);

            if (isNaN(claimTimeoutNum) || claimTimeoutNum < 1) {
                await interaction.reply({ content: 'Claim timeout must be a positive number.', ephemeral: true });
                return;
            }
            if (isNaN(writingTimeoutNum) || writingTimeoutNum < 1) {
                await interaction.reply({ content: 'Writing timeout must be a positive number.', ephemeral: true });
                return;
            }
            if (isNaN(drawingTimeoutNum) || drawingTimeoutNum < 1) {
                await interaction.reply({ content: 'Drawing timeout must be a positive number.', ephemeral: true });
                return;
            }
            if (isNaN(openDurationNum) || openDurationNum < 1) {
                await interaction.reply({ content: 'Open duration must be a positive number.', ephemeral: true });
                return;
            }

            // Update season configuration
            const configService = new ConfigService(prisma);
            await configService.updateGuildDefaultConfig(interaction.guild.id, {
                turnPattern: turnPattern,
                claimTimeout: claimTimeout,
                writingTimeout: writingTimeout,
                drawingTimeout: drawingTimeout,
                openDuration: openDuration
            });

            await interaction.reply({
                content: `Season configuration updated successfully!\n` +
                        `Turn Pattern: ${turnPattern}\n` +
                        `Claim Timeout: ${claimTimeoutNum} minutes\n` +
                        `Writing Timeout: ${writingTimeoutNum} minutes\n` +
                        `Drawing Timeout: ${drawingTimeoutNum} minutes\n` +
                        `Open Duration: ${openDurationNum} minutes`,
                ephemeral: true
            });

            Logger.info(`Season config updated for guild ${interaction.guild.id} by ${interaction.user.tag}`);
        } catch (error) {
            Logger.error('Error handling admin season config modal:', error);
            await interaction.reply({
                content: 'An error occurred while updating the season configuration.',
                ephemeral: true
            });
        }
    }
}

// Export the function for backward compatibility
export async function handleAdminSeasonConfigModal(interaction: ModalSubmitInteraction): Promise<void> {
    const handler = new AdminSeasonConfigModalHandler();
    await handler.execute(interaction);
} 