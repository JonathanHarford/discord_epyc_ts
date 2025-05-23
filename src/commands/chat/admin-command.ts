import { ChatInputCommandInteraction, PermissionsString, SlashCommandBuilder } from 'discord.js';
import { createRequire } from 'node:module';

import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { Lang } from '../../services/index.js';
import { Command, CommandDeferType } from '../index.js';
import { MessageHelpers } from '../../messaging/MessageHelpers.js';
import { MessageAdapter } from '../../messaging/MessageAdapter.js';
import { SeasonService } from '../../services/SeasonService.js';
import { TurnService } from '../../services/TurnService.js';
import { SchedulerService } from '../../services/SchedulerService.js';
import { PlayerService } from '../../services/PlayerService.js';
import { LangKeys } from '../../constants/lang-keys.js';
import prisma from '../../lib/prisma.js';

const require = createRequire(import.meta.url);
let Config = require('../../../config/config.json');

export class AdminCommand implements Command {
    public names = [Lang.getRef('chatCommands.admin', Language.Default)];
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
            const adminOnlyInstruction = MessageHelpers.embedMessage('warning', LangKeys.Commands.Admin.NotAdmin, {}, true);
            await MessageAdapter.processInstruction(adminOnlyInstruction, intr, data.lang);
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
            default: {
                const notImplementedInstruction = MessageHelpers.embedMessage('warning', 'errorEmbeds.notImplemented', {}, true);
                await MessageAdapter.processInstruction(notImplementedInstruction, intr, data.lang);
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
                    await MessageAdapter.processInstruction(result, intr, data.lang);
                } catch (error) {
                    console.error('Error in admin terminate season command:', error);
                    const errorInstruction = MessageHelpers.embedMessage('error', 'errorEmbeds.command', {
                        ERROR_CODE: 'ADMIN_TERMINATE_SEASON_ERROR',
                        GUILD_ID: intr.guild?.id ?? 'N/A',
                        SHARD_ID: intr.guild?.shardId?.toString() ?? 'N/A'
                    }, true);
                    await MessageAdapter.processInstruction(errorInstruction, intr, data.lang);
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
                const notImplementedInstruction = MessageHelpers.embedMessage('warning', 'errorEmbeds.notImplemented', {}, true);
                await MessageAdapter.processInstruction(notImplementedInstruction, intr, data.lang);
                return;
            }
        }
    }

    private async handleBanCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const targetUser = intr.options.getUser('user', true);
        const reason = intr.options.getString('reason');

        try {
            const bannedPlayer = await this.playerService.banPlayer(targetUser.id, reason || undefined);
            
            const successInstruction = MessageHelpers.embedMessage('success', 'admin.player.ban.success', {
                PLAYER_NAME: bannedPlayer.name,
                PLAYER_ID: targetUser.id,
                REASON: reason ? `\n**Reason:** ${reason}` : ''
            }, true);
            
            await MessageAdapter.processInstruction(successInstruction, intr, data.lang);
        } catch (error) {
            console.error('Error in admin ban command:', error);
            
            let errorMessage = 'admin.player.ban.error';
            if (error instanceof Error) {
                if (error.message.includes('not found')) {
                    errorMessage = 'admin.player.ban.notFound';
                } else if (error.message.includes('already banned')) {
                    errorMessage = 'admin.player.ban.alreadyBanned';
                }
            }
            
            const errorInstruction = MessageHelpers.embedMessage('error', errorMessage, {
                PLAYER_ID: targetUser.id,
                ERROR: error instanceof Error ? error.message : 'Unknown error'
            }, true);
            
            await MessageAdapter.processInstruction(errorInstruction, intr, data.lang);
        }
    }

    private async handleUnbanCommand(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const targetUser = intr.options.getUser('user', true);

        try {
            const unbannedPlayer = await this.playerService.unbanPlayer(targetUser.id);
            
            const successInstruction = MessageHelpers.embedMessage('success', 'admin.player.unban.success', {
                PLAYER_NAME: unbannedPlayer.name,
                PLAYER_ID: targetUser.id
            }, true);
            
            await MessageAdapter.processInstruction(successInstruction, intr, data.lang);
        } catch (error) {
            console.error('Error in admin unban command:', error);
            
            let errorMessage = 'admin.player.unban.error';
            if (error instanceof Error) {
                if (error.message.includes('not found')) {
                    errorMessage = 'admin.player.unban.notFound';
                } else if (error.message.includes('not currently banned')) {
                    errorMessage = 'admin.player.unban.notBanned';
                }
            }
            
            const errorInstruction = MessageHelpers.embedMessage('error', errorMessage, {
                PLAYER_ID: targetUser.id,
                ERROR: error instanceof Error ? error.message : 'Unknown error'
            }, true);
            
            await MessageAdapter.processInstruction(errorInstruction, intr, data.lang);
        }
    }
} 