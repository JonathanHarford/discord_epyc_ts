import { 
    ChatInputCommandInteraction, 
    PermissionsString, 
    PermissionFlagsBits,
    ChannelType, 
    GuildChannel,
    TextChannel
} from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';

import { DatabaseService } from '../../database/index.js';
import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { Lang, Logger } from '../../services/index.js';
import { InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

export class ConfigCommand implements Command {
    
    public names = [Lang.getRef('chatCommands.config', Language.Default)];
    public cooldown = new RateLimiter(1, 10000);
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = [];
    
    private dbService: DatabaseService;

    constructor() {
        this.dbService = new DatabaseService();
    }

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        Logger.info(`Config command executed by ${intr.user.username} in ${intr.guild?.name}`);
        // Can only be used in a server
        if (!intr.guild) {
            await InteractionUtils.send(
                intr, 
                'This command can only be used in a server.'
            );
            return;
        }

        // Check if user has administrator permission
        if (!intr.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await InteractionUtils.send(
                intr,
                'You need administrator permissions to use this command.'
            );
            return;
        }
        
        try {
            // Get the subcommand
            const subcommand = intr.options.getSubcommand();
            Logger.info(`Subcommand: ${subcommand}`);
            // Handle the 'channels' subcommand
            if (subcommand === 'channels') {
                await this.handleChannelsConfig(intr);
            } else {
                await InteractionUtils.send(
                    intr,
                    'Unknown configuration option.'
                );
            }
        } catch (error) {
            await InteractionUtils.send(
                intr,
                'An error occurred while configuring the server. Please try again later.'
            );
            console.error('Error in ConfigCommand:', error);
        }
    }

    /**
     * Handle the channels configuration subcommand
     */
    private async handleChannelsConfig(intr: ChatInputCommandInteraction): Promise<void> {
        // Get channel options
        const announcementChannel = intr.options.getChannel('announcement');
        const completedChannel = intr.options.getChannel('completed_channel');
        const adminChannel = intr.options.getChannel('admin_channel');
        
        // Get string options - these are the "None" options
        const completedOption = intr.options.getString('completed');
        const adminOption = intr.options.getString('admin');
        
        // If no options were provided, show current configuration
        if (!announcementChannel && !completedChannel && !adminChannel && 
            !completedOption && !adminOption) {
            await this.showCurrentChannelConfig(intr);
            return;
        }
        
        // Validate channels are text channels
        if (
            (announcementChannel && announcementChannel.type !== ChannelType.GuildText) ||
            (completedChannel && completedChannel.type !== ChannelType.GuildText) ||
            (adminChannel && adminChannel.type !== ChannelType.GuildText)
        ) {
            await InteractionUtils.send(
                intr,
                'All channels must be text channels.'
            );
            return;
        }
        
        // Validate bot permissions in channels
        const channelsToCheck = [
            announcementChannel, 
            completedChannel, 
            adminChannel
        ].filter(channel => channel !== null) as GuildChannel[];
        
        const missingPermissions = await this.checkBotPermissions(channelsToCheck, intr);
        if (missingPermissions.length > 0) {
            await InteractionUtils.send(
                intr,
                `I don't have the required permissions in ${missingPermissions.join(', ')}. ` +
                'Please make sure I have "View Channel" and "Send Messages" permissions in these channels.'
            );
            return;
        }
        
        // Get server settings or initialize if they don't exist
        let server = await this.dbService.servers.getServer(intr.guild.id);
        if (!server) {
            // Initialize with default server settings
            await this.dbService.servers.initializeServerSettings(
                intr.guild.id,
                intr.guild.name,
                announcementChannel?.id || intr.channelId
            );
            
            server = await this.dbService.servers.getServer(intr.guild.id);
        }
        
        // Get current server settings
        const serverSettings = await this.dbService.servers.getServerSettings(intr.guild.id);
        
        // Prepare channel config update
        const channelConfig: any = {};
        
        // Handle announcement channel
        const announcementChannelId = announcementChannel?.id || serverSettings.announcementChannelId || intr.channelId;
        channelConfig.announcementChannelId = announcementChannelId;
        
        // Handle completed channel - explicit 'none' sets to null, an explicit channel value sets to that value,
        // otherwise use the announcement channel as default
        if (completedChannel) {
            channelConfig.completedChannelId = completedChannel.id;
        } else if (completedOption === 'none') {
            channelConfig.completedChannelId = null;
        } else if (!serverSettings.completedChannelId) {
            // Only set default if no previous value exists
            channelConfig.completedChannelId = announcementChannelId;
        }
        
        // Handle admin channel - explicit 'none' sets to null, an explicit channel value sets to that value,
        // otherwise use the announcement channel as default
        if (adminChannel) {
            channelConfig.adminChannelId = adminChannel.id;
        } else if (adminOption === 'none') {
            channelConfig.adminChannelId = null;
        } else if (!serverSettings.adminChannelId) {
            // Only set default if no previous value exists
            channelConfig.adminChannelId = announcementChannelId;
        }
        
        // Update server settings
        await this.dbService.servers.updateChannelConfig(intr.guild.id, channelConfig);
        
        // Respond with success message
        await InteractionUtils.send(
            intr,
            '✅ Server channel configuration updated successfully!'
        );
    }
    
    /**
     * Show the current channel configuration
     */
    private async showCurrentChannelConfig(intr: ChatInputCommandInteraction): Promise<void> {
        // Get server settings
        const serverSettings = await this.dbService.servers.getServerSettings(intr.guild!.id);
        
        if (!serverSettings) {
            await InteractionUtils.send(
                intr,
                'Server settings have not been configured yet. Use `/config channels` to set up channel configuration.'
            );
            return;
        }
        
        // Build the response message
        let responseMessage = '**Current Channel Configuration**\n\n';
        
        // Add announcement channel info
        const announcementChannel = intr.guild!.channels.cache.get(serverSettings.announcementChannelId);
        responseMessage += `**Announcement Channel**: ${announcementChannel ? `<#${announcementChannel.id}>` : 'Not set'}\n`;
        
        // Add completed channel info
        const completedChannel = serverSettings.completedChannelId ? 
            intr.guild!.channels.cache.get(serverSettings.completedChannelId) : null;
        responseMessage += `**Completed Games Channel**: ${completedChannel ? `<#${completedChannel.id}>` : 'Not set'}\n`;
        
        // Add admin channel info
        const adminChannel = serverSettings.adminChannelId ? 
            intr.guild!.channels.cache.get(serverSettings.adminChannelId) : null;
        responseMessage += `**Admin Notifications Channel**: ${adminChannel ? `<#${adminChannel.id}>` : 'Not set'}\n`;
        
        // Add usage help
        responseMessage += '\nUse `/config channels` with channel options to update configuration.';
        responseMessage += '\nTo remove an optional channel, use the "None" option.';
        
        await InteractionUtils.send(intr, responseMessage);
    }
    
    /**
     * Check if the bot has necessary permissions in the provided channels
     */
    private async checkBotPermissions(
        channels: GuildChannel[],
        intr: ChatInputCommandInteraction
    ): Promise<string[]> {
        const missingPermissions: string[] = [];
        
        for (const channel of channels) {
            const permissions = channel.permissionsFor(intr.guild!.members.me!);
            
            if (!permissions?.has(['ViewChannel', 'SendMessages'])) {
                missingPermissions.push(`<#${channel.id}>`);
            }
        }
        
        return missingPermissions;
    }
} 