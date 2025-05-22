import { ChatInputCommandInteraction, EmbedBuilder, PermissionsString } from 'discord.js';

import { InfoOption } from '../../enums/index.js';
import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { Lang } from '../../services/index.js';
import { InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';
import { MessageHelpers } from '../../messaging/MessageHelpers.js';
import { MessageAdapter } from '../../messaging/MessageAdapter.js';

export class InfoCommand implements Command {
    public names = [Lang.getRef('chatCommands.info', Language.Default)];
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        let args = {
            option: intr.options.getString(
                Lang.getRef('arguments.option', Language.Default)
            ) as InfoOption,
        };

        let messageKey: string;
        let messageData: Record<string, any> = {};

        switch (args.option) {
            case InfoOption.ABOUT: {
                messageKey = 'displayEmbeds.about';
                break;
            }
            case InfoOption.TRANSLATE: {
                messageKey = 'displayEmbeds.translate';
                // Note: The dynamic field addition for translators will be handled by the MessageAdapter
                // when it processes the embed. For now, we'll use the base translate embed.
                break;
            }
            default: {
                return;
            }
        }

        const instruction = MessageHelpers.embedMessage('info', messageKey, messageData, true);
        
        // Special handling for translate option to add dynamic fields
        if (args.option === InfoOption.TRANSLATE) {
            // We need to create a custom instruction that includes the translator fields
            // This is a limitation of the current MessageAdapter - it doesn't support dynamic field addition
            // For now, we'll fall back to the original method for this specific case
            let embed = Lang.getEmbed('displayEmbeds.translate', data.lang);
            for (let langCode of Language.Enabled) {
                embed.addFields([
                    {
                        name: Language.Data[langCode].nativeName,
                        value: Lang.getRef('meta.translators', langCode),
                    },
                ]);
            }
            await InteractionUtils.send(intr, embed);
            return;
        }

        await MessageAdapter.processInstruction(instruction, intr, data.lang);
    }
}
