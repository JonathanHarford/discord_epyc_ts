
import { Options, Partials } from 'discord.js';
import { createRequire } from 'node:module';
import schedule from 'node-schedule';

import { Button } from './buttons/index.js';
import { DevCommand, HelpCommand, InfoCommand, AdminCommand } from './commands/chat/index.js';
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
import { Job } from './jobs/index.js';
import { Bot } from './models/bot.js';
import { Reaction } from './reactions/index.js';
import {
    EventDataService,
    GameService,
    JobService,
    Logger,
    PlayerService,
    SchedulerService,
    SeasonService,
    TurnService,
    TurnOfferingService,
} from './services/index.js';
import { Trigger } from './triggers/index.js';
import prisma from './lib/prisma.js';

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
    const gameService = new GameService(prisma);
    const turnService = new TurnService(prisma, client, schedulerService);
    const seasonService = new SeasonService(prisma, turnService, schedulerService, gameService);
    const turnOfferingService = new TurnOfferingService(prisma, client, turnService, schedulerService);
    
    // Set dependencies for SchedulerService to handle different job types
    schedulerService.setDependencies({
        discordClient: client,
        turnService: turnService,
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
        new SeasonCommand(prisma, seasonService),
        new AdminCommand(),

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
    let buttonHandler = new ButtonHandler(buttons, eventDataService);
    let triggerHandler = new TriggerHandler(triggers, eventDataService);
    let playerService = new PlayerService(prisma);
    let directMessageHandler = new DirectMessageHandler(prisma, client, turnService, playerService, schedulerService, turnOfferingService);
    let messageHandler = new MessageHandler(triggerHandler, directMessageHandler);
    let reactionHandler = new ReactionHandler(reactions, eventDataService);

    // Jobs
    let jobs: Job[] = [
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
        buttonHandler,
        reactionHandler,
        new JobService(jobs)
    );

    await bot.start();
}

process.on('unhandledRejection', (reason, _promise) => {
    Logger.error(Logs.error.unhandledRejection, reason);
});

start().catch(error => {
    Logger.error(Logs.error.unspecified, error);
});

// Graceful shutdown
async function shutdown(signal: string) {
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
