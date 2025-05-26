import { SlashCommandBuilder } from 'discord.js';

export const adminCommandData = new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Administrative commands for managing the bot')
    .addSubcommandGroup(subcommandGroup =>
        subcommandGroup
            .setName('player')
            .setDescription('Player management commands')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
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
            .addSubcommand(subcommand =>
                subcommand
                    .setName('show')
                    .setDescription('Show player details')
                    .addUserOption(option =>
                        option.setName('user')
                            .setDescription('The user to show details for')
                            .setRequired(true)
                    )
            )
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
            .setName('season')
            .setDescription('Season management commands')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
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
                    .setName('show')
                    .setDescription('Show season details')
                    .addStringOption(option =>
                        option.setName('season')
                            .setDescription('The ID of the season to show details for')
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('config')
                    .setDescription('Season configuration management')
                    .addStringOption(option =>
                        option.setName('action')
                            .setDescription('Action to perform')
                            .setRequired(true)
                            .addChoices(
                                { name: 'View Configuration', value: 'view' },
                                { name: 'Set Configuration', value: 'set' }
                            )
                    )
                    .addStringOption(option =>
                        option.setName('season')
                            .setDescription('The ID of the season to configure')
                            .setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('turn_pattern')
                            .setDescription('Turn pattern (e.g., "writing,drawing")')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('claim_timeout')
                            .setDescription('Time limit for claiming turns (e.g., "1d", "2h")')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('writing_timeout')
                            .setDescription('Time limit for writing turns (e.g., "1d", "2h")')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('writing_warning')
                            .setDescription('Warning time before writing timeout (e.g., "1h", "30m")')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('drawing_timeout')
                            .setDescription('Time limit for drawing turns (e.g., "1d", "2h")')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('drawing_warning')
                            .setDescription('Warning time before drawing timeout (e.g., "10m", "5m")')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('open_duration')
                            .setDescription('How long seasons stay open for joining (e.g., "7d", "3d")')
                            .setRequired(false)
                    )
                    .addIntegerOption(option =>
                        option.setName('min_players')
                            .setDescription('Minimum number of players required')
                            .setRequired(false)
                    )
                    .addIntegerOption(option =>
                        option.setName('max_players')
                            .setDescription('Maximum number of players allowed')
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('kill')
                    .setDescription('Terminate a season')
                    .addStringOption(option =>
                        option.setName('id')
                            .setDescription('The ID of the season to terminate')
                            .setRequired(true)
                    )
            )
    ); 