import { ModalSubmitInteraction } from 'discord.js';

import { ModalHandler } from './modalHandler.js';
import prisma from '../lib/prisma.js';
import { ChannelConfigService } from '../services/ChannelConfigService.js';
import { Logger } from '../services/logger.js';

export class AdminChannelConfigModalHandler implements ModalHandler {
    customIdPrefix = 'admin_channel_config';

    public async execute(interaction: ModalSubmitInteraction): Promise<void> {
        if (!interaction.guild) {
            await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            return;
        }

        try {
            // Extract values from modal fields
            const announceChannelId = interaction.fields.getTextInputValue('announce_channel');
            const completedChannelId = interaction.fields.getTextInputValue('completed_channel');
            const adminChannelId = interaction.fields.getTextInputValue('admin_channel');

            // Validate channel IDs (basic validation - should be snowflake IDs)
            const channelIdRegex = /^\d{17,19}$/;
            
            if (announceChannelId && !channelIdRegex.test(announceChannelId)) {
                await interaction.reply({ content: 'Announce channel ID must be a valid Discord channel ID.', ephemeral: true });
                return;
            }
            if (completedChannelId && !channelIdRegex.test(completedChannelId)) {
                await interaction.reply({ content: 'Completed channel ID must be a valid Discord channel ID.', ephemeral: true });
                return;
            }
            if (adminChannelId && !channelIdRegex.test(adminChannelId)) {
                await interaction.reply({ content: 'Admin channel ID must be a valid Discord channel ID.', ephemeral: true });
                return;
            }

            // Update channel configuration
            const channelConfigService = new ChannelConfigService(prisma);
            await channelConfigService.updateGuildChannelConfig(interaction.guild.id, {
                announceChannelId: announceChannelId || null,
                completedChannelId: completedChannelId || null,
                adminChannelId: adminChannelId || null
            });

            await interaction.reply({
                content: `Channel configuration updated successfully!\n` +
                        `Announce Channel: ${announceChannelId ? `<#${announceChannelId}>` : 'Not set'}\n` +
                        `Completed Channel: ${completedChannelId ? `<#${completedChannelId}>` : 'Not set'}\n` +
                        `Admin Channel: ${adminChannelId ? `<#${adminChannelId}>` : 'Not set'}`,
                ephemeral: true
            });

            Logger.info(`Channel config updated for guild ${interaction.guild.id} by ${interaction.user.tag}`);
        } catch (error) {
            Logger.error('Error handling admin channel config modal:', error);
            await interaction.reply({
                content: 'An error occurred while updating the channel configuration.',
                ephemeral: true
            });
        }
    }
}

// Export the function for backward compatibility
export async function handleAdminChannelConfigModal(interaction: ModalSubmitInteraction): Promise<void> {
    const handler = new AdminChannelConfigModalHandler();
    await handler.execute(interaction);
} 