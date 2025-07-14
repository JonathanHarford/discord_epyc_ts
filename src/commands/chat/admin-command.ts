import { PrismaClient } from '@prisma/client';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ChatInputCommandInteraction, EmbedBuilder, PermissionsString } from 'discord.js';
import { createRequire } from 'node:module';

import { interpolate, strings } from '../../lang/strings.js';
import prisma from '../../lib/prisma.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { EventData } from '../../models/internal-models.js';
import { ChannelConfigService } from '../../services/ChannelConfigService.js';
import { ConfigService } from '../../services/ConfigService.js';
import { GameConfigService } from '../../services/GameConfigService.js';
import { GameService } from '../../services/GameService.js';
import { OnDemandGameService } from '../../services/OnDemandGameService.js';
import { PlayerService } from '../../services/PlayerService.js';
import { SchedulerService } from '../../services/SchedulerService.js';
import { SeasonService } from '../../services/SeasonService.js';
import { SeasonTurnService } from '../../services/SeasonTurnService.js';
import { MessageInstruction } from '../../types/MessageInstruction.js';
import { createAdminGameConfigModal, createAdminSeasonConfigModal, createAdminSeasonConfigStep2Modal } from '../../utils/modalBuilders.js';
import { Command, CommandDeferType } from '../index.js';

const require = createRequire(import.meta.url);

export class AdminCommand implements Command {
    public names = [strings.chatCommands.admin];
    public deferType = CommandDeferType.NONE; // Changed from HIDDEN to NONE to allow modals
    public requireClientPerms: PermissionsString[] = [];

    private seasonService: SeasonService;
    private playerService: PlayerService;
    private configService: ConfigService;
    private gameConfigService: GameConfigService;
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
        this.gameConfigService = new GameConfigService(prisma);
        this.channelConfigService = new ChannelConfigService(prisma);
        this.onDemandGameService = null as any; // Temporary, will be initialized in execute
    }

    public async execute(intr: ChatInputCommandInteraction, data: EventData, developers: string[]): Promise<void> {
        // Check if user has admin permissions (using developers array for now)
        if (!developers.includes(intr.user.id)) {
            await SimpleMessage.sendWarning(intr, strings.messages.admin.notAdmin, {}, true);
            return;
        }

        // Initialize services with the Discord client from the interaction
        if (!this.seasonService) {
            const turnService = new SeasonTurnService(prisma, intr.client);
            const schedulerService = new SchedulerService(prisma);
            const gameService = new GameService(prisma, intr.client);
            this.seasonService = new SeasonService(prisma, turnService, schedulerService, gameService);
            this.onDemandGameService = new OnDemandGameService(prisma, intr.client, schedulerService);
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
                await intr.deferReply({ ephemeral: true });
                await this.handleSeasonListCommand(intr, data);
                break;
            }
            case 'show': {
                await intr.deferReply({ ephemeral: true });
                await this.handleSeasonShowCommand(intr, data);
                break;
            }
            case 'config': {
                // Don't defer for config - we need to show a modal
                await this.handleSeasonConfigCommand(intr, data);
                break;
            }
            case 'kill': {
                await intr.deferReply({ ephemeral: true });
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
                // Don't defer for config - we need to show a modal
                await this.handleGameConfigCommand(intr);
                break;
            }
            case 'list': {
                await intr.deferReply({ ephemeral: true });
                await this.handleGameListCommand(intr);
                break;
            }
            case 'show': {
                await intr.deferReply({ ephemeral: true });
                await this.handleGameShowCommand(intr);
                break;
            }
            case 'kill': {
                await intr.deferReply({ ephemeral: true });
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
                await intr.deferReply({ ephemeral: true });
                await this.handlePlayerListCommand(intr, _data);
                break;
            }
            case 'show': {
                await intr.deferReply({ ephemeral: true });
                await this.handlePlayerShowCommand(intr, _data);
                break;
            }
            case 'ban': {
                await intr.deferReply({ ephemeral: true });
                await this.handleBanCommand(intr, _data);
                break;
            }
            case 'unban': {
                await intr.deferReply({ ephemeral: true });
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

            // Create embed for season details
            const embed = new EmbedBuilder()
                .setTitle(`Season Details: ${season.id}`)
                .setColor(season.status === 'TERMINATED' ? 0xFF0000 : 0x0099FF) // Red for terminated, blue otherwise
                .addFields(
                    { name: 'Status', value: season.status, inline: true },
                    { name: 'Creator', value: `${seasonStats?.creator.name} (${seasonStats?.creator.discordUserId})`, inline: true },
                    { name: 'Created', value: new Date(season.createdAt).toLocaleDateString(), inline: true },
                    { name: 'Players', value: `${seasonStats?._count.players || 0}`, inline: true },
                    { name: 'Games', value: `${seasonStats?._count.games || 0}`, inline: true },
                    { name: 'Min Players', value: `${season.config.minPlayers}`, inline: true },
                    { name: 'Max Players', value: `${season.config.maxPlayers || 'Unlimited'}`, inline: true },
                    { name: 'Turn Pattern', value: season.config.turnPattern || 'Default', inline: true },
                    { name: 'Open Duration', value: season.config.openDuration || 'Default', inline: true },
                    { name: 'Recent Games', value: recentGames, inline: false }
                );

            // Create action buttons
            const components = [];
            if (season.status !== 'TERMINATED') {
                const terminateButton = new ButtonBuilder()
                    .setCustomId(`admin_season_terminate_${seasonId}`)
                    .setLabel('Terminate')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🛑');

                const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(terminateButton);
                components.push(actionRow);
            }

            await intr.editReply({ embeds: [embed], components });

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
            // Get current configuration to pre-populate modal
            const config = await this.configService.getGuildDefaultConfig(guildId);
            
            // Create and show modal
            const modal = await createAdminSeasonConfigModal(config);
            await intr.showModal(modal);
            
        } catch (error) {
            console.error('Error in admin season config command:', error);
            await SimpleMessage.sendError(intr, 'An error occurred while opening the season configuration modal.', {}, true);
        }
    }
    
    private formatConfigForDisplay(config: any): string {
        return `**Player Limits:**\n` +
               `• Min Players: ${config.minPlayers}\n` +
               `• Max Players: ${config.maxPlayers}\n\n` +
               `**Timeouts:**\n` +
               `• Open Duration: ${config.openDuration}\n` +
               `• Claim Timeout: ${config.claimTimeout}\n` +
               `• Claim Warning: ${config.claimWarning}\n` +
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
        const guildId = intr.guildId;
        if (!guildId) {
            await SimpleMessage.sendError(intr, 'This command can only be used in a server.', {}, true);
            return;
        }
        
        try {
            // Get current configuration to pre-populate modal
            const config = await this.gameConfigService.getGuildDefaultConfig(guildId);
            
            // Create and show modal
            const modal = await createAdminGameConfigModal(config);
            await intr.showModal(modal);
            
        } catch (error) {
            console.error('Error in admin game config command:', error);
            await SimpleMessage.sendError(intr, 'An error occurred while opening the game configuration modal.', {}, true);
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
            
            // Group games by status for better organization
            const activeGames = limitedGames.filter(game => game.status === 'ACTIVE');
            const completedGames = limitedGames.filter(game => game.status === 'COMPLETED');
            const terminatedGames = limitedGames.filter(game => game.status === 'TERMINATED');
            
            let message = '';
            
            // Format active games section
            if (activeGames.length > 0) {
                message += '**Active games:**\n';
                message += activeGames.map(game => {
                    const createdDate = new Date(game.createdAt).toISOString().split('T')[0];
                    const creatorName = game.creator?.name || 'Unknown';
                    const turnCount = game.turns?.length || 0;
                    const completedTurns = game.turns?.filter(t => t.status === 'COMPLETED').length || 0;
                    return `@${creatorName} ${createdDate} (${completedTurns}/${turnCount} turns)`;
                }).join('\n');
                message += '\n\n';
            }
            
            // Format completed games section
            if (completedGames.length > 0) {
                message += '**Completed games:**\n';
                message += completedGames.map(game => {
                    const createdDate = new Date(game.createdAt).toISOString().split('T')[0];
                    const creatorName = game.creator?.name || 'Unknown';
                    const turnCount = game.turns?.length || 0;
                    return `@${creatorName} ${createdDate} (${turnCount} turns)`;
                }).join('\n');
                message += '\n\n';
            }
            
            // Format terminated games section
            if (terminatedGames.length > 0) {
                message += '**Terminated games:**\n';
                message += terminatedGames.map(game => {
                    const createdDate = new Date(game.createdAt).toISOString().split('T')[0];
                    const creatorName = game.creator?.name || 'Unknown';
                    const turnCount = game.turns?.length || 0;
                    return `@${creatorName} ${createdDate} (${turnCount} turns)`;
                }).join('\n');
            }

            const filterText = statusFilter ? ` (Status: ${statusFilter})` : '';
            const showingText = games.length > limit ? `\n\nShowing ${limit} of ${games.length} games.` : '';
            
            await SimpleMessage.sendInfo(intr, `**Games on this server${filterText}:**\n\n${message.trim()}${showingText}`, {}, true);

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
        const formatted = this.gameConfigService.formatConfigForDisplay(config);
        return `**Turn Settings:**\n` +
               `• Turn Pattern: ${formatted.turnPattern}\n` +
               `• Min Turns: ${formatted.minTurns}\n` +
               `• Max Turns: ${formatted.maxTurns}\n\n` +
               `**Timeouts:**\n` +
               `• Writing Timeout: ${formatted.writingTimeout}\n` +
               `• Writing Warning: ${formatted.writingWarning}\n` +
               `• Drawing Timeout: ${formatted.drawingTimeout}\n` +
               `• Drawing Warning: ${formatted.drawingWarning}\n` +
               `• Stale Timeout: ${formatted.staleTimeout}\n\n` +
               `**Return Settings:**\n` +
               `• Return Count: ${formatted.returnCount}\n` +
               `• Return Cooldown: ${formatted.returnCooldown}`;
    }

    private async handleChannelCommand(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        const subcommand = intr.options.getSubcommand();
        
        switch (subcommand) {
            case 'config': {
                // Don't defer for config - we need to show a modal
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

            // Get current configuration to display current values
            const config = await this.channelConfigService.getGuildChannelConfig(guildId);
            
            // Create channel select components
            const announceChannelSelect = new ChannelSelectMenuBuilder()
                .setCustomId('admin_channel_config_announce')
                .setPlaceholder('Select announce channel')
                .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setMaxValues(1);

            const completedChannelSelect = new ChannelSelectMenuBuilder()
                .setCustomId('admin_channel_config_completed')
                .setPlaceholder('Select completed channel')
                .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setMaxValues(1);

            const adminChannelSelect = new ChannelSelectMenuBuilder()
                .setCustomId('admin_channel_config_admin')
                .setPlaceholder('Select admin channel')
                .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setMaxValues(1);

            // Set default channels if they exist
            if (config?.announceChannelId) {
                announceChannelSelect.setDefaultChannels(config.announceChannelId);
            }
            if (config?.completedChannelId) {
                completedChannelSelect.setDefaultChannels(config.completedChannelId);
            }
            if (config?.adminChannelId) {
                adminChannelSelect.setDefaultChannels(config.adminChannelId);
            }

            // Create action rows
            const announceRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(announceChannelSelect);
            const completedRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(completedChannelSelect);
            const adminRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(adminChannelSelect);

            // Create embed showing current configuration
            const embed = new EmbedBuilder()
                .setTitle('Channel Configuration')
                .setDescription('Select channels for bot notifications and announcements.')
                .addFields(
                    {
                        name: 'Current Configuration',
                        value: this.formatChannelConfigForDisplay(config),
                        inline: false
                    }
                )
                .setColor(0x5865F2);

            await intr.reply({
                embeds: [embed],
                components: [announceRow, completedRow, adminRow],
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in admin channel config command:', error);
            await SimpleMessage.sendError(intr, 'An error occurred while opening the channel configuration.', {}, true);
        }
    }

    private formatChannelConfigForDisplay(config: any): string {
        return `**announce:** ${config?.announceChannelId ? `<#${config.announceChannelId}>` : 'Not set'}\n` +
               `**completed:** ${config?.completedChannelId ? `<#${config.completedChannelId}>` : 'Not set'}\n` +
               `**admin:** ${config?.adminChannelId ? `<#${config.adminChannelId}>` : 'Not set'}`;
    }
} 