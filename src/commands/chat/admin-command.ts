import { ChatInputCommandInteraction, PermissionsString, SlashCommandBuilder } from 'discord.js';
import { createRequire } from 'node:module';

import { EventData } from '../../models/internal-models.js';
import { Command, CommandDeferType } from '../index.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { strings } from '../../lang/strings.js';
import { SeasonService } from '../../services/SeasonService.js';
import { TurnService } from '../../services/TurnService.js';
import { SchedulerService } from '../../services/SchedulerService.js';
import { PlayerService } from '../../services/PlayerService.js';
import prisma from '../../lib/prisma.js';

const require = createRequire(import.meta.url);
let Config = require('../../../config/config.json');

export class AdminCommand implements Command {
    public names = [strings.chatCommands.admin];
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];

    private seasonService: SeasonService;
    private playerService: PlayerService;

    constructor() {
        // Initialize services - TurnService needs DiscordClient which we'll get from the interaction
        // For now, we'll initialize SeasonService in the execute method where we have access to the client
        this.seasonService = null as any; // Temporary, will be initialized in execute
        this.playerService = new PlayerService(prisma);
    }

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        // Check if user has admin permissions (using developers array for now)
        if (!Config.developers.includes(intr.user.id)) {
            await SimpleMessage.sendWarning(intr, strings.messages.admin.notAdmin, {}, true);
            return;
        }

        // Initialize services with the Discord client from the interaction
        if (!this.seasonService) {
            const turnService = new TurnService(prisma, intr.client);
            const schedulerService = new SchedulerService(prisma);
            this.seasonService = new SeasonService(prisma, turnService, schedulerService);
        }

        const subcommandGroup = intr.options.getSubcommandGroup();
        
        switch (subcommandGroup) {
            case 'terminate': {
                await this.handleTerminateCommand(intr, data);
                break;
            }
            case 'player': {
                await this.handlePlayerCommand(intr, data);
                break;
            }
            case 'list': {
                await this.handleListCommand(intr, data);
                break;
            }
            default: {
                await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.notImplemented, {}, true, 'warning');
                return;
            }
        }
    }

    private async handleTerminateCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const subcommandGroup = intr.options.getSubcommandGroup();
        
        if (subcommandGroup === 'terminate') {
            const subcommand = intr.options.getSubcommand();
            
            if (subcommand === 'season') {
                const seasonId = intr.options.getString('id', true);
                
                try {
                    const result = await this.seasonService.terminateSeason(seasonId);
                    await this.handleMessageInstruction(result, intr);
                } catch (error) {
                    console.error('Error in admin terminate season command:', error);
                    await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.command, {
                        ERROR_CODE: 'ADMIN_TERMINATE_SEASON_ERROR',
                        GUILD_ID: intr.guild?.id ?? 'N/A',
                        SHARD_ID: intr.guild?.shardId?.toString() ?? 'N/A'
                    }, true, 'error');
                }
            }
        }
    }

    private async handlePlayerCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const subcommand = intr.options.getSubcommand();
        
        switch (subcommand) {
            case 'ban': {
                await this.handleBanCommand(intr, data);
                break;
            }
            case 'unban': {
                await this.handleUnbanCommand(intr, data);
                break;
            }
            default: {
                await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.notImplemented, {}, true, 'warning');
                return;
            }
        }
    }

    private async handleBanCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const targetUser = intr.options.getUser('user', true);
        const reason = intr.options.getString('reason');

        try {
            const bannedPlayer = await this.playerService.banPlayer(targetUser.id, reason || undefined);
            
            await SimpleMessage.sendSuccess(intr, strings.messages.admin.player.ban.success, {
                playerName: bannedPlayer.name,
                reason: reason ? `\n**Reason:** ${reason}` : ''
            }, true);
        } catch (error) {
            console.error('Error in admin ban command:', error);
            
            let errorMessage: string;
            if (error instanceof Error) {
                if (error.message.includes('not found')) {
                    errorMessage = strings.messages.admin.player.ban.notFound;
                } else if (error.message.includes('already banned')) {
                    errorMessage = strings.messages.admin.player.ban.alreadyBanned;
                } else {
                    errorMessage = strings.messages.admin.player.ban.error;
                }
            } else {
                errorMessage = strings.messages.admin.player.ban.error;
            }
            
            await SimpleMessage.sendError(intr, errorMessage, {
                playerName: targetUser.displayName || targetUser.username
            }, true);
        }
    }

    private async handleUnbanCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const targetUser = intr.options.getUser('user', true);

        try {
            const unbannedPlayer = await this.playerService.unbanPlayer(targetUser.id);
            
            await SimpleMessage.sendSuccess(intr, strings.messages.admin.player.unban.success, {
                playerName: unbannedPlayer.name
            }, true);
        } catch (error) {
            console.error('Error in admin unban command:', error);
            
            let errorMessage: string;
            if (error instanceof Error) {
                if (error.message.includes('not found')) {
                    errorMessage = strings.messages.admin.player.unban.notFound;
                } else if (error.message.includes('not currently banned')) {
                    errorMessage = strings.messages.admin.player.unban.notBanned;
                } else {
                    errorMessage = strings.messages.admin.player.unban.error;
                }
            } else {
                errorMessage = strings.messages.admin.player.unban.error;
            }
            
            await SimpleMessage.sendError(intr, errorMessage, {
                playerName: targetUser.displayName || targetUser.username
            }, true);
        }
    }

    private async handleListCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const subcommand = intr.options.getSubcommand();
        
        switch (subcommand) {
            case 'seasons': {
                await this.handleListSeasonsCommand(intr, data);
                break;
            }
            case 'players': {
                await this.handleListPlayersCommand(intr, data);
                break;
            }
            default: {
                await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.notImplemented, {}, true, 'warning');
                return;
            }
        }
    }

    private async handleListSeasonsCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const statusFilter = intr.options.getString('status');
        
        try {
            const result = await this.seasonService.listSeasons(statusFilter || undefined);
            await this.handleMessageInstruction(result, intr);
        } catch (error) {
            console.error('Error in admin list seasons command:', error);
            await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.command, {
                ERROR_CODE: 'ADMIN_LIST_SEASONS_ERROR',
                GUILD_ID: intr.guild?.id ?? 'N/A',
                SHARD_ID: intr.guild?.shardId?.toString() ?? 'N/A'
            }, true, 'error');
        }
    }

    private async handleListPlayersCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const seasonFilter = intr.options.getString('season');
        const bannedFilter = intr.options.getBoolean('banned');

        try {
            const result = await this.playerService.listPlayers(
                seasonFilter || undefined, 
                bannedFilter || undefined
            );
            await this.handleMessageInstruction(result, intr);
        } catch (error) {
            console.error('Error in admin list players command:', error);
            await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.command, {
                ERROR_CODE: 'ADMIN_LIST_PLAYERS_ERROR',
                GUILD_ID: intr.guild?.id ?? 'N/A',
                SHARD_ID: intr.guild?.shardId?.toString() ?? 'N/A'
            }, true, 'error');
        }
    }

    /**
     * Convert MessageInstruction to SimpleMessage call
     */
    private async handleMessageInstruction(instruction: any, intr: ChatInputCommandInteraction): Promise<void> {
        // This is a temporary bridge method to handle services that still return MessageInstruction
        // TODO: Update services to return plain data instead of MessageInstruction
        
        const ephemeral = instruction.formatting?.ephemeral ?? false;
        
        if (instruction.formatting?.embed) {
            // Try to find the embed data in strings based on the key
            const embedData = this.getEmbedFromKey(instruction.key);
            if (embedData) {
                await SimpleMessage.sendEmbed(intr, embedData, instruction.data, ephemeral, instruction.type);
            } else {
                // Fallback: create a simple message
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
            // Simple text message
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
        // Try to find embed data in strings.embeds based on the key
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
        // Try to find string in the strings object
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