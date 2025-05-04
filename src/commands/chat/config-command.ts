import { 
    ChatInputCommandInteraction, 
    PermissionsString, 
    PermissionFlagsBits,
    ChannelType, 
    GuildChannel,
    TextChannel
} from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';
import { z } from 'zod';

import { DatabaseService } from '../../database/index.js';
import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { Lang, Logger } from '../../services/index.js';
import { 
    InteractionUtils, 
    formatReturnsForDisplay,
    durationStringSchema,
    turnPatternSchema,
    returnsSchema,
    DurationUtils
} from '../../utils/index.js';
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
            
            // Handle the subcommands
            if (subcommand === 'channels') {
                await this.handleChannelsConfig(intr);
            } else if (subcommand === 'games') {
                await this.handleGamesConfig(intr);
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
        
        // Get server settings or initialize if they don't exist
        let server = await this.dbService.servers.getServer(intr.guild.id);
        if (!server) {
            // Initialize with default server settings
            await this.dbService.servers.initializeServerSettings(
                intr.guild.id,
                intr.guild.name,
                intr.channelId
            );
            
            server = await this.dbService.servers.getServer(intr.guild.id);
        }
        
        // Get current server settings
        const serverSettings = await this.dbService.servers.getServerSettings(intr.guild.id);
        
        if (!serverSettings) {
            await InteractionUtils.send(
                intr,
                'Server settings not found. Please try again later.'
            );
            return;
        }
        
        // Create a Zod schema for validating all game settings
        const gameSettingsSchema = z.object({
            turnPattern: turnPatternSchema.optional(),
            writingTimeout: durationStringSchema.optional(),
            writingWarning: durationStringSchema.optional(),
            drawingTimeout: durationStringSchema.optional(),
            drawingWarning: durationStringSchema.optional(),
            staleTimeout: durationStringSchema.optional(),
            returns: returnsSchema.optional(),
            minTurns: z.number().int().min(4, { message: 'Minimum turns must be at least 4.' }).optional(),
            maxTurns: z.number().int().optional()
        }).refine(data => {
            // Skip validation if both are undefined
            if (data.minTurns === undefined || data.maxTurns === undefined) {
                return true;
            }
            return data.maxTurns > data.minTurns;
        }, {
            message: 'Maximum turns must be greater than minimum turns.',
            path: ['maxTurns']
        });
        
        // Create an input object from the command options
        const input: Record<string, any> = {};
        
        if (turnPattern) input.turnPattern = turnPattern;
        if (writingTimeout) input.writingTimeout = writingTimeout;
        if (writingWarning) input.writingWarning = writingWarning;
        if (drawingTimeout) input.drawingTimeout = drawingTimeout;
        if (drawingWarning) input.drawingWarning = drawingWarning;
        if (staleTimeout) input.staleTimeout = staleTimeout;
        if (returns) input.returns = returns;
        if (minTurns !== null) input.minTurns = minTurns;
        if (maxTurns !== null) input.maxTurns = maxTurns;
        
        // Validate all inputs with Zod
        const validationResult = gameSettingsSchema.safeParse(input);
        
        // Handle validation failures
        if (!validationResult.success) {
            const errors = validationResult.error.format();
            const errorMessages: string[] = [];
            
            // Extract error messages
            for (const [key, value] of Object.entries(errors)) {
                if (key === '_errors') continue;
                
                // Add the specific field error
                if (value && typeof value === 'object' && '_errors' in value && Array.isArray(value._errors) && value._errors.length > 0) {
                    let fieldName = key;
                    
                    // Format field names for display
                    switch (key) {
                        case 'turnPattern': fieldName = 'Turn pattern'; break;
                        case 'writingTimeout': fieldName = 'Writing timeout'; break;
                        case 'writingWarning': fieldName = 'Writing warning'; break;
                        case 'drawingTimeout': fieldName = 'Drawing timeout'; break;
                        case 'drawingWarning': fieldName = 'Drawing warning'; break;
                        case 'staleTimeout': fieldName = 'Stale timeout'; break;
                        case 'returns': fieldName = 'Returns'; break;
                        case 'minTurns': fieldName = 'Minimum turns'; break;
                        case 'maxTurns': fieldName = 'Maximum turns'; break;
                    }
                    
                    errorMessages.push(`${fieldName}: ${value._errors.join(', ')}`);
                }
            }
            
            // Add any top-level refinement errors
            if ('_errors' in errors && Array.isArray(errors._errors) && errors._errors.length > 0) {
                errorMessages.push(...errors._errors);
            }
            
            await InteractionUtils.send(
                intr,
                `❌ Validation failed:\n${errorMessages.map(error => `• ${error}`).join('\n')}`
            );
            return;
        }
        
        // At this point validation has passed
        // Prepare game settings update
        const gameSettings: any = {};
        const validatedData = validationResult.data;
        
        // Add validated values to game settings
        if (validatedData.turnPattern) {
            gameSettings.turnPattern = validatedData.turnPattern;
        }
        
        if (validatedData.writingTimeout) {
            gameSettings.writingTimeout = validatedData.writingTimeout.value;
        }
        
        if (validatedData.writingWarning) {
            gameSettings.writingWarning = validatedData.writingWarning.value;
        }
        
        if (validatedData.drawingTimeout) {
            gameSettings.drawingTimeout = validatedData.drawingTimeout.value;
        }
        
        if (validatedData.drawingWarning) {
            gameSettings.drawingWarning = validatedData.drawingWarning.value;
        }
        
        if (validatedData.staleTimeout) {
            gameSettings.staleTimeout = validatedData.staleTimeout.value;
        }
        
        // Add integer values
        if (validatedData.minTurns !== undefined) {
            gameSettings.minTurns = validatedData.minTurns;
        }
        
        if (validatedData.maxTurns !== undefined) {
            gameSettings.maxTurns = validatedData.maxTurns;
        }
        
        // Handle returns - convert "none" to null
        if (validatedData.returns) {
            gameSettings.returns = validatedData.returns.toLowerCase() === 'none' ? null : validatedData.returns;
        }
        
        // Update game settings
        await this.dbService.servers.updateDefaultGameSettings(intr.guild.id, gameSettings);
        
        // Show updated settings
        await InteractionUtils.send(
            intr,
            '✅ Default game settings updated successfully! Use `/config games` to see the current configuration.'
        );
    }

    /**
     * Show the current game settings
     */
    private async showCurrentGameSettings(intr: ChatInputCommandInteraction): Promise<void> {
        // Get server settings
        const serverSettings = await this.dbService.servers.getServerSettings(intr.guild!.id);
        
        if (!serverSettings || !serverSettings.defaultGameSettings) {
            await InteractionUtils.send(
                intr,
                'Server game settings have not been configured yet. Use `/config games` with parameters to set up game configuration.'
            );
            return;
        }
        
        const gameSettings = serverSettings.defaultGameSettings;
        
        // Build the response message
        let responseMessage = '**Default Game Settings**\n\n';
        
        // Format turn pattern
        const turnPatternDisplay = gameSettings.turnPattern === 'drawing,writing' ? 
            'Drawing → Writing' : 'Writing → Drawing';
        responseMessage += `**Turn Pattern**: ${turnPatternDisplay}\n`;
        
        // Format timeouts and warnings
        responseMessage += `**Writing Timeout**: ${DurationUtils.generateDurationString(gameSettings.writingTimeout)}\n`;
        responseMessage += `**Writing Warning**: ${DurationUtils.generateDurationString(gameSettings.writingWarning)}\n`;
        responseMessage += `**Drawing Timeout**: ${DurationUtils.generateDurationString(gameSettings.drawingTimeout)}\n`;
        responseMessage += `**Drawing Warning**: ${DurationUtils.generateDurationString(gameSettings.drawingWarning)}\n`;
        responseMessage += `**Stale Timeout**: ${DurationUtils.generateDurationString(gameSettings.staleTimeout)}\n`;
        
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