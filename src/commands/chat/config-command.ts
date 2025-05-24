import { ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { createRequire } from 'node:module';

import { EventData } from '../../models/internal-models.js';
import { Command, CommandDeferType } from '../index.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { strings } from '../../lang/strings.js';
import { ConfigService, ConfigUpdateOptions } from '../../services/ConfigService.js';
import prisma from '../../lib/prisma.js';

const require = createRequire(import.meta.url);
let Config = require('../../../config/config.json');

export class ConfigCommand implements Command {
    public names = [strings.chatCommands.config];
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];

    private configService: ConfigService;

    constructor() {
        this.configService = new ConfigService(prisma);
    }

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        // Check if user has admin permissions (using developers array for now)
        if (!Config.developers.includes(intr.user.id)) {
            await SimpleMessage.sendWarning(intr, strings.messages.admin.notAdmin, {}, true);
            return;
        }

        const subcommandGroup = intr.options.getSubcommandGroup();
        
        if (subcommandGroup === 'seasons') {
            await this.handleSeasonsCommand(intr, data);
        } else {
            await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.notImplemented, {}, true, 'warning');
        }
    }

    private async handleSeasonsCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const subcommand = intr.options.getSubcommand();
        
        switch (subcommand) {
            case 'view': {
                await this.handleViewCommand(intr, data);
                break;
            }
            case 'set': {
                await this.handleSetCommand(intr, data);
                break;
            }
            default: {
                await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.notImplemented, {}, true, 'warning');
                return;
            }
        }
    }

    private async handleViewCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        try {
            const guildId = intr.guild?.id;
            if (!guildId) {
                await SimpleMessage.sendError(intr, "This command can only be used in a server.", {}, true);
                return;
            }

            const config = await this.configService.getGuildDefaultConfig(guildId);
            const formattedConfig = this.configService.formatConfigForDisplay(config);

            await SimpleMessage.sendEmbed(intr, strings.embeds.configView, {
                GUILD_ID: guildId,
                TURN_PATTERN: formattedConfig.turnPattern,
                CLAIM_TIMEOUT: formattedConfig.claimTimeout,
                WRITING_TIMEOUT: formattedConfig.writingTimeout,
                WRITING_WARNING: formattedConfig.writingWarning,
                DRAWING_TIMEOUT: formattedConfig.drawingTimeout,
                DRAWING_WARNING: formattedConfig.drawingWarning,
                OPEN_DURATION: formattedConfig.openDuration,
                MIN_PLAYERS: formattedConfig.minPlayers,
                MAX_PLAYERS: formattedConfig.maxPlayers,
                IS_GUILD_DEFAULT: formattedConfig.isGuildDefault,
                LAST_UPDATED: formattedConfig.lastUpdated
            }, true, 'info');
        } catch (error) {
            console.error('Error in config seasons view command:', error);
            await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.command, {
                ERROR_CODE: 'CONFIG_VIEW_ERROR',
                GUILD_ID: intr.guild?.id ?? 'N/A',
                SHARD_ID: intr.guild?.shardId?.toString() ?? 'N/A'
            }, true, 'error');
        }
    }

    private async handleSetCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        try {
            const guildId = intr.guild?.id;
            if (!guildId) {
                await SimpleMessage.sendError(intr, "This command can only be used in a server.", {}, true);
                return;
            }

            // Extract all the configuration options from the interaction
            const updates: ConfigUpdateOptions = {};
            
            const turnPattern = intr.options.getString('turn_pattern');
            if (turnPattern) updates.turnPattern = turnPattern;
            
            const claimTimeout = intr.options.getString('claim_timeout');
            if (claimTimeout) updates.claimTimeout = claimTimeout;
            
            const writingTimeout = intr.options.getString('writing_timeout');
            if (writingTimeout) updates.writingTimeout = writingTimeout;
            
            const writingWarning = intr.options.getString('writing_warning');
            if (writingWarning) updates.writingWarning = writingWarning;
            
            const drawingTimeout = intr.options.getString('drawing_timeout');
            if (drawingTimeout) updates.drawingTimeout = drawingTimeout;
            
            const drawingWarning = intr.options.getString('drawing_warning');
            if (drawingWarning) updates.drawingWarning = drawingWarning;
            
            const openDuration = intr.options.getString('open_duration');
            if (openDuration) updates.openDuration = openDuration;
            
            const minPlayers = intr.options.getInteger('min_players');
            if (minPlayers !== null) updates.minPlayers = minPlayers;
            
            const maxPlayers = intr.options.getInteger('max_players');
            if (maxPlayers !== null) updates.maxPlayers = maxPlayers;

            // Check if any updates were provided
            if (Object.keys(updates).length === 0) {
                await SimpleMessage.sendWarning(intr, strings.messages.config.noUpdatesProvided, {}, true);
                return;
            }

            // Update the configuration
            const result = await this.configService.updateGuildDefaultConfig(guildId, updates);
            await this.handleMessageInstruction(result, intr);

        } catch (error) {
            console.error('Error in config seasons set command:', error);
            await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.command, {
                ERROR_CODE: 'CONFIG_SET_ERROR',
                GUILD_ID: intr.guild?.id ?? 'N/A',
                SHARD_ID: intr.guild?.shardId?.toString() ?? 'N/A'
            }, true, 'error');
        }
    }

    /**
     * Convert MessageInstruction to SimpleMessage call
     */
    private async handleMessageInstruction(instruction: any, intr: ChatInputCommandInteraction): Promise<void> {
        const ephemeral = instruction.formatting?.ephemeral ?? false;
        
        if (instruction.formatting?.embed) {
            const embedData = this.getEmbedFromKey(instruction.key);
            if (embedData) {
                await SimpleMessage.sendEmbed(intr, embedData, instruction.data, ephemeral, instruction.type);
            } else {
                const content = this.getStringFromKey(instruction.key, instruction.data);
                switch (instruction.type) {
                    case 'success':
                        await SimpleMessage.sendSuccess(intr, content, {}, ephemeral);
                        break;
                    case 'error':
                        await SimpleMessage.sendError(intr, content, {}, ephemeral);
                        break;
                    case 'warning':
                        await SimpleMessage.sendWarning(intr, content, {}, ephemeral);
                        break;
                    default:
                        await SimpleMessage.sendInfo(intr, content, {}, ephemeral);
                }
            }
        } else {
            const content = this.getStringFromKey(instruction.key, instruction.data);
            switch (instruction.type) {
                case 'success':
                    await SimpleMessage.sendSuccess(intr, content, {}, ephemeral);
                    break;
                case 'error':
                    await SimpleMessage.sendError(intr, content, {}, ephemeral);
                    break;
                case 'warning':
                    await SimpleMessage.sendWarning(intr, content, {}, ephemeral);
                    break;
                default:
                    await SimpleMessage.sendInfo(intr, content, {}, ephemeral);
            }
        }
    }

    private getEmbedFromKey(key: string): any {
        const parts = key.split('.');
        let current: any = strings.embeds;
        
        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return null;
            }
        }
        
        return current && typeof current === 'object' ? current : null;
    }

    private getStringFromKey(key: string, data?: Record<string, any>): string {
        const parts = key.split('.');
        let current: any = strings;
        
        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                console.warn(`String key not found: ${key}`);
                return `Missing string: ${key}`;
            }
        }
        
        const result = typeof current === 'string' ? current : JSON.stringify(current);
        return data ? result.replace(/\{(\w+)\}/g, (match, varKey) => {
            return data[varKey] !== undefined ? String(data[varKey]) : match;
        }) : result;
    }
} 