import { REST } from '@discordjs/rest';
import {
    APIApplicationCommand,
    RESTGetAPIApplicationCommandsResult,
    RESTPatchAPIApplicationCommandJSONBody,
    RESTPostAPIApplicationCommandsJSONBody,
    Routes,
} from 'discord.js';
import { createRequire } from 'node:module';
import 'dotenv/config';

import { Logger } from './logger.js';

const require = createRequire(import.meta.url);
let Config = require('../../config/config.json');
let Logs = require('../../lang/logs.json');

export class CommandRegistrationService {
    constructor(private rest: REST) {}

    public async process(
        localCmds: RESTPostAPIApplicationCommandsJSONBody[],
        args: string[]
    ): Promise<void> {
        // Check if we should use guild commands (faster than global)
        const guildId = Config.client.guildId;
        const useGuildCommands = args[4] === 'guild' || (guildId && args[4] !== 'global');
        
        // Get the correct route based on if we're using guild or global commands
        const routeFunction = useGuildCommands 
            ? () => Routes.applicationGuildCommands(Config.client.id, guildId)
            : () => Routes.applicationCommands(Config.client.id);
        
        // Log which mode we're using
        if (useGuildCommands) {
            Logger.info(`Using guild-specific commands for guild ID: ${guildId}`);
        } else {
            Logger.info('Using global commands registration');
        }

        let remoteCmds = (await this.rest.get(
            routeFunction()
        )) as RESTGetAPIApplicationCommandsResult;

        let localCmdsOnRemote = localCmds.filter(localCmd =>
            remoteCmds.some(remoteCmd => remoteCmd.name === localCmd.name)
        );
        let localCmdsOnly = localCmds.filter(
            localCmd => !remoteCmds.some(remoteCmd => remoteCmd.name === localCmd.name)
        );
        let remoteCmdsOnly = remoteCmds.filter(
            remoteCmd => !localCmds.some(localCmd => localCmd.name === remoteCmd.name)
        );

        switch (args[3]) {
            case 'view': {
                Logger.info(
                    Logs.info.commandActionView
                        .replaceAll(
                            '{LOCAL_AND_REMOTE_LIST}',
                            this.formatCommandList(localCmdsOnRemote)
                        )
                        .replaceAll('{LOCAL_ONLY_LIST}', this.formatCommandList(localCmdsOnly))
                        .replaceAll('{REMOTE_ONLY_LIST}', this.formatCommandList(remoteCmdsOnly))
                );
                return;
            }
            case 'register': {
                if (localCmdsOnly.length > 0) {
                    Logger.info(
                        Logs.info.commandActionCreating.replaceAll(
                            '{COMMAND_LIST}',
                            this.formatCommandList(localCmdsOnly)
                        )
                    );
                    for (let localCmd of localCmdsOnly) {
                        await this.rest.post(routeFunction(), {
                            body: localCmd,
                        });
                    }
                    Logger.info(Logs.info.commandActionCreated);
                }

                if (localCmdsOnRemote.length > 0) {
                    Logger.info(
                        Logs.info.commandActionUpdating.replaceAll(
                            '{COMMAND_LIST}',
                            this.formatCommandList(localCmdsOnRemote)
                        )
                    );
                    for (let localCmd of localCmdsOnRemote) {
                        await this.rest.post(routeFunction(), {
                            body: localCmd,
                        });
                    }
                    Logger.info(Logs.info.commandActionUpdated);
                }

                return;
            }
            case 'rename': {
                let oldName = args[4];
                let newName = args[5];
                if (!(oldName && newName)) {
                    Logger.error(Logs.error.commandActionRenameMissingArg);
                    return;
                }

                let remoteCmd = remoteCmds.find(remoteCmd => remoteCmd.name == oldName);
                if (!remoteCmd) {
                    Logger.error(
                        Logs.error.commandActionNotFound.replaceAll('{COMMAND_NAME}', oldName)
                    );
                    return;
                }

                Logger.info(
                    Logs.info.commandActionRenaming
                        .replaceAll('{OLD_COMMAND_NAME}', remoteCmd.name)
                        .replaceAll('{NEW_COMMAND_NAME}', newName)
                );
                let body: RESTPatchAPIApplicationCommandJSONBody = {
                    name: newName,
                };
                // For rename we use the specific command route
                const commandRoute = useGuildCommands
                    ? Routes.applicationGuildCommand(Config.client.id, guildId, remoteCmd.id)
                    : Routes.applicationCommand(Config.client.id, remoteCmd.id);
                
                await this.rest.patch(commandRoute, {
                    body,
                });
                Logger.info(Logs.info.commandActionRenamed);
                return;
            }
            case 'delete': {
                let name = args[4];
                if (!name) {
                    Logger.error(Logs.error.commandActionDeleteMissingArg);
                    return;
                }

                let remoteCmd = remoteCmds.find(remoteCmd => remoteCmd.name == name);
                if (!remoteCmd) {
                    Logger.error(
                        Logs.error.commandActionNotFound.replaceAll('{COMMAND_NAME}', name)
                    );
                    return;
                }

                Logger.info(
                    Logs.info.commandActionDeleting.replaceAll('{COMMAND_NAME}', remoteCmd.name)
                );
                // For delete we use the specific command route
                const commandRoute = useGuildCommands
                    ? Routes.applicationGuildCommand(Config.client.id, guildId, remoteCmd.id)
                    : Routes.applicationCommand(Config.client.id, remoteCmd.id);
                
                await this.rest.delete(commandRoute);
                Logger.info(Logs.info.commandActionDeleted);
                return;
            }
            case 'clear': {
                Logger.info(
                    Logs.info.commandActionClearing.replaceAll(
                        '{COMMAND_LIST}',
                        this.formatCommandList(remoteCmds)
                    )
                );
                await this.rest.put(routeFunction(), { body: [] });
                Logger.info(Logs.info.commandActionCleared);
                return;
            }
        }
    }

    private formatCommandList(
        cmds: RESTPostAPIApplicationCommandsJSONBody[] | APIApplicationCommand[]
    ): string {
        if (cmds.length === 0) {
            return 'N/A';
        }

        return cmds.map(cmd => this.formatCommandDetails(cmd)).join('\n\n');
    }

    private formatCommandDetails(cmd: RESTPostAPIApplicationCommandsJSONBody | APIApplicationCommand): string {
        const lines: string[] = [];
        
        // Main command line - handle different command types
        const description = 'description' in cmd ? cmd.description : 'No description';
        lines.push(`/${cmd.name} - ${description}`);
        
        // Check if command has options (subcommands, subcommand groups, or regular options)
        // Only chat input commands have options
        if ('options' in cmd && cmd.options && cmd.options.length > 0) {
            lines.push(...this.formatOptions(cmd.options, '', true));
        }
        
        return lines.join('\n');
    }

    // Using any[] for options because Discord command options have complex nested structures
    // with varying types (subcommands, subcommand groups, string/number/boolean options).
    // Proper typing would require importing discord-api-types package which adds complexity.
    // This is acceptable here since the method is only used for display/logging purposes.
    private formatOptions(options: any[], baseIndent: string, isRoot: boolean = false): string[] {
        const lines: string[] = [];
        
        for (let i = 0; i < options.length; i++) {
            const option = options[i];
            const isLast = i === options.length - 1;
            const required = option.required ? ' (required)' : '';
            
            // Tree characters
            const connector = isLast ? '└─' : '├─';
            const childPrefix = isLast ? '   ' : '│  ';
            const indent = isRoot ? ' ' : baseIndent;
            
            switch (option.type) {
                case 1: // SUB_COMMAND
                    lines.push(`${indent}${connector}${option.name} - ${option.description || 'No description'}`);
                    if (option.options && option.options.length > 0) {
                        lines.push(...this.formatOptions(option.options, indent + childPrefix, false));
                    }
                    break;
                    
                case 2: // SUB_COMMAND_GROUP
                    lines.push(`${indent}${connector}${option.name} - ${option.description || 'No description'}`);
                    if (option.options && option.options.length > 0) {
                        lines.push(...this.formatOptions(option.options, indent + childPrefix, false));
                    }
                    break;
                    
                case 3: // STRING
                    // Using any for choices because Discord API choices can have varying structures (string/number values)
                    const choices = option.choices ? ` [${option.choices.map((c: any) => c.name).join('|')}]` : '';
                    lines.push(`${indent}${connector}* ${option.name}: string${choices}${required} - ${option.description || 'No description'}`);
                    break;
                    
                case 4: // INTEGER
                    lines.push(`${indent}${connector}* ${option.name}: integer${required} - ${option.description || 'No description'}`);
                    break;
                    
                case 5: // BOOLEAN
                    lines.push(`${indent}${connector}* ${option.name}: boolean${required} - ${option.description || 'No description'}`);
                    break;
                    
                case 6: // USER
                    lines.push(`${indent}${connector}* ${option.name}: user${required} - ${option.description || 'No description'}`);
                    break;
                    
                case 7: // CHANNEL
                    lines.push(`${indent}${connector}* ${option.name}: channel${required} - ${option.description || 'No description'}`);
                    break;
                    
                case 8: // ROLE
                    lines.push(`${indent}${connector}* ${option.name}: role${required} - ${option.description || 'No description'}`);
                    break;
                    
                case 9: // MENTIONABLE
                    lines.push(`${indent}${connector}* ${option.name}: mentionable${required} - ${option.description || 'No description'}`);
                    break;
                    
                case 10: // NUMBER
                    lines.push(`${indent}${connector}* ${option.name}: number${required} - ${option.description || 'No description'}`);
                    break;
                    
                case 11: // ATTACHMENT
                    lines.push(`${indent}${connector}* ${option.name}: attachment${required} - ${option.description || 'No description'}`);
                    break;
                    
                default:
                    lines.push(`${indent}${connector}* ${option.name}: unknown type (${option.type})${required} - ${option.description || 'No description'}`);
                    break;
            }
        }
        
        return lines;
    }
}
