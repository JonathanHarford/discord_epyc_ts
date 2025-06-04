import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalSubmitInteraction } from 'discord.js';

import { ModalHandler } from './modalHandler.js';
import prisma from '../lib/prisma.js';
import { ConfigService } from '../services/ConfigService.js';
import { Logger } from '../services/logger.js';

// Temporary state storage for multi-step modal
// Key: userId, Value: Partial season config data from step 1
export const seasonConfigState = new Map<string, any>();

export class AdminSeasonConfigModalHandler implements ModalHandler {
    customIdPrefix = 'admin_season_config';

    public async execute(interaction: ModalSubmitInteraction): Promise<void> {
        if (!interaction.guild) {
            await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            return;
        }

        if (interaction.customId === 'admin_season_config_step1') {
            await this.handleStep1(interaction);
        } else if (interaction.customId === 'admin_season_config_step2') {
            await this.handleStep2(interaction);
        } else {
            Logger.warn(`AdminSeasonConfigModalHandler: Received unhandled customId: ${interaction.customId}`);
            await interaction.reply({ content: 'Sorry, this action isn\'t recognized.', ephemeral: true });
        }
    }

    private async handleStep1(interaction: ModalSubmitInteraction): Promise<void> {
        const userId = interaction.user.id;

        try {
            // Extract values from step 1 modal fields
            const claimTimeoutStr = interaction.fields.getTextInputValue('claimTimeoutInput');
            const writingTimeoutStr = interaction.fields.getTextInputValue('writingTimeoutInput');
            const drawingTimeoutStr = interaction.fields.getTextInputValue('drawingTimeoutInput');
            const minPlayersStr = interaction.fields.getTextInputValue('minPlayersInput');
            const maxPlayersStr = interaction.fields.getTextInputValue('maxPlayersInput');

            // Validate numeric inputs
            const minPlayers = parseInt(minPlayersStr);
            if (isNaN(minPlayers) || minPlayers < 1) {
                await interaction.reply({ content: 'Minimum players must be a positive number.', ephemeral: true });
                return;
            }

            const maxPlayers = parseInt(maxPlayersStr);
            if (isNaN(maxPlayers) || maxPlayers < 1) {
                await interaction.reply({ content: 'Maximum players must be a positive number.', ephemeral: true });
                return;
            }

            if (maxPlayers <= minPlayers) {
                await interaction.reply({ content: 'Maximum players must be greater than minimum players.', ephemeral: true });
                return;
            }

            // Store step 1 data
            const step1Data = {
                claimTimeout: claimTimeoutStr,
                writingTimeout: writingTimeoutStr,
                drawingTimeout: drawingTimeoutStr,
                minPlayers: minPlayers,
                maxPlayers: maxPlayers
            };

            seasonConfigState.set(userId, step1Data);

            // Create button to proceed to step 2
            const continueButton = new ButtonBuilder()
                .setCustomId(`season_config_continue_${userId}`)
                .setLabel('Continue to Advanced Settings')
                .setStyle(ButtonStyle.Primary);

            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(continueButton);

            await interaction.reply({
                content: `**Step 1 Complete!** Basic settings saved:\n\n` +
                        `• Claim Timeout: ${step1Data.claimTimeout}\n` +
                        `• Writing Timeout: ${step1Data.writingTimeout}\n` +
                        `• Drawing Timeout: ${step1Data.drawingTimeout}\n` +
                        `• Min Players: ${step1Data.minPlayers}\n` +
                        `• Max Players: ${step1Data.maxPlayers}\n\n` +
                        `Click the button below to configure advanced settings.`,
                components: [actionRow],
                ephemeral: true
            });

        } catch (error) {
            Logger.error('Error handling admin season config step 1 modal:', error);
            seasonConfigState.delete(userId); // Clean up state on error
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
            const step1Data = seasonConfigState.get(userId);
            if (!step1Data) {
                await interaction.reply({ 
                    content: 'Configuration session expired. Please start over with `/admin season config`.', 
                    ephemeral: true 
                });
                return;
            }

            // Extract values from step 2 modal fields
            const turnPattern = interaction.fields.getTextInputValue('turnPatternInput');
            const openDuration = interaction.fields.getTextInputValue('openDurationInput');
            const claimWarning = interaction.fields.getTextInputValue('claimWarningInput');
            const writingWarning = interaction.fields.getTextInputValue('writingWarningInput');
            const drawingWarning = interaction.fields.getTextInputValue('drawingWarningInput');

            // Combine step 1 and step 2 data
            const completeConfig = {
                ...step1Data,
                turnPattern: turnPattern,
                openDuration: openDuration,
                claimWarning: claimWarning,
                writingWarning: writingWarning,
                drawingWarning: drawingWarning
            };

            // Update season configuration
            const configService = new ConfigService(prisma);
            await configService.updateGuildDefaultConfig(interaction.guild.id, completeConfig);

            // Clean up state
            seasonConfigState.delete(userId);

            await interaction.reply({
                content: `Season configuration updated successfully!\n\n` +
                        `**Basic Settings:**\n` +
                        `• Claim Timeout: ${completeConfig.claimTimeout}\n` +
                        `• Writing Timeout: ${completeConfig.writingTimeout}\n` +
                        `• Drawing Timeout: ${completeConfig.drawingTimeout}\n` +
                        `• Min Players: ${completeConfig.minPlayers}\n` +
                        `• Max Players: ${completeConfig.maxPlayers}\n\n` +
                        `**Advanced Settings:**\n` +
                        `• Turn Pattern: ${completeConfig.turnPattern}\n` +
                        `• Open Duration: ${completeConfig.openDuration}\n` +
                        `• Claim Warning: ${completeConfig.claimWarning}\n` +
                        `• Writing Warning: ${completeConfig.writingWarning}\n` +
                        `• Drawing Warning: ${completeConfig.drawingWarning}`,
                ephemeral: true
            });

            Logger.info(`Season config updated for guild ${interaction.guild.id} by ${interaction.user.tag}`);
        } catch (error) {
            Logger.error('Error handling admin season config step 2 modal:', error);
            seasonConfigState.delete(userId); // Clean up state on error
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