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
    ); 