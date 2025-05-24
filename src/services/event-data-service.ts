import {
    Channel,
    CommandInteractionOptionResolver,
    Guild,
    PartialDMChannel,
    User,
    Locale,
} from 'discord.js';

import { EventData } from '../models/internal-models.js';

export class EventDataService {
    public async create(
        options: {
            user?: User;
            channel?: Channel | PartialDMChannel;
            guild?: Guild;
            args?: Omit<CommandInteractionOptionResolver, 'getMessage' | 'getFocused'>;
        } = {}
    ): Promise<EventData> {
        // Retrieve any data needed for events

        // Event language - simplified to just use English locale
        let lang: Locale = Locale.EnglishUS;

        // Guild language - simplified to just use English locale  
        let langGuild: Locale = Locale.EnglishUS;

        return new EventData(lang, langGuild);
    }
}
