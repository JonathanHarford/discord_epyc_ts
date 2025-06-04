import { ChannelSelectMenuInteraction } from 'discord.js';

import prisma from '../lib/prisma.js';
import { ChannelConfigService } from '../services/ChannelConfigService.js';
import { Logger } from '../services/logger.js';

export class AdminChannelConfigSelectHandler {
    customIdPrefix = 'admin_channel_config';

    public async execute(interaction: ChannelSelectMenuInteraction): Promise<void> {
        if (!interaction.guild) {
            await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            return;
        }

        try {
            const customId = interaction.customId;
            const selectedChannelId = interaction.values[0]; // Get the first (and only) selected channel

            // Determine which channel type is being configured
            let channelType: 'announce' | 'completed' | 'admin';
            if (customId.endsWith('_announce')) {
                channelType = 'announce';
            } else if (customId.endsWith('_completed')) {
                channelType = 'completed';
            } else if (customId.endsWith('_admin')) {
                channelType = 'admin';
            } else {
                await interaction.reply({ content: 'Invalid channel configuration type.', ephemeral: true });
                return;
            }

            // Get current configuration
            const channelConfigService = new ChannelConfigService(prisma);

            // Prepare update object
            const updateData: { [key: string]: string | null } = {};
            updateData[`${channelType}ChannelId`] = selectedChannelId;

            // Update channel configuration
            await channelConfigService.updateGuildChannelConfig(interaction.guild.id, updateData);

            // Get the updated configuration for display
            const updatedConfig = await channelConfigService.getGuildChannelConfig(interaction.guild.id);

            const channelTypeDisplayName = channelType.charAt(0).toUpperCase() + channelType.slice(1);
            
            await interaction.reply({
                content: `${channelTypeDisplayName} channel updated successfully to <#${selectedChannelId}>!\n\n` +
                        `**Current Configuration:**\n` +
                        `• Announce Channel: ${updatedConfig?.announceChannelId ? `<#${updatedConfig.announceChannelId}>` : 'Not set'}\n` +
                        `• Completed Channel: ${updatedConfig?.completedChannelId ? `<#${updatedConfig.completedChannelId}>` : 'Not set'}\n` +
                        `• Admin Channel: ${updatedConfig?.adminChannelId ? `<#${updatedConfig.adminChannelId}>` : 'Not set'}`,
                ephemeral: true
            });

            Logger.info(`${channelTypeDisplayName} channel config updated for guild ${interaction.guild.id} by ${interaction.user.tag} to channel ${selectedChannelId}`);
        } catch (error) {
            Logger.error('Error handling admin channel config select:', error);
            await interaction.reply({
                content: 'An error occurred while updating the channel configuration.',
                ephemeral: true
            });
        }
    }
}

// Export the function for backward compatibility
export async function handleAdminChannelConfigSelect(interaction: ChannelSelectMenuInteraction): Promise<void> {
    const handler = new AdminChannelConfigSelectHandler();
    await handler.execute(interaction);
} 