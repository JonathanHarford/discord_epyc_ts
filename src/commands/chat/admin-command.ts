import { PrismaClient } from '@prisma/client';
import { ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { createRequire } from 'node:module';

import { interpolate, strings } from '../../lang/strings.js';
import prisma from '../../lib/prisma.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { EventData } from '../../models/internal-models.js';
import { ChannelConfigService } from '../../services/ChannelConfigService.js';
import { ConfigService } from '../../services/ConfigService.js';
import { GameService } from '../../services/GameService.js';
import { OnDemandGameService } from '../../services/OnDemandGameService.js';
import { PlayerService } from '../../services/PlayerService.js';
import { SchedulerService } from '../../services/SchedulerService.js';
import { SeasonService } from '../../services/SeasonService.js';
import { SeasonTurnService } from '../../services/SeasonTurnService.js';
import { MessageInstruction } from '../../types/MessageInstruction.js';
import { Command, CommandDeferType } from '../index.js';

const require = createRequire(import.meta.url);
let Config = require('../../../config/config.json');

export class AdminCommand implements Command {
    public names = [strings.chatCommands.admin];
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];

    private seasonService: SeasonService;
    private playerService: PlayerService;
    private configService: ConfigService;
    private channelConfigService: ChannelConfigService;
    private onDemandGameService: OnDemandGameService;
    private prisma: PrismaClient;

    constructor() {
        // Initialize services - SeasonTurnService needs DiscordClient which we'll get from the interaction
        // For now, we'll initialize SeasonService in the execute method where we have access to the client
        this.prisma = prisma;
        this.seasonService = null as any; // Temporary, will be initialized in execute
        this.playerService = new PlayerService(prisma);
        this.configService = new ConfigService(prisma);
        this.channelConfigService = new ChannelConfigService(prisma);
        this.onDemandGameService = null as any; // Temporary, will be initialized in execute
    }

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        // Check if user has admin permissions (using developers array for now)
        if (!Config.developers.includes(intr.user.id)) {
            await SimpleMessage.sendWarning(intr, strings.messages.admin.notAdmin, {}, true);
            return;
        }

        // Initialize services with the Discord client from the interaction
        if (!this.seasonService) {
            const turnService = new SeasonTurnService(prisma, intr.client);
            const schedulerService = new SchedulerService(prisma);
            const gameService = new GameService(prisma);
            this.seasonService = new SeasonService(prisma, turnService, schedulerService, gameService);
            this.onDemandGameService = new OnDemandGameService(prisma, intr.client);
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
            case 'game': {
                await this.handleGameCommand(intr, data);
                break;
            }
            case 'channel': {
                await this.handleChannelCommand(intr, data);
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

    private async handleGameCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        const subcommand = intr.options.getSubcommand();
        
        switch (subcommand) {
            case 'config': {
                await this.handleGameConfigCommand(intr);
                break;
            }
            case 'list': {
                await this.handleGameListCommand(intr);
                break;
            }
            case 'show': {
                await this.handleGameShowCommand(intr);
                break;
            }
            case 'kill': {
                await this.handleGameKillCommand(intr);
                break;
            }
            default: {
                await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.notImplemented, {}, true, 'warning');
                return;
            }
        }
    }

    private async handlePlayerCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        const subcommand = intr.options.getSubcommand();
        
        switch (subcommand) {
            case 'list': {
                await this.handlePlayerListCommand(intr, _data);
                break;
            }
            case 'show': {
                await this.handlePlayerShowCommand(intr, _data);
                break;
            }
            case 'ban': {
                await this.handleBanCommand(intr, _data);
                break;
            }
            case 'unban': {
                await this.handleUnbanCommand(intr, _data);
                break;
            }
            default: {
                await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.notImplemented, {}, true, 'warning');
                return;
            }
        }
    }

    private async handleBanCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
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

    private async handleUnbanCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
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

    private async handlePlayerListCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
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

    private async handlePlayerShowCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        const user = intr.options.getUser('user', true);
        
        try {
            const player = await this.playerService.getPlayerByDiscordId(user.id);
            
            if (!player) {
                await SimpleMessage.sendError(intr, 'Player not found.', {
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

    private async handleSeasonListCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
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

    private async handleSeasonShowCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
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

    private async handleSeasonConfigCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        const guildId = intr.guild?.id;
        if (!guildId) {
            await SimpleMessage.sendError(intr, 'This command can only be used in a server.', {}, true);
            return;
        }
        
        try {
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
            
            // Check if any parameters are provided for updating
            const hasUpdates = turnPattern || claimTimeout || writingTimeout || writingWarning || 
                              drawingTimeout || drawingWarning || openDuration || 
                              minPlayers !== null || maxPlayers !== null;
            
            if (hasUpdates) {
                // Update the server's default configuration
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
                
                const result = await this.configService.updateGuildDefaultConfig(guildId, updateData);
                await this.handleMessageInstruction(result, intr);
            }
            
            // Always show the current configuration (whether updated or just viewing)
            const config = await this.configService.getGuildDefaultConfig(guildId);
            const configText = this.formatConfigForDisplay(config);
            const title = hasUpdates ? '**Updated Server Default Season Configuration**' : '**Server Default Season Configuration**';
            await SimpleMessage.sendInfo(intr, `${title}\n\n${configText}`, {}, true);
            
        } catch (error) {
            console.error('Error in admin season config command:', error);
            await SimpleMessage.sendError(intr, 'An error occurred while managing the season configuration.', {}, true);
        }
    }
    
    private formatConfigForDisplay(config: any): string {
        return `**Player Limits:**\n` +
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
    }

    private async handleSeasonKillCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
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
        // Navigate through the strings object using the key path
        const keyParts = key.split('.');
        let value: unknown = strings;
        
        for (const part of keyParts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                throw new Error(`String key not found: ${key}`);
            }
        }
        
        if (typeof value !== 'string') {
            throw new Error(`String key does not resolve to a string: ${key}`);
        }
        
        return data ? interpolate(value, data) : value;
    }

    // Game admin command handlers
    private async handleGameConfigCommand(intr: ChatInputCommandInteraction): Promise<void> {
        try {
            const guildId = intr.guildId;
            if (!guildId) {
                await SimpleMessage.sendError(intr, 'This command can only be used in a server.', {}, true);
                return;
            }

            // Get all the config options from the interaction
            const updates: any = {};
            const turnPattern = intr.options.getString('turn_pattern');
            const writingTimeout = intr.options.getString('writing_timeout');
            const writingWarning = intr.options.getString('writing_warning');
            const drawingTimeout = intr.options.getString('drawing_timeout');
            const drawingWarning = intr.options.getString('drawing_warning');
            const staleTimeout = intr.options.getString('stale_timeout');
            const minTurns = intr.options.getInteger('min_turns');
            const maxTurns = intr.options.getInteger('max_turns');
            const returns = intr.options.getString('returns');
            if (turnPattern) updates.turnPattern = turnPattern;
            if (writingTimeout) updates.writingTimeout = writingTimeout;
            if (writingWarning) updates.writingWarning = writingWarning;
            if (drawingTimeout) updates.drawingTimeout = drawingTimeout;
            if (drawingWarning) updates.drawingWarning = drawingWarning;
            if (staleTimeout) updates.staleTimeout = staleTimeout;
            if (minTurns !== null) updates.minTurns = minTurns;
            if (maxTurns !== null) updates.maxTurns = maxTurns;
            if (returns) updates.returns = returns;

            const hasUpdates = Object.keys(updates).length > 0;

            if (hasUpdates) {
                // Update the config
                let guildConfig = await this.prisma.gameConfig.findUnique({
                    where: { isGuildDefaultFor: guildId }
                });

                if (!guildConfig) {
                    // Create new guild default config
                    guildConfig = await this.prisma.gameConfig.create({
                        data: {
                            isGuildDefaultFor: guildId,
                            ...updates
                        }
                    });
                } else {
                    // Update existing config
                    guildConfig = await this.prisma.gameConfig.update({
                        where: { id: guildConfig.id },
                        data: updates
                    });
                }
            }

            // Always show the current configuration (whether updated or just viewing)
            const config = await this.prisma.gameConfig.findUnique({
                where: { isGuildDefaultFor: guildId }
            });

            if (!config) {
                await SimpleMessage.sendInfo(intr, 'No game configuration found for this server. Default values will be used.', {}, true);
                return;
            }

            const configDisplay = this.formatGameConfigForDisplay(config);
            const title = hasUpdates ? '**Updated Game Configuration:**' : '**Game Configuration:**';
            await SimpleMessage.sendInfo(intr, `${title}\n\n${configDisplay}`, {}, true);

        } catch (error) {
            console.error('Error in admin game config command:', error);
            await SimpleMessage.sendError(intr, 'An error occurred while updating the game configuration.', {}, true);
        }
    }

    private async handleGameListCommand(intr: ChatInputCommandInteraction): Promise<void> {
        try {
            const guildId = intr.guildId;
            if (!guildId) {
                await SimpleMessage.sendError(intr, 'This command can only be used in a server.', {}, true);
                return;
            }

            const statusFilter = intr.options.getString('status');
            const limit = intr.options.getInteger('limit') || 10;

            const result = await this.onDemandGameService.listAllGames(guildId, statusFilter || undefined);
            
            if (!result.success) {
                await SimpleMessage.sendError(intr, `Failed to list games: ${result.error}`, {}, true);
                return;
            }

            const games = result.games || [];
            
            if (games.length === 0) {
                const filterText = statusFilter ? ` with status "${statusFilter}"` : '';
                await SimpleMessage.sendInfo(intr, `No games found${filterText}.`, {}, true);
                return;
            }

            // Limit the results
            const limitedGames = games.slice(0, limit);
            
            let gamesList = limitedGames.map(game => {
                const statusEmoji = game.status === 'ACTIVE' ? '🟢' : game.status === 'COMPLETED' ? '✅' : '🔴';
                const turnCount = game.turns?.length || 0;
                const lastActivity = game.lastActivityAt ? new Date(game.lastActivityAt).toLocaleDateString() : 'Unknown';
                return `${statusEmoji} **${game.id}** (${game.status})\n` +
                       `   Creator: ${game.creator?.name || 'Unknown'}\n` +
                       `   Turns: ${turnCount} | Last Activity: ${lastActivity}`;
            }).join('\n\n');

            const filterText = statusFilter ? ` (Status: ${statusFilter})` : '';
            const showingText = games.length > limit ? `\nShowing ${limit} of ${games.length} games.` : '';
            
            await SimpleMessage.sendInfo(intr, `**Games in this server${filterText}:**\n\n${gamesList}${showingText}`, {}, true);

        } catch (error) {
            console.error('Error in admin game list command:', error);
            await SimpleMessage.sendError(intr, 'An error occurred while listing games.', {}, true);
        }
    }

    private async handleGameShowCommand(intr: ChatInputCommandInteraction): Promise<void> {
        try {
            const gameId = intr.options.getString('id', true);

            const game = await this.onDemandGameService.getGameDetails(gameId);
            
            if (!game) {
                await SimpleMessage.sendError(intr, `Game with ID "${gameId}" not found.`, {}, true);
                return;
            }

            // Check if the game belongs to this guild
            if (game.guildId !== intr.guildId) {
                await SimpleMessage.sendError(intr, `Game "${gameId}" does not belong to this server.`, {}, true);
                return;
            }

            const statusEmoji = game.status === 'ACTIVE' ? '🟢' : game.status === 'COMPLETED' ? '✅' : '🔴';
            const createdAt = new Date(game.createdAt).toLocaleString();
            const lastActivity = game.lastActivityAt ? new Date(game.lastActivityAt).toLocaleString() : 'Unknown';
            const turnCount = game.turns?.length || 0;
            
            // Get turn details
            const activeTurns = game.turns?.filter(t => t.status === 'ACTIVE') || [];
            const completedTurns = game.turns?.filter(t => t.status === 'COMPLETED') || [];
            const availableTurns = game.turns?.filter(t => t.status === 'AVAILABLE') || [];

            let gameDetails = `${statusEmoji} **Game ${gameId}**\n\n`;
            gameDetails += `**Status:** ${game.status}\n`;
            gameDetails += `**Creator:** ${game.creator?.name || 'Unknown'}\n`;
            gameDetails += `**Created:** ${createdAt}\n`;
            gameDetails += `**Last Activity:** ${lastActivity}\n\n`;
            gameDetails += `**Turn Summary:**\n`;
            gameDetails += `• Total Turns: ${turnCount}\n`;
            gameDetails += `• Active: ${activeTurns.length}\n`;
            gameDetails += `• Completed: ${completedTurns.length}\n`;
            gameDetails += `• Available: ${availableTurns.length}\n\n`;
            
            if (game.config) {
                gameDetails += `**Configuration:**\n`;
                gameDetails += `• Turn Pattern: ${game.config.turnPattern}\n`;
                gameDetails += `• Min/Max Turns: ${game.config.minTurns}/${game.config.maxTurns || 'unlimited'}\n`;
                gameDetails += `• Writing Timeout: ${game.config.writingTimeout}\n`;
                gameDetails += `• Drawing Timeout: ${game.config.drawingTimeout}\n`;
                gameDetails += `• Stale Timeout: ${game.config.staleTimeout}\n`;
            }

            await SimpleMessage.sendInfo(intr, gameDetails, {}, true);

        } catch (error) {
            console.error('Error in admin game show command:', error);
            await SimpleMessage.sendError(intr, 'An error occurred while retrieving game details.', {}, true);
        }
    }

    private async handleGameKillCommand(intr: ChatInputCommandInteraction): Promise<void> {
        try {
            const gameId = intr.options.getString('id', true);
            const reason = intr.options.getString('reason');

            // First, get the game to verify it exists and belongs to this guild
            const game = await this.onDemandGameService.getGameDetails(gameId);
            
            if (!game) {
                await SimpleMessage.sendError(intr, `Game with ID "${gameId}" not found.`, {}, true);
                return;
            }

            // Check if the game belongs to this guild
            if (game.guildId !== intr.guildId) {
                await SimpleMessage.sendError(intr, `Game "${gameId}" does not belong to this server.`, {}, true);
                return;
            }

            // Check if game is already terminated
            if (game.status === 'TERMINATED') {
                await SimpleMessage.sendError(intr, `Game "${gameId}" is already terminated.`, {}, true);
                return;
            }

            // Terminate the game
            const result = await this.onDemandGameService.terminateGame(gameId);
            
            if (!result.success) {
                await SimpleMessage.sendError(intr, `Failed to terminate game: ${result.error}`, {}, true);
                return;
            }

            const reasonText = reason ? `\n**Reason:** ${reason}` : '';
            await SimpleMessage.sendSuccess(intr, `Game **${gameId}** has been successfully terminated.\n**Previous Status:** ${game.status}${reasonText}`, {}, true);

        } catch (error) {
            console.error('Error in admin game kill command:', error);
            await SimpleMessage.sendError(intr, 'An error occurred while terminating the game.', {}, true);
        }
    }

    private formatGameConfigForDisplay(config: any): string {
        return `**Turn Settings:**\n` +
               `• Turn Pattern: ${config.turnPattern}\n` +
               `• Min Turns: ${config.minTurns}\n` +
               `• Max Turns: ${config.maxTurns || 'unlimited'}\n\n` +
               `**Timeouts:**\n` +
               `• Writing Timeout: ${config.writingTimeout}\n` +
               `• Writing Warning: ${config.writingWarning}\n` +
               `• Drawing Timeout: ${config.drawingTimeout}\n` +
               `• Drawing Warning: ${config.drawingWarning}\n` +
               `• Stale Timeout: ${config.staleTimeout}\n\n` +
               `**Game Settings:**\n` +
               `• Returns Policy: ${config.returns}`;
    }

    private async handleChannelCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        const subcommand = intr.options.getSubcommand();
        
        switch (subcommand) {
            case 'config': {
                await this.handleChannelConfigCommand(intr);
                break;
            }
            default: {
                await SimpleMessage.sendEmbed(intr, strings.embeds.errorEmbeds.notImplemented, {}, true, 'warning');
                return;
            }
        }
    }

    private async handleChannelConfigCommand(intr: ChatInputCommandInteraction): Promise<void> {
        try {
            const guildId = intr.guildId;
            if (!guildId) {
                await SimpleMessage.sendError(intr, 'This command can only be used in a server.', {}, true);
                return;
            }

            const announceChannel = intr.options.getChannel('announce');
            const completedChannel = intr.options.getChannel('completed');
            const adminChannel = intr.options.getChannel('admin');

            // If no options provided, show current configuration
            if (!announceChannel && !completedChannel && !adminChannel) {
                const config = await this.channelConfigService.getGuildChannelConfig(guildId);
                
                if (!config) {
                    await SimpleMessage.sendInfo(intr, 'No channel configuration found for this server. Use the options to set up channels.', {}, true);
                    return;
                }

                const configDisplay = this.formatChannelConfigForDisplay(config);
                await SimpleMessage.sendInfo(intr, `**Channel Configuration for this server:**\n\n${configDisplay}`, {}, true);
                return;
            }

            // Update the configuration
            const updates: any = {};
            if (announceChannel) updates.announceChannelId = announceChannel.id;
            if (completedChannel) updates.completedChannelId = completedChannel.id;
            if (adminChannel) updates.adminChannelId = adminChannel.id;

            await this.channelConfigService.updateGuildChannelConfig(guildId, updates);
            
            // Get the updated configuration to display
            const updatedConfig = await this.channelConfigService.getGuildChannelConfig(guildId);
            const configDisplay = this.formatChannelConfigForDisplay(updatedConfig);
            
            await SimpleMessage.sendSuccess(intr, `**Channel configuration:**\n${configDisplay}`, {}, true);

        } catch (error) {
            console.error('Error in admin channel config command:', error);
            await SimpleMessage.sendError(intr, 'An error occurred while updating the channel configuration.', {}, true);
        }
    }

    private formatChannelConfigForDisplay(config: any): string {
        return `**announce:** ${config.announceChannelId ? `<#${config.announceChannelId}>` : 'Not set'}\n` +
               `**completed:** ${config.completedChannelId ? `<#${config.completedChannelId}>` : 'Not set'}\n` +
               `**admin:** ${config.adminChannelId ? `<#${config.adminChannelId}>` : 'Not set'}`;
    }
} 