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
                    .setDescription('View or update the server\'s default season configuration')
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
    )
    .addSubcommandGroup(subcommandGroup =>
        subcommandGroup
            .setName('game')
            .setDescription('On-demand game management commands')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('config')
                    .setDescription('View or update the server\'s default game configuration')
                    .addStringOption(option =>
                        option.setName('turn_pattern')
                            .setDescription('Turn pattern (e.g., "writing,drawing")')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('writing_timeout')
                            .setDescription('Time limit for writing turns (e.g., "5m", "1h")')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('writing_warning')
                            .setDescription('Warning time before writing timeout (e.g., "1m", "30s")')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('drawing_timeout')
                            .setDescription('Time limit for drawing turns (e.g., "20m", "1h")')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('drawing_warning')
                            .setDescription('Warning time before drawing timeout (e.g., "2m", "5m")')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('stale_timeout')
                            .setDescription('Time before inactive games are completed (e.g., "3d", "1w")')
                            .setRequired(false)
                    )
                    .addIntegerOption(option =>
                        option.setName('min_turns')
                            .setDescription('Minimum number of turns before game can complete')
                            .setRequired(false)
                    )
                    .addIntegerOption(option =>
                        option.setName('max_turns')
                            .setDescription('Maximum number of turns (0 for unlimited)')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('returns')
                            .setDescription('Return policy (e.g., "none", "2/3" for 2 times with 3 turn gap)')
                            .setRequired(false)
                    )
                    .addBooleanOption(option =>
                        option.setName('test_mode')
                            .setDescription('Enable test mode with shortened timeouts')
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('List active and recent games')
                    .addStringOption(option =>
                        option.setName('status')
                            .setDescription('Filter games by status')
                            .setRequired(false)
                            .addChoices(
                                { name: 'Active', value: 'ACTIVE' },
                                { name: 'Completed', value: 'COMPLETED' },
                                { name: 'Terminated', value: 'TERMINATED' }
                            )
                    )
                    .addIntegerOption(option =>
                        option.setName('limit')
                            .setDescription('Maximum number of games to show (default: 10)')
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('show')
                    .setDescription('Show detailed information about a specific game')
                    .addStringOption(option =>
                        option.setName('id')
                            .setDescription('The ID of the game to show details for')
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('kill')
                    .setDescription('Terminate an active game')
                    .addStringOption(option =>
                        option.setName('id')
                            .setDescription('The ID of the game to terminate')
                            .setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('reason')
                            .setDescription('Reason for terminating the game')
                            .setRequired(false)
                    )
            )
    )
    .addSubcommandGroup(subcommandGroup =>
        subcommandGroup
            .setName('channel')
            .setDescription('Channel configuration commands')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('config')
                    .setDescription('Configure bot channels for announcements and notifications')
                    .addChannelOption(option =>
                        option.setName('announce')
                            .setDescription('Channel for game announcements')
                            .setRequired(false)
                    )
                    .addChannelOption(option =>
                        option.setName('completed')
                            .setDescription('Channel for completed games')
                            .setRequired(false)
                    )
                    .addChannelOption(option =>
                        option.setName('admin')
                            .setDescription('Channel for admin notifications')
                            .setRequired(false)
                    )
            )
    ); 