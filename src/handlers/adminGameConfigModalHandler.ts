import { ModalSubmitInteraction } from 'discord.js';

import { ModalHandler } from './modalHandler.js';
import prisma from '../lib/prisma.js';
import { GameConfigService } from '../services/GameConfigService.js';
import { Logger } from '../services/logger.js';

export class AdminGameConfigModalHandler implements ModalHandler {
    customIdPrefix = 'admin_game_config';

    public async execute(interaction: ModalSubmitInteraction): Promise<void> {
        if (!interaction.guild) {
            await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            return;
        }

        try {
            // Extract values from modal fields
            const turnPattern = interaction.fields.getTextInputValue('turn_pattern');
            const writingTimeoutStr = interaction.fields.getTextInputValue('writing_timeout');
            const drawingTimeoutStr = interaction.fields.getTextInputValue('drawing_timeout');
            const staleTimeoutStr = interaction.fields.getTextInputValue('stale_timeout');
            const minTurnsStr = interaction.fields.getTextInputValue('min_turns');

            // Convert to duration strings (assuming input is in minutes)
            const writingTimeout = `${writingTimeoutStr}m`;
            const drawingTimeout = `${drawingTimeoutStr}m`;
            const staleTimeout = `${staleTimeoutStr}m`;

            // Validate numeric inputs
            const writingTimeoutNum = parseInt(writingTimeoutStr);
            const drawingTimeoutNum = parseInt(drawingTimeoutStr);
            const staleTimeoutNum = parseInt(staleTimeoutStr);
            const minTurns = parseInt(minTurnsStr);

            if (isNaN(writingTimeoutNum) || writingTimeoutNum < 1) {
                await interaction.reply({ content: 'Writing timeout must be a positive number.', ephemeral: true });
                return;
            }
            if (isNaN(drawingTimeoutNum) || drawingTimeoutNum < 1) {
                await interaction.reply({ content: 'Drawing timeout must be a positive number.', ephemeral: true });
                return;
            }
            if (isNaN(staleTimeoutNum) || staleTimeoutNum < 1) {
                await interaction.reply({ content: 'Stale timeout must be a positive number.', ephemeral: true });
                return;
            }
            if (isNaN(minTurns) || minTurns < 1) {
                await interaction.reply({ content: 'Minimum turns must be a positive number.', ephemeral: true });
                return;
            }

            // Update game configuration
            const gameConfigService = new GameConfigService(prisma);
            await gameConfigService.updateGuildDefaultConfig(interaction.guild.id, {
                turnPattern: turnPattern,
                writingTimeout: writingTimeout,
                drawingTimeout: drawingTimeout,
                staleTimeout: staleTimeout,
                minTurns: minTurns
            });

            await interaction.reply({
                content: `Game configuration updated successfully!\n` +
                        `Turn Pattern: ${turnPattern}\n` +
                        `Writing Timeout: ${writingTimeoutNum} minutes\n` +
                        `Drawing Timeout: ${drawingTimeoutNum} minutes\n` +
                        `Stale Timeout: ${staleTimeoutNum} minutes\n` +
                        `Minimum Turns: ${minTurns}`,
                ephemeral: true
            });

            Logger.info(`Game config updated for guild ${interaction.guild.id} by ${interaction.user.tag}`);
        } catch (error) {
            Logger.error('Error handling admin game config modal:', error);
            await interaction.reply({
                content: 'An error occurred while updating the game configuration.',
                ephemeral: true
            });
        }
    }
}

// Export the function for backward compatibility
export async function handleAdminGameConfigModal(interaction: ModalSubmitInteraction): Promise<void> {
    const handler = new AdminGameConfigModalHandler();
    await handler.execute(interaction);
} 