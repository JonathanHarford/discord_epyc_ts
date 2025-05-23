import { SlashCommandBuilder } from 'discord.js';

export const configCommandData = new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configuration commands for managing bot settings')
    .addSubcommandGroup(subcommandGroup =>
        subcommandGroup
            .setName('seasons')
            .setDescription('Season configuration management')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('view')
                    .setDescription('View current default season configuration settings')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('set')
                    .setDescription('Update default season configuration settings')
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
                            .setMinValue(1)
                            .setMaxValue(100)
                            .setRequired(false)
                    )
                    .addIntegerOption(option =>
                        option.setName('max_players')
                            .setDescription('Maximum number of players allowed')
                            .setMinValue(1)
                            .setMaxValue(100)
                            .setRequired(false)
                    )
            )
    ); 