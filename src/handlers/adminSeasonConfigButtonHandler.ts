import { ButtonInteraction } from 'discord.js';

import { seasonConfigState } from './adminSeasonConfigModalHandler.js';
import { ButtonHandler } from './buttonHandler.js';
import prisma from '../lib/prisma.js';
import { ConfigService } from '../services/ConfigService.js';
import { Logger } from '../services/logger.js';
import { createAdminSeasonConfigStep2Modal } from '../utils/modalBuilders.js';

export class AdminSeasonConfigButtonHandler implements ButtonHandler {
    customIdPrefix = 'season_config_continue_';

    public async execute(interaction: ButtonInteraction): Promise<void> {
        if (!interaction.guild) {
            await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            return;
        }

        try {
            // Extract user ID from custom ID
            const userId = interaction.customId.replace('season_config_continue_', '');
            
            // Verify this is the same user who started the configuration
            if (interaction.user.id !== userId) {
                await interaction.reply({ 
                    content: 'You can only continue your own configuration session.', 
                    ephemeral: true 
                });
                return;
            }

            // Check if step 1 data exists
            const step1Data = seasonConfigState.get(userId);
            if (!step1Data) {
                await interaction.reply({ 
                    content: 'Configuration session expired. Please start over with `/admin season config`.', 
                    ephemeral: true 
                });
                return;
            }

            // Get current configuration to pre-populate step 2 modal
            const configService = new ConfigService(prisma);
            const currentConfig = await configService.getGuildDefaultConfig(interaction.guild.id);

            // Show step 2 modal
            const step2Modal = createAdminSeasonConfigStep2Modal(currentConfig);
            await interaction.showModal(step2Modal);

        } catch (error) {
            Logger.error('Error handling admin season config continue button:', error);
            await interaction.reply({
                content: 'An error occurred while opening the advanced settings modal.',
                ephemeral: true
            });
        }
    }
} 