import { ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';

import { strings } from '../../lang/strings.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { EventData } from '../../models/internal-models.js';
import { Command, CommandDeferType } from '../index.js';

export class HelpCommand implements Command {
    public names = [strings.commands.help];
    public cooldown = new RateLimiter(1, 5000);
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];

    public async execute(intr: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        let option = intr.options.getString('option');

        switch (option) {
            case 'contact-support':
                await SimpleMessage.sendEmbed(intr, strings.embeds.helpContactSupport);
                break;
            case 'commands':
                await SimpleMessage.sendEmbed(intr, strings.embeds.helpCommands);
                break;
            default:
                await SimpleMessage.sendEmbed(intr, strings.embeds.helpCommands);
                break;
        }
    }
}
