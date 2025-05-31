import { DMChannel, PermissionsString, UserContextMenuCommandInteraction } from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';
import { DateTime } from 'luxon';


import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { EventData } from '../../models/internal-models.js';
import { Command, CommandDeferType } from '../index.js';

export class ViewDateJoined implements Command {
    public names = ['View Date Joined'];
    public cooldown = new RateLimiter(1, 5000);
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];

    public async execute(intr: UserContextMenuCommandInteraction, _data: EventData): Promise<void> {
        let joinDate: Date;
        if (!(intr.channel instanceof DMChannel)) {
            let member = await intr.guild.members.fetch(intr.targetUser.id);
            joinDate = member.joinedAt;
        } else joinDate = intr.targetUser.createdAt;

        const dateString = DateTime.fromJSDate(joinDate).toLocaleString(DateTime.DATE_HUGE);
        const message = intr.channel instanceof DMChannel 
            ? `**${intr.targetUser.toString()} created account on:** ${dateString}`
            : `**${intr.targetUser.toString()} joined server on:** ${dateString}`;
        
        await SimpleMessage.sendInfo(intr, message, {}, true);
    }
}
