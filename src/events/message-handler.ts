import { ChannelType, Message } from 'discord.js';

import { DirectMessageHandler } from './direct-message-handler.js';
import { EventHandler, TriggerHandler } from './index.js';

export class MessageHandler implements EventHandler {
    constructor(
        private triggerHandler: TriggerHandler,
        private directMessageHandler: DirectMessageHandler
    ) {}

    public async process(msg: Message): Promise<void> {
        // Don't respond to system messages or self
        if (msg.system || msg.author.id === msg.client.user?.id) {
            return;
        }

        // Handle direct messages based on channel type
        if (msg.channel.type === ChannelType.DM) {
            await this.directMessageHandler.process(msg);
            return;
        }

        // Process trigger for regular channel messages
        await this.triggerHandler.process(msg);
    }
}
