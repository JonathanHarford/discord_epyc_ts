import { SlashCommandBuilder } from 'discord.js';

export const submitTurnCommandData = new SlashCommandBuilder()
    .setName('submit-turn')
    .setDescription('Submit your turn with an image attachment')
    .addAttachmentOption(option =>
        option.setName('image')
            .setDescription('The image file for your turn submission')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('turn-id')
            .setDescription('The ID of the turn you are submitting (optional - will auto-detect if not provided)')
            .setRequired(false))
    .setDMPermission(false); // Only allow in guild channels for better UX 