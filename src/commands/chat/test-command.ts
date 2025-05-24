import { ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';

import { EventData } from '../../models/internal-models.js';
import { InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { strings } from '../../lang/strings.js';

export class TestCommand implements Command {
    public names = [strings.commands.test];
    public cooldown = new RateLimiter(1, 5000);
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        await SimpleMessage.sendEmbed(intr, strings.embeds.test, {}, true);
    }
}
