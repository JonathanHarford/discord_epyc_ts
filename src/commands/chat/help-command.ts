import { ChatInputCommandInteraction, EmbedBuilder, PermissionsString } from 'discord.js';

import { HelpOption } from '../../enums/index.js';
import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { Lang } from '../../services/index.js';
import { ClientUtils, FormatUtils, InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';
import { MessageHelpers } from '../../messaging/MessageHelpers.js';
import { MessageAdapter } from '../../messaging/MessageAdapter.js';

export class HelpCommand implements Command {
    public names = [Lang.getRef('chatCommands.help', Language.Default)];
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];
    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        let args = {
            option: intr.options.getString(
                Lang.getRef('arguments.option', Language.Default)
            ) as HelpOption,
        };

        let messageKey: string;
        let messageData: Record<string, any> = {};

        switch (args.option) {
            case HelpOption.CONTACT_SUPPORT: {
                messageKey = 'displayEmbeds.helpContactSupport';
                break;
            }
            case HelpOption.COMMANDS: {
                messageKey = 'displayEmbeds.helpCommands';
                messageData = {
                    CMD_LINK_TEST: FormatUtils.commandMention(
                        await ClientUtils.findAppCommand(
                            intr.client,
                            Lang.getRef('chatCommands.test', Language.Default)
                        )
                    ),
                    CMD_LINK_INFO: FormatUtils.commandMention(
                        await ClientUtils.findAppCommand(
                            intr.client,
                            Lang.getRef('chatCommands.info', Language.Default)
                        )
                    ),
                };
                break;
            }
            default: {
                return;
            }
        }

        const instruction = MessageHelpers.embedMessage('info', messageKey, messageData, true);
        await MessageAdapter.processInstruction(instruction, intr, data.lang);
    }
}
