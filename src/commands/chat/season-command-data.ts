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
                    .setDescription('The ID of the season to check status for. Type to search.')
                    .setRequired(false) // Changed to false to allow triggering select menu if empty
                    .setAutocomplete(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('join')
            .setDescription('Join an existing open season')
            .addStringOption(option =>
                option.setName('season')
                    .setDescription('The ID of the season to join. Type to search.')
                    .setRequired(false) // Changed to false to allow triggering select menu if empty
                    .setAutocomplete(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('new')
            .setDescription('Starts a new season of the game (opens a configuration form)')
    )
    .setDMPermission(false); 