import { SlashCommandBuilder } from 'discord.js';

export const seasonCommandData = new SlashCommandBuilder()
    .setName('season')
    .setDescription('Season management and participation commands')
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('List all public open seasons plus seasons the user is in')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('show')
            .setDescription('Get status information for a season')
            .addStringOption(option =>
                option.setName('season')
                    .setDescription('The ID of the season to check status for')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('join')
            .setDescription('Join an existing open season')
            .addStringOption(option =>
                option.setName('season')
                    .setDescription('The ID of the season to join')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('new')
            .setDescription('Starts a new season of the game')
            .addStringOption(option =>
                option.setName('open_duration')
                    .setDescription('How long the season is open for joining (e.g., "7d", "24h"). Default varies.')
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option.setName('min_players')
                    .setDescription('Minimum number of players required to start. Default varies.')
                    .setRequired(false)
                    .setMinValue(process.env.NODE_ENV === 'production' ? 2 : 1)
            )
            .addIntegerOption(option =>
                option.setName('max_players')
                    .setDescription('Maximum number of players allowed to join. Default varies.')
                    .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('turn_pattern')
                    .setDescription('Pattern of turns (e.g., "writing,drawing"). Default varies.')
                    .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('claim_timeout')
                    .setDescription('Time allowed to claim a turn offer (e.g., "1d", "12h"). Default varies.')
                    .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('writing_timeout')
                    .setDescription('Time allowed to submit a writing turn (e.g., "1d", "8h"). Default varies.')
                    .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('drawing_timeout')
                    .setDescription('Time allowed to submit a drawing turn (e.g., "1d", "1h"). Default varies.')
                    .setRequired(false)
            )
    )
    .setDMPermission(false); 