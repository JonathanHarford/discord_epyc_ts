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
import { ConfigService, Lang, Logger } from '../../services/index.js';
import { 
    InteractionUtils, 
    formatReturnsForDisplay,
    DurationUtils
} from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

export class ConfigCommand implements Command {
    
    public names = [Lang.getRef('chatCommands.config', Language.Default)];
    public cooldown = new RateLimiter(1, 10000);
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = [];
    
    private dbService: DatabaseService;
    private configService: ConfigService;

    constructor() {
        this.dbService = new DatabaseService();
        this.configService = new ConfigService();
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
            
            // Handle the subcommands
            if (subcommand === 'channels') {
                await this.handleChannelsConfig(intr);
            } else if (subcommand === 'games') {
                await this.handleGamesConfig(intr);
            } else if (subcommand === 'seasons') {
                await this.handleSeasonsConfig(intr);
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
     * Handle the games configuration subcommand
     */
    private async handleGamesConfig(intr: ChatInputCommandInteraction): Promise<void> {
        // Get game settings options
        const turnPattern = intr.options.getString('turn_pattern');
        const writingTimeout = intr.options.getString('writing_timeout');
        const writingWarning = intr.options.getString('writing_warning');
        const drawingTimeout = intr.options.getString('drawing_timeout');
        const drawingWarning = intr.options.getString('drawing_warning');
        const staleTimeout = intr.options.getString('stale_timeout');
        const minTurns = intr.options.getInteger('min_turns');
        const maxTurns = intr.options.getInteger('max_turns');
        const returns = intr.options.getString('returns');
        
        // If no options were provided, show current configuration
        if (!turnPattern && !writingTimeout && !writingWarning && !drawingTimeout && 
            !drawingWarning && !staleTimeout && minTurns === null && maxTurns === null && !returns) {
            await this.showCurrentGameSettings(intr);
            return;
        }
        
        // Create an input object with game settings
        const gameSettings = {
            turnPattern,
            writingTimeout,
            writingWarning,
            drawingTimeout,
            drawingWarning,
            staleTimeout,
            minTurns: minTurns !== null ? minTurns : undefined,
            maxTurns: maxTurns !== null ? maxTurns : undefined,
            returns
        };
        
        // Use ConfigService to get or initialize server settings
        await this.configService.getOrInitializeServerSettings(
            intr.guild.id,
            intr.guild.name,
            intr.channelId,
            this.dbService
        );
        
        // Update game settings using ConfigService
        const result = await this.configService.updateGameSettings(
            intr.guild.id,
            gameSettings,
            this.dbService
        );
        
        // Handle result
        if (!result.success) {
            if (result.validationErrors) {
                await InteractionUtils.send(
                    intr,
                    `❌ Validation failed:\n${result.validationErrors.map(error => `• ${error}`).join('\n')}`
                );
            } else {
                await InteractionUtils.send(
                    intr,
                    `❌ ${result.error || 'An error occurred while updating game settings.'}`
                );
            }
            return;
        }
        
        // Success message
        await InteractionUtils.send(
            intr,
            '✅ Default game settings updated successfully! Use `/config games` to see the current configuration.'
        );
    }

    /**
     * Show the current game settings
     */
    private async showCurrentGameSettings(intr: ChatInputCommandInteraction): Promise<void> {
        // Get game settings using ConfigService
        const result = await this.configService.getGameSettings(intr.guild!.id, this.dbService);
        
        if (!result.success || !result.settings) {
            await InteractionUtils.send(
                intr,
                'Server game settings have not been configured yet. Use `/config games` with parameters to set up game configuration.'
            );
            return;
        }
        
        const gameSettings = result.settings;
        
        // Build the response message
        let responseMessage = '**Default Game Settings**\n\n';
        
        // Format turn pattern
        const turnPatternDisplay = gameSettings.turnPattern === 'drawing,writing' ? 
            'Drawing → Writing' : 'Writing → Drawing';
        responseMessage += `**Turn Pattern**: ${turnPatternDisplay}\n`;
        
        // Helper function to get string or default
        const getStringOrDefault = (value: any): string => {
            if (value === undefined || value === null) {
                return '0s';
            }
            return value;
        };
        
        // Format timeouts and warnings - these are already strings in the correct format
        responseMessage += `**Writing Timeout**: ${getStringOrDefault(gameSettings.writingTimeout)}\n`;
        responseMessage += `**Writing Warning**: ${getStringOrDefault(gameSettings.writingWarning)}\n`;
        responseMessage += `**Drawing Timeout**: ${getStringOrDefault(gameSettings.drawingTimeout)}\n`;
        responseMessage += `**Drawing Warning**: ${getStringOrDefault(gameSettings.drawingWarning)}\n`;
        responseMessage += `**Stale Timeout**: ${getStringOrDefault(gameSettings.staleTimeout)}\n`;
        
        // Format turn limits
        responseMessage += `**Minimum Turns**: ${gameSettings.minTurns}\n`;
        responseMessage += `**Maximum Turns**: ${gameSettings.maxTurns || 'No limit'}\n`;
        
        // Format returns policy
        responseMessage += `**Returns Policy**: ${formatReturnsForDisplay(gameSettings.returns)}\n`;
        
        // Add usage help
        responseMessage += '\nUse `/config games` with parameters to update game settings.';
        
        await InteractionUtils.send(intr, responseMessage);
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
        
        // Create map of guild channels with their types for validation
        const guildChannels = new Map<string, { type: number }>();
        intr.guild!.channels.cache.forEach(channel => {
            guildChannels.set(channel.id, { type: channel.type });
        });
        
        // Prepare channel config to update
        const channelConfig: any = {};
        
        // Handle announcement channel
        if (announcementChannel) {
            channelConfig.announcementChannelId = announcementChannel.id;
        }
        
        // Handle completed channel - explicit 'none' sets to null, an explicit channel value sets to that value
        if (completedChannel) {
            channelConfig.completedChannelId = completedChannel.id;
        } else if (completedOption === 'none') {
            channelConfig.completedChannelId = null;
        }
        
        // Handle admin channel - explicit 'none' sets to null, an explicit channel value sets to that value
        if (adminChannel) {
            channelConfig.adminChannelId = adminChannel.id;
        } else if (adminOption === 'none') {
            channelConfig.adminChannelId = null;
        }
        
        // Use ConfigService to get or initialize server settings
        await this.configService.getOrInitializeServerSettings(
            intr.guild!.id,
            intr.guild!.name,
            announcementChannel?.id || intr.channelId,
            this.dbService
        );
        
        // Validate and update channel configuration
        const result = await this.configService.updateChannelConfig(
            intr.guild!.id,
            channelConfig,
            guildChannels,
            this.dbService
        );
        
        // Handle result
        if (!result.success) {
            if (result.validationErrors) {
                await InteractionUtils.send(
                    intr,
                    `❌ Validation failed:\n${result.validationErrors.map(error => `• ${error}`).join('\n')}`
                );
            } else {
                await InteractionUtils.send(
                    intr,
                    `❌ ${result.error || 'An error occurred while updating channel configuration.'}`
                );
            }
            return;
        }
        
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
        const result = await this.configService.getServerSettings(intr.guild!.id, this.dbService);
        
        if (!result.success || !result.settings) {
            await InteractionUtils.send(
                intr,
                'Server settings have not been configured yet. Use `/config channels` to set up channel configuration.'
            );
            return;
        }
        
        const serverSettings = result.settings;
        
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

    /**
     * Handle the seasons configuration subcommand
     */
    private async handleSeasonsConfig(intr: ChatInputCommandInteraction): Promise<void> {
        // Get season settings options
        const openDuration = intr.options.getString('open_duration');
        const minPlayers = intr.options.getInteger('min_players');
        const maxPlayers = intr.options.getInteger('max_players');
        
        // If no options were provided, show current configuration
        if (!openDuration && minPlayers === null && maxPlayers === null) {
            await this.showCurrentSeasonSettings(intr);
            return;
        }
        
        // Create an input object with season settings
        const seasonSettings = {
            openDuration,
            minPlayers: minPlayers !== null ? minPlayers : undefined,
            maxPlayers: maxPlayers !== null ? maxPlayers : undefined
        };
        
        // Use ConfigService to get or initialize server settings
        await this.configService.getOrInitializeServerSettings(
            intr.guild!.id,
            intr.guild!.name,
            intr.channelId,
            this.dbService
        );
        
        // Update season settings using ConfigService
        const result = await this.configService.updateSeasonSettings(
            intr.guild!.id,
            seasonSettings,
            this.dbService
        );
        
        // Handle result
        if (!result.success) {
            if (result.validationErrors) {
                await InteractionUtils.send(
                    intr,
                    `❌ Validation failed:\n${result.validationErrors.map(error => `• ${error}`).join('\n')}`
                );
            } else {
                await InteractionUtils.send(
                    intr,
                    `❌ ${result.error || 'An error occurred while updating season settings.'}`
                );
            }
            return;
        }
        
        // Success message with updated settings
        const formattedSettings = this.formatSeasonSettings(result.settings);
        await InteractionUtils.send(
            intr,
            `✅ Server default season settings updated!\n\n${formattedSettings}`
        );
    }

    /**
     * Format season settings for display
     */
    private formatSeasonSettings(settings: any): string {
        let formattedSettings = '**Default season settings:**\n';
        
        if (settings.openDuration) {
            formattedSettings += `open_duration: ${settings.openDuration}\n`;
        }
        
        if (settings.minPlayers !== undefined) {
            formattedSettings += `min_players: ${settings.minPlayers}\n`;
        }
        
        if (settings.maxPlayers !== undefined && settings.maxPlayers !== null) {
            formattedSettings += `max_players: ${settings.maxPlayers}\n`;
        } else {
            formattedSettings += `max_players: none\n`;
        }
        
        return formattedSettings;
    }

    /**
     * Show current season settings
     */
    private async showCurrentSeasonSettings(intr: ChatInputCommandInteraction): Promise<void> {
        // Get season settings using ConfigService
        const result = await this.configService.getSeasonSettings(intr.guild!.id, this.dbService);
        
        if (!result.success || !result.settings) {
            await InteractionUtils.send(
                intr,
                'No server settings found. Please configure your server first.'
            );
            return;
        }
        
        // Format settings for display
        const formattedSettings = this.formatSeasonSettings(result.settings);
        
        // Send the formatted settings
        await InteractionUtils.send(
            intr,
            formattedSettings
        );
    }
} 