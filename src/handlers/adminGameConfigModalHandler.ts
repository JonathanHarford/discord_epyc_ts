import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalSubmitInteraction } from 'discord.js';

import { ModalHandler } from './modalHandler.js';
import prisma from '../lib/prisma.js';
import { GameConfigService } from '../services/GameConfigService.js';
import { Logger } from '../services/logger.js';

// Temporary state storage for multi-step modal
// Key: userId, Value: Partial game config data from step 1
export const gameConfigState = new Map<string, any>();

export class AdminGameConfigModalHandler implements ModalHandler {
    customIdPrefix = 'admin_game_config';

    public async execute(interaction: ModalSubmitInteraction): Promise<void> {
        if (!interaction.guild) {
            await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            return;
        }

        if (interaction.customId === 'admin_game_config_step1') {
            await this.handleStep1(interaction);
        } else if (interaction.customId === 'admin_game_config_step2') {
            await this.handleStep2(interaction);
        } else {
            Logger.warn(`AdminGameConfigModalHandler: Received unhandled customId: ${interaction.customId}`);
            await interaction.reply({ content: 'Sorry, this action isn\'t recognized.', ephemeral: true });
        }
    }

    private async handleStep1(interaction: ModalSubmitInteraction): Promise<void> {
        const userId = interaction.user.id;

        try {
            // Extract values from step 1 modal fields
            const writingTimeoutStr = interaction.fields.getTextInputValue('writingTimeoutInput');
            const drawingTimeoutStr = interaction.fields.getTextInputValue('drawingTimeoutInput');
            const staleTimeoutStr = interaction.fields.getTextInputValue('staleTimeoutInput');
            const minTurnsStr = interaction.fields.getTextInputValue('minTurnsInput');
            const maxTurnsStr = interaction.fields.getTextInputValue('maxTurnsInput');

            // Validate numeric inputs
            const minTurns = parseInt(minTurnsStr);
            if (isNaN(minTurns) || minTurns < 1) {
                await interaction.reply({ content: 'Minimum turns must be a positive number.', ephemeral: true });
                return;
            }

            let maxTurns: number | null = null;
            if (maxTurnsStr.trim()) {
                maxTurns = parseInt(maxTurnsStr);
                if (isNaN(maxTurns) || maxTurns < 1) {
                    await interaction.reply({ content: 'Maximum turns must be a positive number or left empty.', ephemeral: true });
                    return;
                }
                if (maxTurns <= minTurns) {
                    await interaction.reply({ content: 'Maximum turns must be greater than minimum turns.', ephemeral: true });
                    return;
                }
            }

            // Store step 1 data
            const step1Data = {
                writingTimeout: writingTimeoutStr,
                drawingTimeout: drawingTimeoutStr,
                staleTimeout: staleTimeoutStr,
                minTurns: minTurns,
                maxTurns: maxTurns
            };

            gameConfigState.set(userId, step1Data);

            // Create button to proceed to step 2
            const continueButton = new ButtonBuilder()
                .setCustomId(`game_config_continue_${userId}`)
                .setLabel('Continue to Advanced Settings')
                .setStyle(ButtonStyle.Primary);

            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(continueButton);

            await interaction.reply({
                content: `**Step 1 Complete!** Basic settings saved:\n\n` +
                        `• Writing Timeout: ${step1Data.writingTimeout}\n` +
                        `• Drawing Timeout: ${step1Data.drawingTimeout}\n` +
                        `• Stale Timeout: ${step1Data.staleTimeout}\n` +
                        `• Min Turns: ${step1Data.minTurns}\n` +
                        `• Max Turns: ${step1Data.maxTurns || 'unlimited'}\n\n` +
                        `Click the button below to configure advanced settings.`,
                components: [actionRow],
                ephemeral: true
            });

        } catch (error) {
            Logger.error('Error handling admin game config step 1 modal:', error);
            gameConfigState.delete(userId); // Clean up state on error
            await interaction.reply({
                content: 'An error occurred while processing the first step of configuration.',
                ephemeral: true
            });
        }
    }

    private async handleStep2(interaction: ModalSubmitInteraction): Promise<void> {
        const userId = interaction.user.id;

        try {
            // Get step 1 data from state
            const step1Data = gameConfigState.get(userId);
            if (!step1Data) {
                await interaction.reply({ 
                    content: 'Configuration session expired. Please start over with `/admin game config`.', 
                    ephemeral: true 
                });
                return;
            }

            // Extract values from step 2 modal fields
            const writingWarning = interaction.fields.getTextInputValue('writingWarningInput');
            const drawingWarning = interaction.fields.getTextInputValue('drawingWarningInput');
            const returnCountStr = interaction.fields.getTextInputValue('returnCountInput');
            const returnCooldownStr = interaction.fields.getTextInputValue('returnCooldownInput');
            const turnPattern = interaction.fields.getTextInputValue('turnPatternInput');

            // Validate optional numeric inputs
            let returnCount: number | null = null;
            if (returnCountStr.trim()) {
                returnCount = parseInt(returnCountStr);
                if (isNaN(returnCount) || returnCount < 0) {
                    await interaction.reply({ content: 'Return count must be a non-negative number or left empty.', ephemeral: true });
                    return;
                }
            }

            let returnCooldown: number | null = null;
            if (returnCooldownStr.trim()) {
                returnCooldown = parseInt(returnCooldownStr);
                if (isNaN(returnCooldown) || returnCooldown < 0) {
                    await interaction.reply({ content: 'Return cooldown must be a non-negative number or left empty.', ephemeral: true });
                    return;
                }
            }

            // Combine step 1 and step 2 data
            const completeConfig = {
                ...step1Data,
                writingWarning: writingWarning,
                drawingWarning: drawingWarning,
                returnCount: returnCount,
                returnCooldown: returnCooldown,
                turnPattern: turnPattern
            };

            // Update game configuration
            const gameConfigService = new GameConfigService(prisma);
            await gameConfigService.updateGuildDefaultConfig(interaction.guild.id, completeConfig);

            // Clean up state
            gameConfigState.delete(userId);

            await interaction.reply({
                content: `Game configuration updated successfully!\n\n` +
                        `**Basic Settings:**\n` +
                        `• Writing Timeout: ${completeConfig.writingTimeout}\n` +
                        `• Drawing Timeout: ${completeConfig.drawingTimeout}\n` +
                        `• Stale Timeout: ${completeConfig.staleTimeout}\n` +
                        `• Min Turns: ${completeConfig.minTurns}\n` +
                        `• Max Turns: ${completeConfig.maxTurns || 'unlimited'}\n\n` +
                        `**Advanced Settings:**\n` +
                        `• Writing Warning: ${completeConfig.writingWarning}\n` +
                        `• Drawing Warning: ${completeConfig.drawingWarning}\n` +
                        `• Return Count: ${completeConfig.returnCount !== null ? completeConfig.returnCount : 'default'}\n` +
                        `• Return Cooldown: ${completeConfig.returnCooldown !== null ? completeConfig.returnCooldown : 'default'}\n` +
                        `• Turn Pattern: ${completeConfig.turnPattern}`,
                ephemeral: true
            });

            Logger.info(`Game config updated for guild ${interaction.guild.id} by ${interaction.user.tag}`);
        } catch (error) {
            Logger.error('Error handling admin game config step 2 modal:', error);
            gameConfigState.delete(userId); // Clean up state on error
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