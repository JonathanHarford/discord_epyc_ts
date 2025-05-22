import { MessageContextMenuCommandInteraction, PermissionsString } from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';
import { DateTime } from 'luxon';

import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { Lang } from '../../services/index.js';
import { InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';
import { MessageHelpers } from '../../messaging/MessageHelpers.js';
import { MessageAdapter } from '../../messaging/MessageAdapter.js';

export class ViewDateSent implements Command {
    public names = [Lang.getRef('messageCommands.viewDateSent', Language.Default)];
    public cooldown = new RateLimiter(1, 5000);
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];

    public async execute(
        intr: MessageContextMenuCommandInteraction,
        data: EventData
    ): Promise<void> {
        const dateSentInstruction = MessageHelpers.embedMessage('info', 'displayEmbeds.viewDateSent', {
            DATE: DateTime.fromJSDate(intr.targetMessage.createdAt).toLocaleString(
                DateTime.DATE_HUGE
            ),
        }, true);
        
        await MessageAdapter.processInstruction(dateSentInstruction, intr, data.lang);
    }
}
