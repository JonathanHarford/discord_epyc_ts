import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

/**
 * Creates the first step modal for season creation
 */
export function createSeasonCreationStep1Modal(): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId('season_create_step1')
        .setTitle('Create New Season - Basic Settings');

    // Min Players input
    const minPlayersInput = new TextInputBuilder()
        .setCustomId('minPlayersInput')
        .setLabel('Minimum Players')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., 2')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(2);

    // Max Players input
    const maxPlayersInput = new TextInputBuilder()
        .setCustomId('maxPlayersInput')
        .setLabel('Maximum Players')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., 8')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(2);

    // Open Duration input
    const openDurationInput = new TextInputBuilder()
        .setCustomId('openDurationInput')
        .setLabel('Open Duration (optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., 7d, 24h')
        .setRequired(false)
        .setMaxLength(10);

    // Season Name input (optional, for future use)
    const seasonNameInput = new TextInputBuilder()
        .setCustomId('seasonNameInput')
        .setLabel('Season Name (optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., Winter 2024')
        .setRequired(false)
        .setMaxLength(50);

    // Turn Pattern input
    const turnPatternInput = new TextInputBuilder()
        .setCustomId('turnPatternInput')
        .setLabel('Turn Pattern (optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., writing,drawing')
        .setRequired(false)
        .setMaxLength(50);

    // Create action rows (Discord allows max 5 components per modal)
    const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(minPlayersInput);
    const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(maxPlayersInput);
    const thirdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(openDurationInput);
    const fourthRow = new ActionRowBuilder<TextInputBuilder>().addComponents(seasonNameInput);
    const fifthRow = new ActionRowBuilder<TextInputBuilder>().addComponents(turnPatternInput);

    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow, fifthRow);

    return modal;
} 