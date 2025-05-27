import { SlashCommandBuilder } from 'discord.js';

export const gameCommandData = new SlashCommandBuilder()
    .setName('game')
    .setDescription('On-demand game management and participation commands')
    .addSubcommand(subcommand =>
        subcommand
            .setName('new')
            .setDescription('Start a new on-demand game')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('play')
            .setDescription('Join and play an available on-demand game')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('List your active games and available games to join')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('show')
            .setDescription('Show details of a specific game')
            .addStringOption(option =>
                option.setName('id')
                    .setDescription('The ID of the game to show details for')
                    .setRequired(true)
            )
    )
    .setDMPermission(false); 