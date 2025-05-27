import { Guild } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { createRequire } from 'node:module';

import { EventHandler } from './index.js';
import { strings } from '../lang/strings.js';
import { EventDataService, Logger } from '../services/index.js';
import { ClientUtils, FormatUtils, MessageUtils } from '../utils/index.js';

const require = createRequire(import.meta.url);
let Logs = require('../../lang/logs.json');

export class GuildJoinHandler implements EventHandler {
    constructor(private eventDataService: EventDataService) {}

    public async process(guild: Guild): Promise<void> {
        Logger.info(
            Logs.info.guildJoined
                .replaceAll('{GUILD_NAME}', guild.name)
                .replaceAll('{GUILD_ID}', guild.id)
        );

        let owner = await guild.fetchOwner();

        // Get data from database
        let data = await this.eventDataService.create({
            user: owner?.user,
            guild,
        });

        // Send welcome message to the server's notify channel
        let notifyChannel = await ClientUtils.findNotifyChannel(guild, data.langGuild);
        if (notifyChannel) {
            // Create welcome embed using strings
            const welcomeEmbed = new EmbedBuilder()
                .setTitle(strings.embeds.welcome.title)
                .setDescription(strings.embeds.welcome.description)
                .addFields(...strings.embeds.welcome.fields)
                .setColor(strings.colors.default)
                .setTimestamp()
                .setAuthor({
                    name: guild.name,
                    iconURL: guild.iconURL(),
                });
                
            await MessageUtils.send(notifyChannel, { embeds: [welcomeEmbed] });
        }

        // Send welcome message to owner
        if (owner) {
            // Create welcome embed using strings
            const welcomeEmbed = new EmbedBuilder()
                .setTitle(strings.embeds.welcome.title)
                .setDescription(strings.embeds.welcome.description)
                .addFields(...strings.embeds.welcome.fields)
                .setColor(strings.colors.default)
                .setTimestamp()
                .setAuthor({
                    name: guild.name,
                    iconURL: guild.iconURL(),
                });
                
            await MessageUtils.send(owner.user, { embeds: [welcomeEmbed] });
        }
    }
}
