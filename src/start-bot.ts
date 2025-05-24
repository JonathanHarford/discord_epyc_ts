import { REST } from '@discordjs/rest';
import { Options, Partials } from 'discord.js';
import { createRequire } from 'node:module';
import schedule from 'node-schedule';

import { Button } from './buttons/index.js';
import { DevCommand, HelpCommand, InfoCommand, TestCommand, AdminCommand, ConfigCommand } from './commands/chat/index.js';
import NewCommand from './commands/chat/new-command.js';
import JoinSeasonCommand from './commands/chat/joinSeason.js';
import StatusCommand from './commands/chat/status-command.js';
import {
    ChatCommandMetadata,
    Command,
    MessageCommandMetadata,
    UserCommandMetadata,
} from './commands/index.js';
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
    CommandRegistrationService,
    EventDataService,
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
    const turnService = new TurnService(prisma, client);
    const seasonService = new SeasonService(prisma, turnService, schedulerService);
    const turnOfferingService = new TurnOfferingService(prisma, client, turnService, schedulerService);
    
    // Set dependencies for SchedulerService to handle different job types
    schedulerService.setDependencies({
        discordClient: client,
        turnService: turnService,
        turnOfferingService: turnOfferingService
    });
    
    // Load persisted jobs on startup
    await schedulerService.loadPersistedJobs();
    
    // Commands with injected services
    let commands: Command[] = [
        // Chat Commands
        new DevCommand(),
        new HelpCommand(),
        new InfoCommand(),
        new TestCommand(),
        new NewCommand(prisma, seasonService),
        new JoinSeasonCommand(prisma, seasonService),
        new StatusCommand(prisma, seasonService, turnService),
        new AdminCommand(),
        new ConfigCommand(),

        // Message Context Commands
        new ViewDateSent(),

        // User Context Commands
        new ViewDateJoined(),

        // TODO: Add new commands here
    ];

    // Buttons
    let buttons: Button[] = [
        // TODO: Add new buttons here
    ];

    // Reactions
    let reactions: Reaction[] = [
        // TODO: Add new reactions here
    ];

    // Triggers
    let triggers: Trigger[] = [
        // TODO: Add new triggers here
    ];

    // Event handlers
    let guildJoinHandler = new GuildJoinHandler(eventDataService);
    let guildLeaveHandler = new GuildLeaveHandler();
    let commandHandler = new CommandHandler(commands, eventDataService);
    let buttonHandler = new ButtonHandler(buttons, eventDataService);
    let triggerHandler = new TriggerHandler(triggers, eventDataService);
    let playerService = new PlayerService(prisma);
    let directMessageHandler = new DirectMessageHandler(turnService, playerService, schedulerService, turnOfferingService);
    let messageHandler = new MessageHandler(triggerHandler, directMessageHandler);
    let reactionHandler = new ReactionHandler(reactions, eventDataService);

    // Jobs
    let jobs: Job[] = [
        // TODO: Add new jobs here. These are different from scheduled tasks via SchedulerService.
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

    // Register
    if (process.argv[2] == 'commands') {
        try {
            let rest = new REST({ version: '10' }).setToken(Config.client.token);
            let commandRegistrationService = new CommandRegistrationService(rest);
            let localCmds = [
                ...Object.values(ChatCommandMetadata).sort((a, b) => (a.name > b.name ? 1 : -1)),
                ...Object.values(MessageCommandMetadata).sort((a, b) => (a.name > b.name ? 1 : -1)),
                ...Object.values(UserCommandMetadata).sort((a, b) => (a.name > b.name ? 1 : -1)),
            ];
            await commandRegistrationService.process(localCmds, process.argv);
        } catch (error) {
            Logger.error(Logs.error.commandAction, error);
        }
        // Wait for any final logs to be written.
        await new Promise(resolve => setTimeout(resolve, 1000));
        process.exit();
    }

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
