import djs, { ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { createRequire } from 'node:module';
import os from 'node:os';
import typescript from 'typescript';

import { DevCommandName } from '../../enums/index.js';
import { strings } from '../../lang/strings.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { EventData } from '../../models/internal-models.js';
import { FormatUtils, ShardUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

const require = createRequire(import.meta.url);
let Config = require('../../../config/config.json');
let TsConfig = require('../../../tsconfig.json');

export class DevCommand implements Command {
    public names = [strings.chatCommands.dev];
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];
    public async execute(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        if (!Config.developers.includes(intr.user.id)) {
            await SimpleMessage.sendWarning(intr, 'This command is only available to developers.', {}, true);
            return;
        }

        let args = {
            command: intr.options.getString(strings.arguments.command) as DevCommandName,
        };

        switch (args.command) {
            case DevCommandName.INFO: {
                let shardCount = intr.client.shard?.count ?? 1;
                let serverCount: number;
                if (intr.client.shard) {
                    try {
                        serverCount = await ShardUtils.serverCount(intr.client.shard);
                    } catch (error) {
                        if (error.name.includes('ShardingInProcess')) {
                            await SimpleMessage.sendError(intr, 'Bot is still starting up. Please try again later.', {}, true);
                            return;
                        } else {
                            throw error;
                        }
                    }
                } else {
                    serverCount = intr.client.guilds.cache.size;
                }

                let memory = process.memoryUsage();

                await SimpleMessage.sendEmbed(intr, strings.embeds.devInfo, {
                    NODE_VERSION: process.version,
                    TS_VERSION: `v${typescript.version}`,
                    ES_VERSION: TsConfig.compilerOptions.target,
                    DJS_VERSION: `v${djs.version}`,
                    SHARD_COUNT: shardCount.toLocaleString(),
                    SERVER_COUNT: serverCount.toLocaleString(),
                    SERVER_COUNT_PER_SHARD: Math.round(serverCount / shardCount).toLocaleString(),
                    RSS_SIZE: FormatUtils.fileSize(memory.rss),
                    RSS_SIZE_PER_SERVER:
                        serverCount > 0
                            ? FormatUtils.fileSize(memory.rss / serverCount)
                            : strings.messages.na,
                    HEAP_TOTAL_SIZE: FormatUtils.fileSize(memory.heapTotal),
                    HEAP_TOTAL_SIZE_PER_SERVER:
                        serverCount > 0
                            ? FormatUtils.fileSize(memory.heapTotal / serverCount)
                            : strings.messages.na,
                    HEAP_USED_SIZE: FormatUtils.fileSize(memory.heapUsed),
                    HEAP_USED_SIZE_PER_SERVER:
                        serverCount > 0
                            ? FormatUtils.fileSize(memory.heapUsed / serverCount)
                            : strings.messages.na,
                    HOSTNAME: os.hostname(),
                    SHARD_ID: (intr.guild?.shardId ?? 0).toString(),
                    SERVER_ID: intr.guild?.id ?? strings.messages.na,
                    BOT_ID: intr.client.user?.id,
                    USER_ID: intr.user.id,
                }, true, 'info');
                break;
            }
            default: {
                return;
            }
        }
    }
}
