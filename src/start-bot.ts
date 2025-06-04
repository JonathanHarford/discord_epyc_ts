import { Options, Partials } from 'discord.js';
import schedule from 'node-schedule';
import { createRequire } from 'node:module';

import { Button } from './buttons/index.js';
import { AdminCommand, DevCommand, GameCommand, HelpCommand, InfoCommand } from './commands/chat/index.js';
import { SeasonCommand } from './commands/chat/season-command.js';
import { Command } from './commands/index.js';
import { ViewDateSent } from './commands/message/index.js';
import { ViewDateJoined } from './commands/user/index.js';
import {
    ButtonHandler,
    CommandHandler,
    DirectMessageHandler,
    GuildJoinHandler,
    GuildLeaveHandler,
    MessageHandler,
    ReactionHandler,
    TriggerHandler,
} from './events/index.js';
import { CustomClient } from './extensions/index.js';
import { AdminGameConfigButtonHandler } from './handlers/adminGameConfigButtonHandler.js';
import { AdminGameConfigModalHandler } from './handlers/adminGameConfigModalHandler.js';
import { AdminSeasonConfigButtonHandler } from './handlers/adminSeasonConfigButtonHandler.js';
import { AdminSeasonConfigModalHandler } from './handlers/adminSeasonConfigModalHandler.js';
import {
    AdminButtonHandler,
    ExampleButtonHandler,
    SeasonCreateModalHandler,
    SeasonDashboardButtonHandler,
    SeasonJoinButtonHandler,
    SeasonListPaginationButtonHandler,
    SeasonSelectMenuHandler,
    SeasonShowButtonHandler,
    TurnClaimButtonHandler,
    TextSubmitPromptButtonHandler, // Added import
    TextSubmitModalHandler         // Added import
} from './handlers/index.js';
import { Job, StaleGameCleanupJob } from './jobs/index.js';
import prisma from './lib/prisma.js';
import { Bot } from './models/bot.js';
import { FlaggedTurnApprovalReaction, FlaggedTurnRejectionReaction } from './reactions/flagged-turn-reaction.js';
import { Reaction } from './reactions/index.js';
import {
    EventDataService,
    GameService,
    JobService,
    Logger,
    PlayerService,
    PlayerTurnService,
    SchedulerService,
    SeasonService,
    SeasonTurnService,
    TurnOfferingService,
} from './services/index.js';
import { OnDemandGameService } from './services/OnDemandGameService.js';
import { OnDemandTurnService } from './services/OnDemandTurnService.js';
import { Trigger } from './triggers/index.js';

const require = createRequire(import.meta.url);
let Config = require('../config/config.json');
let Logs = require('../lang/logs.json');

async function start(): Promise<void> {
    // Services
    let eventDataService = new EventDataService();
    
    // Client
    let client = new CustomClient({
        intents: Config.client.intents,
        partials: (Config.client.partials as string[]).map(partial => Partials[partial]),
        makeCache: Options.cacheWithLimits({
            // Keep default caching behavior
            ...Options.DefaultMakeCacheSettings,
            // Override specific options from config
            ...Config.client.caches,
        }),
    });
    
    // Service instances with proper dependency injection
    const schedulerService = new SchedulerService(prisma);
    const gameService = new GameService(prisma, client);
    const turnService = new SeasonTurnService(prisma, client, schedulerService);
    const seasonService = new SeasonService(prisma, turnService, schedulerService, gameService);
    const turnOfferingService = new TurnOfferingService(prisma, client, turnService, schedulerService);
    const onDemandGameService = new OnDemandGameService(prisma, client, schedulerService);
    const onDemandTurnService = new OnDemandTurnService(prisma, client, schedulerService);
    const playerTurnService = new PlayerTurnService(prisma);
    
    // Set dependencies for SchedulerService to handle different job types
    schedulerService.setDependencies({
        discordClient: client,
        seasonTurnService: turnService,
        onDemandTurnService: onDemandTurnService,
        turnOfferingService: turnOfferingService,
        seasonService: seasonService
    });
    
    // Load persisted jobs on startup
    await schedulerService.loadPersistedJobs();
    
    // Commands with injected services
    let commands: Command[] = [
        // Chat Commands
        new DevCommand(),
        new HelpCommand(),
        new InfoCommand(),
        new SeasonCommand(prisma, seasonService, playerTurnService),
        new AdminCommand(),
        new GameCommand(playerService, turnService, onDemandTurnService), // Corrected instantiation

        // Message Context Commands
        new ViewDateSent(),

        // User Context Commands
        new ViewDateJoined(),

        // Add new commands here as needed
    ];

    // Buttons
    let buttons: Button[] = [
        // Add new buttons here as needed
    ];

    // Reactions
    let reactions: Reaction[] = [
        new FlaggedTurnApprovalReaction(schedulerService),
        new FlaggedTurnRejectionReaction(schedulerService),
        // Add new reactions here as needed
    ];

    // Triggers
    let triggers: Trigger[] = [
        // Add new triggers here as needed
    ];

    // Event handlers
    let guildJoinHandler = new GuildJoinHandler(eventDataService);
    let guildLeaveHandler = new GuildLeaveHandler();
    let commandHandler = new CommandHandler(commands, eventDataService);
    let _buttonHandler = new ButtonHandler(buttons, eventDataService);
    let triggerHandler = new TriggerHandler(triggers, eventDataService);
    let playerService = new PlayerService(prisma);
    let directMessageHandler = new DirectMessageHandler(prisma, client, turnService, playerService, schedulerService, turnOfferingService);
    let messageHandler = new MessageHandler(triggerHandler, directMessageHandler);
    let reactionHandler = new ReactionHandler(reactions, eventDataService);

    // Jobs
    let jobs: Job[] = [
        new StaleGameCleanupJob(prisma, onDemandGameService),
        // Add new jobs here as needed. These are different from scheduled tasks via SchedulerService.
    ];

    // Bot
    let bot = new Bot(
        Config.client.token,
        client,
        guildJoinHandler,
        guildLeaveHandler,
        messageHandler,
        commandHandler,
        null, // No legacy button handler needed
        reactionHandler,
        new JobService(jobs)
    );

    await bot.start();

    // Register example handlers
    bot.addButtonHandler(new ExampleButtonHandler());
    // Register season join button handler
    bot.addButtonHandler(new SeasonJoinButtonHandler());
    // Register season show button handler
    bot.addButtonHandler(new SeasonShowButtonHandler());
    // Register season select menu handler
    bot.addSelectMenuHandler(new SeasonSelectMenuHandler());
    // Register season create modal handler
    bot.addModalHandler(new SeasonCreateModalHandler());
    // Register admin config modal handlers
    bot.addModalHandler(new AdminSeasonConfigModalHandler());
    bot.addModalHandler(new AdminGameConfigModalHandler());
    // Register season dashboard button handler
    bot.addButtonHandler(new SeasonDashboardButtonHandler());
    // Register admin button handler
    bot.addButtonHandler(new AdminButtonHandler());
    // Register season list pagination button handler
    bot.addButtonHandler(new SeasonListPaginationButtonHandler());
    // Register turn claim button handler
    bot.addButtonHandler(new TurnClaimButtonHandler());
    // Register admin config button handlers
    bot.addButtonHandler(new AdminGameConfigButtonHandler());
    bot.addButtonHandler(new AdminSeasonConfigButtonHandler());
    // To test other handlers, you would add them here:
    // bot.addAutocompleteHandler(new ExampleAutocompleteHandler());

    // Register new text submission handlers
    const textSubmitPromptButtonHandler = new TextSubmitPromptButtonHandler();
    bot.addButtonHandler(textSubmitPromptButtonHandler);
    Logger.info(`Registered Button Handler: ${textSubmitPromptButtonHandler.constructor.name} with prefix ${textSubmitPromptButtonHandler.customIdPrefix}`);

    const textSubmitModalHandler = new TextSubmitModalHandler(); // Assumes constructor needs no args
    bot.addModalHandler(textSubmitModalHandler);
    Logger.info(`Registered Modal Handler: ${textSubmitModalHandler.constructor.name} with prefix ${textSubmitModalHandler.customIdPrefix}`);
}

process.on('unhandledRejection', (reason, _promise) => {
    Logger.error(Logs.error.unhandledRejection, reason);
});

start().catch(error => {
    Logger.error(Logs.error.unspecified, error);
});

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
    Logger.info(Logs.info.shuttingDown.replaceAll('{SIGNAL}', signal));
    try {
        // Perform bot-specific cleanup first (e.g., client.destroy())
        // Assuming 'bot' instance is accessible or has a static stop method
        // if (bot && typeof bot.stop === 'function') {
        //     await bot.stop(); 
        // } else if (client && typeof client.destroy === 'function') {
        //     client.destroy();
        // }
        // Add any other specific cleanup for your bot here

        await schedule.gracefulShutdown();
        Logger.info(Logs.info.jobsCancelled);
    } catch (error) {
        Logger.error(Logs.error.shutdown, error);
    }
    process.exit(0);
}

process.on('SIGINT', async () => {
    await shutdown('SIGINT');
});

process.on('SIGTERM', async () => {
    await shutdown('SIGTERM');
});
