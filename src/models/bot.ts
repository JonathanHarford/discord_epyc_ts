import {
    Client,
    Events,
    Guild,
    Interaction,
    Message,
    MessageReaction,
    PartialMessageReaction,
    PartialUser,
    RateLimitData,
    RESTEvents,
    User,
} from 'discord.js';
import { createRequire } from 'node:module';

import {
    CommandHandler,
    GuildJoinHandler,
    GuildLeaveHandler,
    ButtonHandler as LegacyButtonHandler,
    MessageHandler,
    ReactionHandler,
} from '../events/index.js';
import {
    AutocompleteHandler,
    ButtonHandler,
    InteractionHandlerFactory,
    ModalHandler,
    SelectMenuHandler,
} from '../handlers/index.js';
import { JobService, Logger } from '../services/index.js';
import { PartialUtils } from '../utils/index.js';

const require = createRequire(import.meta.url);
let Config = require('../../config/config.json');
let Debug = require('../../config/debug.json');
let Logs = require('../../lang/logs.json');

export class Bot {
    private ready = false;

    private interactionFactory = new InteractionHandlerFactory();

    // Legacy handler maps for backward compatibility
    private buttonHandlers: Map<string, ButtonHandler> = new Map();
    private selectMenuHandlers: Map<string, SelectMenuHandler> = new Map();
    private modalHandlers: Map<string, ModalHandler> = new Map();
    private autocompleteHandlers: Map<string, AutocompleteHandler> = new Map();

    constructor(
        private token: string,
        private client: Client,
        private guildJoinHandler: GuildJoinHandler,
        private guildLeaveHandler: GuildLeaveHandler,
        private messageHandler: MessageHandler,
        private commandHandler: CommandHandler,
        private legacyButtonHandler: LegacyButtonHandler | null, // Made optional
        private reactionHandler: ReactionHandler,
        private jobService: JobService
    ) {}

    public addButtonHandler(handler: ButtonHandler): void {
        // Register with both factory and legacy map for backward compatibility
        this.interactionFactory.registerButtonHandler(handler);
        this.buttonHandlers.set(handler.customIdPrefix, handler);
    }

    public addSelectMenuHandler(handler: SelectMenuHandler): void {
        this.interactionFactory.registerSelectMenuHandler(handler);
        this.selectMenuHandlers.set(handler.customIdPrefix, handler);
    }

    public addModalHandler(handler: ModalHandler): void {
        this.interactionFactory.registerModalHandler(handler);
        this.modalHandlers.set(handler.customIdPrefix, handler);
    }

    public addAutocompleteHandler(handler: AutocompleteHandler): void {
        this.interactionFactory.registerAutocompleteHandler(handler);
        this.autocompleteHandlers.set(handler.commandName, handler);
    }

    /**
     * Get statistics about registered interaction handlers
     */
    public getInteractionStats(): {
        buttonHandlers: number;
        selectMenuHandlers: number;
        modalHandlers: number;
        autocompleteHandlers: number;
        cacheSize: {
            buttons: number;
            selectMenus: number;
            modals: number;
        };
    } {
        return this.interactionFactory.getStats();
    }

    public async start(): Promise<void> {
        this.registerListeners();
        await this.login(this.token);
    }

    private registerListeners(): void {
        this.client.on(Events.ClientReady, () => this.onReady());
        this.client.on(Events.ShardReady, (shardId: number, unavailableGuilds: Set<string>) =>
            this.onShardReady(shardId, unavailableGuilds)
        );
        this.client.on(Events.GuildCreate, (guild: Guild) => this.onGuildJoin(guild));
        this.client.on(Events.GuildDelete, (guild: Guild) => this.onGuildLeave(guild));
        this.client.on(Events.MessageCreate, (msg: Message) => this.onMessage(msg));
        this.client.on(Events.InteractionCreate, (intr: Interaction) => this.onInteraction(intr));
        this.client.on(
            Events.MessageReactionAdd,
            (messageReaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) =>
                this.onReaction(messageReaction, user)
        );
        this.client.rest.on(RESTEvents.RateLimited, (rateLimitData: RateLimitData) =>
            this.onRateLimit(rateLimitData)
        );
    }

    private async login(token: string): Promise<void> {
        try {
            await this.client.login(token);
        } catch (error) {
            Logger.error(Logs.error.clientLogin, error);
            return;
        }
    }

    private async onReady(): Promise<void> {
        let userTag = this.client.user?.tag;
        Logger.info(Logs.info.clientLogin.replaceAll('{USER_TAG}', userTag));

        if (!Debug.dummyMode.enabled) {
            this.jobService.start();
        }

        this.ready = true;
        Logger.info(Logs.info.clientReady);
    }

    private onShardReady(shardId: number, _unavailableGuilds: Set<string>): void {
        Logger.setShardId(shardId);
    }

    private async onGuildJoin(guild: Guild): Promise<void> {
        if (!this.ready || Debug.dummyMode.enabled) {
            return;
        }

        try {
            await this.guildJoinHandler.process(guild);
        } catch (error) {
            Logger.error(Logs.error.guildJoin, error);
        }
    }

    private async onGuildLeave(guild: Guild): Promise<void> {
        if (!this.ready || Debug.dummyMode.enabled) {
            return;
        }

        try {
            await this.guildLeaveHandler.process(guild);
        } catch (error) {
            Logger.error(Logs.error.guildLeave, error);
        }
    }

    private async onMessage(msg: Message): Promise<void> {
        if (
            !this.ready ||
            (Debug.dummyMode.enabled && !Debug.dummyMode.whitelist.includes(msg.author.id))
        ) {
            return;
        }

        try {
            msg = await PartialUtils.fillMessage(msg);
            if (!msg) {
                return;
            }

            await this.messageHandler.process(msg);
        } catch (error) {
            Logger.error(Logs.error.message, error);
        }
    }

    private async onInteraction(intr: Interaction): Promise<void> {
        if (
            !this.ready ||
            (Debug.dummyMode.enabled && !Debug.dummyMode.whitelist.includes(intr.user.id))
        ) {
            return;
        }

        // Log interaction type and customId/command name
        if (intr.isCommand()) {
            console.log(`Command interaction: ${intr.commandName}`);
            // Existing handler
            // console.log(`Command interaction: ${intr.commandName}`); // Original logging
            // Existing handler for application commands (slash commands)
            try {
                // CommandHandler.process should be able to distinguish
                // between CommandInteraction and AutocompleteInteraction.
                await this.commandHandler.process(intr);
            } catch (error) {
                Logger.error(Logs.error.command, error);
                // For CommandInteraction, we might reply. For Autocomplete, usually not.
                if (intr.isCommand() && intr.isRepliable()) {
                    await intr.reply({ content: 'There was an error while executing this command!', ephemeral: true }).catch(err => Logger.error('Failed to send error reply for command interaction:', err));
                }
                // For Autocomplete errors, the handler itself should respond with [] or log.
            }
        } else if (intr.isAutocomplete()) {
             // This block should now be handled by CommandHandler.process
             // Logger.info(`Autocomplete interaction detected for command: ${intr.commandName}`);
            try {
                await this.commandHandler.process(intr);
            } catch (error) {
                // Errors for autocomplete are typically handled by responding with an empty list or logging.
                // The command's handleAutocomplete method should manage this.
                Logger.error(`Error during autocomplete processing routed via main onInteraction for ${intr.commandName}:`, error);
            }
        } else if (intr.isButton()) {
            try {
                // Try the new factory first
                const handled = await this.interactionFactory.handleButtonInteraction(intr);
                if (!handled) {
                    // Fallback to legacy button handler if available
                    if (this.legacyButtonHandler) {
                        await this.legacyButtonHandler.process(intr);
                    } else {
                        Logger.warn(`No button handler found for customId: ${intr.customId}`);
                        if (intr.isRepliable()) {
                            await intr.reply({ content: 'This button is not currently handled.', ephemeral: true }).catch(err => Logger.error('Failed to send error reply for unhandled button:', err));
                        }
                    }
                }
            } catch (error) {
                Logger.error(`Error executing button handler for customId ${intr.customId}:`, error);
                if (intr.isRepliable()) {
                    await intr.reply({ content: 'There was an error processing this action.', ephemeral: true }).catch(err => Logger.error('Failed to send error reply for button interaction:', err));
                }
            }
        } else if (intr.isStringSelectMenu()) {
            try {
                const handled = await this.interactionFactory.handleSelectMenuInteraction(intr);
                if (!handled) {
                    Logger.warn(`No select menu handler found for customId: ${intr.customId}`);
                    if (intr.isRepliable()) {
                        await intr.reply({ content: 'This selection is not currently handled.', ephemeral: true }).catch(err => Logger.error('Failed to send error reply for unhandled select menu:', err));
                    }
                }
            } catch (error) {
                Logger.error(`Error executing select menu handler for customId ${intr.customId}:`, error);
                if (intr.isRepliable()) {
                    await intr.reply({ content: 'There was an error processing this selection.', ephemeral: true }).catch(err => Logger.error('Failed to send error reply for select menu interaction:', err));
                }
            }
        } else if (intr.isModalSubmit()) {
            try {
                const handled = await this.interactionFactory.handleModalInteraction(intr);
                if (!handled) {
                    Logger.warn(`No modal submit handler found for customId: ${intr.customId}`);
                    if (intr.isRepliable()) {
                        await intr.reply({ content: 'This submission is not currently handled.', ephemeral: true }).catch(err => Logger.error('Failed to send error reply for unhandled modal:', err));
                    }
                }
            } catch (error) {
                Logger.error(`Error executing modal submit handler for customId ${intr.customId}:`, error);
                if (intr.isRepliable()) {
                    await intr.reply({ content: 'There was an error processing your submission.', ephemeral: true }).catch(err => Logger.error('Failed to send error reply for modal submission:', err));
                }
            }
        } else {
            console.log('Unknown interaction type in onInteraction:', intr.type);
            // Attempt to log basic info if possible
            if ('customId' in intr && typeof intr.customId === 'string') {
                console.log(`Unknown interaction with customId: ${intr.customId}`);
            } else if ('commandName' in intr && typeof intr.commandName === 'string') {
                console.log(`Unknown interaction with commandName: ${intr.commandName}`);
            }
             if (intr.isRepliable()) {
                await intr.reply({ content: 'This interaction is not recognized.', ephemeral: true }).catch(err => Logger.error('Failed to send error reply for unknown interaction type:', err));
            }
        }
    }

    private async onReaction(
        msgReaction: MessageReaction | PartialMessageReaction,
        reactor: User | PartialUser
    ): Promise<void> {
        if (
            !this.ready ||
            (Debug.dummyMode.enabled && !Debug.dummyMode.whitelist.includes(reactor.id))
        ) {
            return;
        }

        try {
            msgReaction = await PartialUtils.fillReaction(msgReaction);
            if (!msgReaction) {
                return;
            }

            reactor = await PartialUtils.fillUser(reactor);
            if (!reactor) {
                return;
            }

            await this.reactionHandler.process(
                msgReaction,
                msgReaction.message as Message,
                reactor
            );
        } catch (error) {
            Logger.error(Logs.error.reaction, error);
        }
    }

    private async onRateLimit(rateLimitData: RateLimitData): Promise<void> {
        if (rateLimitData.timeToReset >= Config.logging.rateLimit.minTimeout * 1000) {
            Logger.error(Logs.error.apiRateLimit, rateLimitData);
        }
    }
}
