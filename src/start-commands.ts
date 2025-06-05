import { REST } from '@discordjs/rest';
import { createRequire } from 'node:module';

// Load environment variables from .env file
import 'dotenv/config';

import {
    ChatCommandMetadata,
    MessageCommandMetadata,
    UserCommandMetadata,
} from './commands/index.js';
import { CommandRegistrationService, Logger } from './services/index.js';

const require = createRequire(import.meta.url);
let Logs = require('../lang/logs.json');

async function processCommands(): Promise<void> {
    try {
        // Use environment variable for client token
        let rest = new REST({ version: '10' }).setToken(process.env.CLIENT_TOKEN || ''); // Provide a default empty string or handle missing token appropriately
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

process.on('unhandledRejection', (reason, _promise) => {
    Logger.error(Logs.error.unhandledRejection, reason);
});

processCommands().catch(error => {
    Logger.error(Logs.error.unspecified, error);
}); 