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
    )
    .addSubcommandGroup(subcommandGroup =>
        subcommandGroup
            .setName('list')
            .setDescription('List various entities')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('seasons')
                    .setDescription('List all seasons')
                    .addStringOption(option =>
                        option.setName('status')
                            .setDescription('Filter seasons by status')
                            .setRequired(false)
                            .addChoices(
                                { name: 'Setup', value: 'SETUP' },
                                { name: 'Pending Start', value: 'PENDING_START' },
                                { name: 'Open', value: 'OPEN' },
                                { name: 'Active', value: 'ACTIVE' },
                                { name: 'Completed', value: 'COMPLETED' },
                                { name: 'Terminated', value: 'TERMINATED' }
                            )
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('players')
                    .setDescription('List all players')
                    .addStringOption(option =>
                        option.setName('season')
                            .setDescription('Filter players by season ID')
                            .setRequired(false)
                    )
                    .addBooleanOption(option =>
                        option.setName('banned')
                            .setDescription('Show only banned players')
                            .setRequired(false)
                    )
            )
    ); 