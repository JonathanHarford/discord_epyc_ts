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
import { LangKeys } from '../../constants/lang-keys.js';
import prisma from '../../lib/prisma.js';

const require = createRequire(import.meta.url);
let Config = require('../../../config/config.json');

export class AdminCommand implements Command {
    public names = [Lang.getRef('chatCommands.admin', Language.Default)];
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];

    private seasonService: SeasonService;

    constructor() {
        // Initialize services - TurnService needs DiscordClient which we'll get from the interaction
        // For now, we'll initialize SeasonService in the execute method where we have access to the client
        this.seasonService = null as any; // Temporary, will be initialized in execute
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
} 