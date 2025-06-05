import { SlashCommandBuilder } from 'discord.js';

export const readyCommandData = new SlashCommandBuilder()
    .setName('ready')
    .setDescription('Claim an offered turn in your active games')
    .setDMPermission(false); // Only allow in guild channels for ephemeral responses 