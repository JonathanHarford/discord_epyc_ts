import { ChatInputCommandInteraction, PermissionsString, SlashCommandBuilder } from 'discord.js';
import { createRequire } from 'node:module';

import { EventData } from '../../models/internal-models.js';
import { Command, CommandDeferType } from '../index.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { strings } from '../../lang/strings.js';
import { SeasonService } from '../../services/SeasonService.js';
import { TurnService } from '../../services/TurnService.js';
import { SchedulerService } from '../../services/SchedulerService.js';
import { GameService } from '../../services/GameService.js';
import { PlayerService } from '../../services/PlayerService.js';
import { MessageInstruction } from '../../types/MessageInstruction.js';
import prisma from '../../lib/prisma.js';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
let Config = require('../../../config/config.json');

export class AdminCommand implements Command {
    public names = [strings.chatCommands.admin];
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];

    private seasonService: SeasonService;
    private playerService: PlayerService;
    private prisma: PrismaClient;

    constructor() {
        // Initialize services - TurnService needs DiscordClient which we'll get from the interaction
        // For now, we'll initialize SeasonService in the execute method where we have access to the client
        this.prisma = prisma;
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
            const gameService = new GameService(prisma);
            this.seasonService = new SeasonService(prisma, turnService, schedulerService, gameService);
        }

        const subcommandGroup = intr.options.getSubcommandGroup();
        
        switch (subcommandGroup) {
            case 'player': {
                await this.handlePlayerCommand(intr, data);
                break;
            }
            case 'season': {
                await this.handleSeasonCommand(intr, data);
                break;
            }
            default: {
                await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.notImplemented, {}, true, 'warning');
                return;
            }
        }
    }

    private async handleSeasonCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const subcommand = intr.options.getSubcommand();
        
        switch (subcommand) {
            case 'list': {
                await this.handleSeasonListCommand(intr, data);
                break;
            }
            case 'show': {
                await this.handleSeasonShowCommand(intr, data);
                break;
            }
            case 'config': {
                await this.handleSeasonConfigCommand(intr, data);
                break;
            }
            case 'kill': {
                await this.handleSeasonKillCommand(intr, data);
                break;
            }
            default: {
                await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.notImplemented, {}, true, 'warning');
                return;
            }
        }
    }

    private async handlePlayerCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const subcommand = intr.options.getSubcommand();
        
        switch (subcommand) {
            case 'list': {
                await this.handlePlayerListCommand(intr, data);
                break;
            }
            case 'show': {
                await this.handlePlayerShowCommand(intr, data);
                break;
            }
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

    private async handlePlayerListCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const seasonFilter = intr.options.getString('season');
        const bannedFilter = intr.options.getBoolean('banned');

        try {
            const result = await this.playerService.listPlayers(
                seasonFilter || undefined, 
                bannedFilter || undefined
            );
            await this.handleMessageInstruction(result, intr);
        } catch (error) {
            console.error('Error in admin player list command:', error);
            await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.command, {
                ERROR_CODE: 'ADMIN_PLAYER_LIST_ERROR',
                GUILD_ID: intr.guild?.id ?? 'N/A',
                SHARD_ID: intr.guild?.shardId?.toString() ?? 'N/A'
            }, true, 'error');
        }
    }

    private async handlePlayerShowCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const user = intr.options.getUser('user', true);
        
        try {
            const player = await this.playerService.getPlayerByDiscordId(user.id);
            
            if (!player) {
                await SimpleMessage.sendError(intr, "Player not found.", {
                    discordUserId: user.id,
                    username: user.username
                }, true);
                return;
            }

            // Get additional player statistics
            const playerStats = await this.prisma.player.findUnique({
                where: { id: player.id },
                include: {
                    _count: {
                        select: {
                            seasons: true,
                            turns: true
                        }
                    },
                    seasons: {
                        include: {
                            season: {
                                select: {
                                    id: true,
                                    status: true,
                                    createdAt: true
                                }
                            }
                        },
                        orderBy: {
                            joinedAt: 'desc'
                        },
                        take: 5
                    }
                }
            });

            const recentSeasons = playerStats?.seasons.map(s => 
                `${s.season.id} (${s.season.status})`
            ).join(', ') || 'None';

            await SimpleMessage.sendInfo(intr, `**Player Details**\n\n**Name:** ${player.name}\n**Discord ID:** ${player.discordUserId}\n**Player ID:** ${player.id}\n**Banned:** ${player.bannedAt ? 'Yes' : 'No'}\n**Banned At:** ${player.bannedAt?.toISOString() || 'N/A'}\n**Created:** ${player.createdAt.toISOString()}\n**Seasons:** ${playerStats?._count.seasons || 0}\n**Turns:** ${playerStats?._count.turns || 0}\n**Recent Seasons:** ${recentSeasons}`, {}, true);
        } catch (error) {
            console.error('Error in admin player show command:', error);
            await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.command, {
                ERROR_CODE: 'ADMIN_PLAYER_SHOW_ERROR',
                GUILD_ID: intr.guild?.id ?? 'N/A',
                SHARD_ID: intr.guild?.shardId?.toString() ?? 'N/A'
            }, true, 'error');
        }
    }

    private async handleSeasonListCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const statusFilter = intr.options.getString('status');
        
        try {
            const result = await this.seasonService.listSeasons(statusFilter || undefined);
            await this.handleMessageInstruction(result, intr);
        } catch (error) {
            console.error('Error in admin season list command:', error);
            await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.command, {
                ERROR_CODE: 'ADMIN_SEASON_LIST_ERROR',
                GUILD_ID: intr.guild?.id ?? 'N/A',
                SHARD_ID: intr.guild?.shardId?.toString() ?? 'N/A'
            }, true, 'error');
        }
    }

    private async handleSeasonShowCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const seasonId = intr.options.getString('season', true);
        
        try {
            const season = await this.seasonService.findSeasonById(seasonId);
            
            if (!season) {
                await SimpleMessage.sendError(intr, `Season '${seasonId}' not found.`, {}, true);
                return;
            }

            // Get additional season statistics
            const seasonStats = await this.prisma.season.findUnique({
                where: { id: seasonId },
                include: {
                    _count: {
                        select: {
                            players: true,
                            games: true
                        }
                    },
                    creator: {
                        select: {
                            name: true,
                            discordUserId: true
                        }
                    },
                    games: {
                        select: {
                            id: true,
                            status: true,
                            createdAt: true
                        },
                        orderBy: {
                            createdAt: 'desc'
                        },
                        take: 5
                    }
                }
            });

            const recentGames = seasonStats?.games.map(g => 
                `${g.id} (${g.status})`
            ).join(', ') || 'None';

            await SimpleMessage.sendInfo(intr, `**Season Details**\n\n**ID:** ${season.id}\n**Status:** ${season.status}\n**Creator:** ${seasonStats?.creator.name} (${seasonStats?.creator.discordUserId})\n**Created:** ${season.createdAt.toISOString()}\n**Players:** ${seasonStats?._count.players || 0}\n**Games:** ${seasonStats?._count.games || 0}\n**Min Players:** ${season.config.minPlayers}\n**Max Players:** ${season.config.maxPlayers}\n**Turn Pattern:** ${season.config.turnPattern || 'Default'}\n**Open Duration:** ${season.config.openDuration || 'Default'}\n**Recent Games:** ${recentGames}`, {}, true);
        } catch (error) {
            console.error('Error in admin season show command:', error);
            await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.command, {
                ERROR_CODE: 'ADMIN_SEASON_SHOW_ERROR',
                GUILD_ID: intr.guild?.id ?? 'N/A',
                SHARD_ID: intr.guild?.shardId?.toString() ?? 'N/A'
            }, true, 'error');
        }
    }

    private async handleSeasonConfigCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const action = intr.options.getString('action', true);
        const seasonId = intr.options.getString('season');
        
        try {
            if (action === 'view') {
                if (!seasonId) {
                    await SimpleMessage.sendError(intr, "Season ID is required for viewing configuration.", {}, true);
                    return;
                }
                
                // Get season with config
                const season = await this.prisma.season.findUnique({
                    where: { id: seasonId },
                    include: { config: true }
                });
                
                if (!season) {
                    await SimpleMessage.sendError(intr, `Season ${seasonId} not found.`, {}, true);
                    return;
                }
                
                const config = season.config;
                const configText = `**Season Configuration for ${seasonId}**\n\n` +
                    `**Player Limits:**\n` +
                    `• Min Players: ${config.minPlayers}\n` +
                    `• Max Players: ${config.maxPlayers}\n\n` +
                    `**Timeouts:**\n` +
                    `• Open Duration: ${config.openDuration}\n` +
                    `• Claim Timeout: ${config.claimTimeout}\n` +
                    `• Writing Timeout: ${config.writingTimeout}\n` +
                    `• Writing Warning: ${config.writingWarning}\n` +
                    `• Drawing Timeout: ${config.drawingTimeout}\n` +
                    `• Drawing Warning: ${config.drawingWarning}\n\n` +
                    `**Game Settings:**\n` +
                    `• Turn Pattern: ${config.turnPattern}`;
                
                await SimpleMessage.sendInfo(intr, configText, {}, true);
                
            } else if (action === 'set') {
                if (!seasonId) {
                    await SimpleMessage.sendError(intr, "Season ID is required for setting configuration.", {}, true);
                    return;
                }
                
                // Extract all configuration options
                const turnPattern = intr.options.getString('turn_pattern');
                const claimTimeout = intr.options.getString('claim_timeout');
                const writingTimeout = intr.options.getString('writing_timeout');
                const writingWarning = intr.options.getString('writing_warning');
                const drawingTimeout = intr.options.getString('drawing_timeout');
                const drawingWarning = intr.options.getString('drawing_warning');
                const openDuration = intr.options.getString('open_duration');
                const minPlayers = intr.options.getInteger('min_players');
                const maxPlayers = intr.options.getInteger('max_players');
                
                // Check if at least one parameter is provided
                if (!turnPattern && !claimTimeout && !writingTimeout && !writingWarning && 
                    !drawingTimeout && !drawingWarning && !openDuration && 
                    minPlayers === null && maxPlayers === null) {
                    await SimpleMessage.sendError(intr, "At least one configuration parameter must be provided.", {}, true);
                    return;
                }
                
                // Validate min/max players if both are provided
                if (minPlayers !== null && maxPlayers !== null && minPlayers > maxPlayers) {
                    await SimpleMessage.sendError(intr, "Minimum players cannot be greater than maximum players.", {}, true);
                    return;
                }
                
                // Find the season and its config
                const season = await this.prisma.season.findUnique({
                    where: { id: seasonId },
                    include: { config: true }
                });
                
                if (!season) {
                    await SimpleMessage.sendError(intr, `Season ${seasonId} not found.`, {}, true);
                    return;
                }
                
                // Build update data object
                const updateData: any = {};
                if (turnPattern !== null) updateData.turnPattern = turnPattern;
                if (claimTimeout !== null) updateData.claimTimeout = claimTimeout;
                if (writingTimeout !== null) updateData.writingTimeout = writingTimeout;
                if (writingWarning !== null) updateData.writingWarning = writingWarning;
                if (drawingTimeout !== null) updateData.drawingTimeout = drawingTimeout;
                if (drawingWarning !== null) updateData.drawingWarning = drawingWarning;
                if (openDuration !== null) updateData.openDuration = openDuration;
                if (minPlayers !== null) updateData.minPlayers = minPlayers;
                if (maxPlayers !== null) updateData.maxPlayers = maxPlayers;
                
                // Update the season config
                await this.prisma.seasonConfig.update({
                    where: { id: season.config.id },
                    data: updateData
                });
                
                const updatedFields = Object.keys(updateData).join(', ');
                await SimpleMessage.sendSuccess(intr, `Successfully updated season ${seasonId} configuration. Updated fields: ${updatedFields}`, {}, true);
                
            } else {
                await SimpleMessage.sendError(intr, `Invalid action: ${action}. Use 'view' or 'set'.`, {}, true);
            }
        } catch (error) {
            console.error('Error in admin season config command:', error);
            await SimpleMessage.sendError(intr, "An error occurred while managing season configuration.", {}, true);
        }
    }

    private async handleSeasonKillCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const seasonId = intr.options.getString('id', true);
        
        try {
            const result = await this.seasonService.terminateSeason(seasonId);
            await this.handleMessageInstruction(result, intr);
        } catch (error) {
            console.error('Error in admin season kill command:', error);
            await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.command, {
                ERROR_CODE: 'ADMIN_SEASON_KILL_ERROR',
                GUILD_ID: intr.guild?.id ?? 'N/A',
                SHARD_ID: intr.guild?.shardId?.toString() ?? 'N/A'
            }, true, 'error');
        }
    }

    /**
     * Convert MessageInstruction to SimpleMessage call
     */
    private async handleMessageInstruction(instruction: MessageInstruction, intr: ChatInputCommandInteraction): Promise<void> {
        // This is a temporary bridge method to handle services that still return MessageInstruction
                    // Services return MessageInstruction for consistency
        
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

    private getEmbedFromKey(key: string): unknown {
        // Try to find embed data in strings based on the key
        const parts = key.split('.');
        let current: unknown = strings;
        
        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return null;
            }
        }
        
        return current && typeof current === 'object' ? current : null;
    }

    private getStringFromKey(key: string, data?: Record<string, unknown>): string {
        // Try to find string in the strings object
        const parts = key.split('.');
        let current: unknown = strings;
        
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