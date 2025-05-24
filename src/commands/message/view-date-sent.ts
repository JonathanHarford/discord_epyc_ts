import { MessageContextMenuCommandInteraction, PermissionsString } from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';
import { DateTime } from 'luxon';

import { EventData } from '../../models/internal-models.js';
import { strings } from '../../lang/strings.js';
import { Command, CommandDeferType } from '../index.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';

export class ViewDateSent implements Command {
    public names = ["View Date Sent"];
    public cooldown = new RateLimiter(1, 5000);
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];

    public async execute(
        intr: MessageContextMenuCommandInteraction,
        data: EventData
    ): Promise<void> {
        const dateString = DateTime.fromJSDate(intr.targetMessage.createdAt).toLocaleString(
            DateTime.DATE_HUGE
        );
        
        await SimpleMessage.sendInfo(intr, `**Message sent on:** ${dateString}`, {}, true);
    }
}
