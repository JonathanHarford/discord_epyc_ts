import djs, { ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { createRequire } from 'node:module';
import os from 'node:os';
import typescript from 'typescript';

import { DevCommandName } from '../../enums/index.js';
import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { Lang } from '../../services/index.js';
import { FormatUtils, InteractionUtils, ShardUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';
import { DatabaseService } from '../../database/index.js';

const require = createRequire(import.meta.url);
let Config = require('../../../config/config.json');
let TsConfig = require('../../../tsconfig.json');

export class DevCommand implements Command {
    public names = [Lang.getRef('chatCommands.dev', Language.Default)];
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];
    
    private dbService: DatabaseService;

    constructor() {
        this.dbService = new DatabaseService();
    }
    
    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        if (!Config.developers.includes(intr.user.id)) {
            await InteractionUtils.send(intr, Lang.getEmbed('validationEmbeds.devOnly', data.lang));
            return;
        }

        const subcommand = intr.options.getSubcommand();
        
        if (subcommand === 'testmode') {
            const serverId = intr.options.getString('server_id', true);
            
            try {
                // Check if server exists in database
                const server = await this.dbService.servers.getServer(serverId);
                if (!server) {
                    await InteractionUtils.send(
                        intr,
                        `❌ Server with ID \`${serverId}\` not found in database.`
                    );
                    return;
                }
                
                // Toggle test mode
                const updatedSettings = await this.dbService.servers.updateTestMode(serverId);
                
                // Display success message
                await InteractionUtils.send(
                    intr,
                    `✅ Test mode ${updatedSettings.testMode ? 'enabled' : 'disabled'} for server \`${serverId}\` (${server.name}).`
                );
            } catch (error) {
                console.error('Error toggling test mode:', error);
                await InteractionUtils.send(
                    intr,
                    `❌ Failed to toggle test mode: ${error.message}`
                );
            }
            return;
        }
        else if (subcommand === 'info') {
            let shardCount = intr.client.shard?.count ?? 1;
            let serverCount: number;
            if (intr.client.shard) {
                try {
                    serverCount = await ShardUtils.serverCount(intr.client.shard);
                } catch (error) {
                    if (error.name.includes('ShardingInProcess')) {
                        await InteractionUtils.send(
                            intr,
                            Lang.getEmbed('errorEmbeds.startupInProcess', data.lang)
                        );
                        return;
                    } else {
                        throw error;
                    }
                }
            } else {
                serverCount = intr.client.guilds.cache.size;
            }

            let memory = process.memoryUsage();

            await InteractionUtils.send(
                intr,
                Lang.getEmbed('displayEmbeds.devInfo', data.lang, {
                    NODE_VERSION: process.version,
                    TS_VERSION: `v${typescript.version}`,
                    ES_VERSION: TsConfig.compilerOptions.target,
                    DJS_VERSION: `v${djs.version}`,
                    SHARD_COUNT: shardCount.toLocaleString(data.lang),
                    SERVER_COUNT: serverCount.toLocaleString(data.lang),
                    SERVER_COUNT_PER_SHARD: Math.round(serverCount / shardCount).toLocaleString(
                        data.lang
                    ),
                    RSS_SIZE: FormatUtils.fileSize(memory.rss),
                    RSS_SIZE_PER_SERVER:
                        serverCount > 0
                            ? FormatUtils.fileSize(memory.rss / serverCount)
                            : Lang.getRef('other.na', data.lang),
                    HEAP_TOTAL_SIZE: FormatUtils.fileSize(memory.heapTotal),
                    HEAP_TOTAL_SIZE_PER_SERVER:
                        serverCount > 0
                            ? FormatUtils.fileSize(memory.heapTotal / serverCount)
                            : Lang.getRef('other.na', data.lang),
                    HEAP_USED_SIZE: FormatUtils.fileSize(memory.heapUsed),
                    HEAP_USED_SIZE_PER_SERVER:
                        serverCount > 0
                            ? FormatUtils.fileSize(memory.heapUsed / serverCount)
                            : Lang.getRef('other.na', data.lang),
                    HOSTNAME: os.hostname(),
                    SHARD_ID: (intr.guild?.shardId ?? 0).toString(),
                    SERVER_ID: intr.guild?.id ?? Lang.getRef('other.na', data.lang),
                    BOT_ID: intr.client.user?.id,
                    USER_ID: intr.user.id,
                })
            );
        }
    }
}
