import { ButtonInteraction } from 'discord.js';

import { gameConfigState } from './adminGameConfigModalHandler.js';
import { ButtonHandler } from './buttonHandler.js';
import prisma from '../lib/prisma.js';
import { GameConfigService } from '../services/GameConfigService.js';
import { Logger } from '../services/logger.js';
import { createAdminGameConfigStep2Modal } from '../utils/modalBuilders.js';

export class AdminGameConfigButtonHandler implements ButtonHandler {
    customIdPrefix = 'game_config_continue_';

    public async execute(interaction: ButtonInteraction): Promise<void> {
        if (!interaction.guild) {
            await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            return;
        }

        try {
            // Extract user ID from custom ID
            const userId = interaction.customId.replace('game_config_continue_', '');
            
            // Verify this is the same user who started the configuration
            if (interaction.user.id !== userId) {
                await interaction.reply({ 
                    content: 'You can only continue your own configuration session.', 
                    ephemeral: true 
                });
                return;
            }

            // Check if step 1 data exists
            const step1Data = gameConfigState.get(userId);
            if (!step1Data) {
                await interaction.reply({ 
                    content: 'Configuration session expired. Please start over with `/admin game config`.', 
                    ephemeral: true 
                });
                return;
            }

            // Get current configuration to pre-populate step 2 modal
            const gameConfigService = new GameConfigService(prisma);
            const currentConfig = await gameConfigService.getGuildDefaultConfig(interaction.guild.id);

            // Show step 2 modal
            const step2Modal = createAdminGameConfigStep2Modal(currentConfig);
            await interaction.showModal(step2Modal);

        } catch (error) {
            Logger.error('Error handling admin game config continue button:', error);
            await interaction.reply({
                content: 'An error occurred while opening the advanced settings modal.',
                ephemeral: true
            });
        }
    }
} 