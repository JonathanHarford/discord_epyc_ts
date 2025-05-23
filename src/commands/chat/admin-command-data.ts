import { SlashCommandBuilder } from 'discord.js';

export const adminCommandData = new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Administrative commands for managing the bot')
    .addSubcommandGroup(subcommandGroup =>
        subcommandGroup
            .setName('terminate')
            .setDescription('Terminate various entities')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('season')
                    .setDescription('Terminate a season')
                    .addStringOption(option =>
                        option.setName('id')
                            .setDescription('The ID of the season to terminate')
                            .setRequired(true)
                    )
            )
    )
    .addSubcommandGroup(subcommandGroup =>
        subcommandGroup
            .setName('player')
            .setDescription('Player management commands')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('ban')
                    .setDescription('Ban a player from participating in seasons')
                    .addUserOption(option =>
                        option.setName('user')
                            .setDescription('The user to ban')
                            .setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('reason')
                            .setDescription('Reason for the ban')
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('unban')
                    .setDescription('Unban a player, allowing them to participate in seasons again')
                    .addUserOption(option =>
                        option.setName('user')
                            .setDescription('The user to unban')
                            .setRequired(true)
                    )
            )
    ); 