import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    CommandInteraction,
    NewsChannel,
    TextChannel,
    ThreadChannel,
} from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';
import { createRequire } from 'node:module';

import { EventHandler } from './index.js';
import { Command, CommandDeferType } from '../commands/index.js';
import { DiscordLimits } from '../constants/index.js';
import { strings } from '../lang/strings.js';
import { SimpleMessage } from '../messaging/SimpleMessage.js';
import { EventData } from '../models/internal-models.js';
import { EventDataService, Logger } from '../services/index.js';
import { CommandUtils, ErrorHandler, InteractionUtils } from '../utils/index.js';

const require = createRequire(import.meta.url);
let Config = require('../../config/config.json');
let Logs = require('../../lang/logs.json');

export class CommandHandler implements EventHandler {
    private rateLimiter = new RateLimiter(
        Config.rateLimiting.commands.amount,
        Config.rateLimiting.commands.interval * 1000
    );

    constructor(
        public commands: Command[],
        private eventDataService: EventDataService
    ) {}

    public async process(intr: CommandInteraction | AutocompleteInteraction): Promise<void> {
        // Don't respond to self, or other bots
        if (intr.user.id === intr.client.user?.id || intr.user.bot) {
            return;
        }

        let commandParts =
            intr instanceof ChatInputCommandInteraction || intr instanceof AutocompleteInteraction
                ? [
                      intr.commandName,
                      intr.options.getSubcommandGroup(false),
                      intr.options.getSubcommand(false),
                  ].filter(Boolean)
                : [intr.commandName];
        let commandName = commandParts.join(' ');

        // Enhanced logging for debugging
        console.log(`[CommandHandler] Processing command: ${commandName}`, {
            interactionId: intr.id,
            userId: intr.user.id,
            username: intr.user.username,
            guildId: intr.guild?.id,
            channelId: intr.channel?.id,
            commandParts
        });

        // Try to find the command the user wants
        let command = CommandUtils.findCommand(this.commands, commandParts);
        if (!command) {
            console.error(`[CommandHandler] Command not found for: ${commandName}`, {
                commandParts,
                availableCommands: this.commands.map(cmd => cmd.names).flat(),
                interactionId: intr.id,
                userId: intr.user.id
            });
            
            Logger.error(
                Logs.error.commandNotFound
                    .replaceAll('{INTERACTION_ID}', intr.id)
                    .replaceAll('{COMMAND_NAME}', commandName)
            );
            return;
        }

        console.log(`[CommandHandler] Found command: ${command.constructor.name} for ${commandName}`);

        if (intr instanceof AutocompleteInteraction) {
            if (!command.autocomplete) {
                Logger.error(
                    Logs.error.autocompleteNotFound
                        .replaceAll('{INTERACTION_ID}', intr.id)
                        .replaceAll('{COMMAND_NAME}', commandName)
                );
                return;
            }

            try {
                let option = intr.options.getFocused(true);
                let choices = await command.autocomplete(intr, option);
                await InteractionUtils.respond(
                    intr,
                    choices?.slice(0, DiscordLimits.CHOICES_PER_AUTOCOMPLETE)
                );
            } catch (error) {
                Logger.error(
                    intr.channel instanceof TextChannel ||
                        intr.channel instanceof NewsChannel ||
                        intr.channel instanceof ThreadChannel
                        ? Logs.error.autocompleteGuild
                              .replaceAll('{INTERACTION_ID}', intr.id)
                              .replaceAll('{OPTION_NAME}', commandName)
                              .replaceAll('{COMMAND_NAME}', commandName)
                              .replaceAll('{USER_TAG}', intr.user.tag)
                              .replaceAll('{USER_ID}', intr.user.id)
                              .replaceAll('{CHANNEL_NAME}', intr.channel.name)
                              .replaceAll('{CHANNEL_ID}', intr.channel.id)
                              .replaceAll('{GUILD_NAME}', intr.guild?.name)
                              .replaceAll('{GUILD_ID}', intr.guild?.id)
                        : Logs.error.autocompleteDm
                              .replaceAll('{INTERACTION_ID}', intr.id)
                              .replaceAll('{OPTION_NAME}', commandName)
                              .replaceAll('{COMMAND_NAME}', commandName)
                              .replaceAll('{USER_TAG}', intr.user.tag)
                              .replaceAll('{USER_ID}', intr.user.id),
                    error
                );
            }
            return;
        }

        // Check if user is rate limited
        let limited = this.rateLimiter.take(intr.user.id);
        if (limited) {
            console.log(`[CommandHandler] Rate limited user: ${intr.user.id} for command: ${commandName}`);
            return;
        }

        // Defer interaction
        // NOTE: Anything after this point we should be responding to the interaction
        try {
            switch (command.deferType) {
                case CommandDeferType.PUBLIC: {
                    await InteractionUtils.deferReply(intr, false);
                    break;
                }
                case CommandDeferType.HIDDEN: {
                    await InteractionUtils.deferReply(intr, true);
                    break;
                }
            }
        } catch (deferError) {
            console.error(`[CommandHandler] Failed to defer interaction for ${commandName}:`, {
                interactionId: intr.id,
                userId: intr.user.id,
                commandName,
                deferType: command.deferType,
                error: deferError instanceof Error ? deferError.message : deferError
            });
            
            // If we can't defer, we still might be able to respond
            // Continue with execution but note the defer failure
        }

        // Return if defer was unsuccessful
        if (command.deferType !== CommandDeferType.NONE && !intr.deferred) {
            console.error(`[CommandHandler] Defer failed for ${commandName}, aborting command execution`, {
                interactionId: intr.id,
                userId: intr.user.id,
                commandName,
                deferType: command.deferType,
                isDeferred: intr.deferred,
                isReplied: intr.replied
            });
            return;
        }

        // Get data from database
        let data = await this.eventDataService.create({
            user: intr.user,
            channel: intr.channel,
            guild: intr.guild,
            args: intr instanceof ChatInputCommandInteraction ? intr.options : undefined,
        });

        try {
            // Check if interaction passes command checks
            let passesChecks = await CommandUtils.runChecks(command, intr, data);
            if (passesChecks) {
                console.log(`[CommandHandler] Executing command: ${commandName}`);
                // Execute the command
                await command.execute(intr, data);
                console.log(`[CommandHandler] Command execution completed: ${commandName}`);
            } else {
                console.log(`[CommandHandler] Command failed checks: ${commandName}`);
            }
        } catch (error) {
            console.error(`[CommandHandler] Command execution error for ${commandName}:`, {
                interactionId: intr.id,
                userId: intr.user.id,
                commandName,
                error: error instanceof Error ? error.message : error,
                stack: error instanceof Error ? error.stack : undefined
            });
            
            // Use the new standardized error handler
            await ErrorHandler.handleCommandError(
                error instanceof Error ? error : new Error(String(error)),
                intr,
                data,
                {
                    commandName,
                    channelName: intr.channel instanceof TextChannel ||
                        intr.channel instanceof NewsChannel ||
                        intr.channel instanceof ThreadChannel
                        ? intr.channel.name
                        : undefined,
                    guildName: intr.guild?.name
                }
            );
        }
    }

    private async sendError(intr: CommandInteraction, _data: EventData): Promise<void> {
        try {
            await SimpleMessage.sendEmbed(
                intr,
                strings.embeds.errorEmbeds.command,
                {
                    ERROR_CODE: intr.id,
                    GUILD_ID: intr.guild?.id ?? strings.messages.na,
                    SHARD_ID: (intr.guild?.shardId ?? 0).toString(),
                },
                true,
                'error'
            );
        } catch {
            // Ignore
        }
    }
}
