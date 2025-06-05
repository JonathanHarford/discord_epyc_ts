import { ActionRowBuilder, ButtonInteraction, CacheType, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

import { ButtonHandler } from './buttonHandler.js';
import { strings } from '../lang/strings.js';
import prisma from '../lib/prisma.js';
import { Logger } from '../services/index.js';

export class TurnSubmitUrlButtonHandler implements ButtonHandler {
    customIdPrefix = 'turn_submit_url_';

    public async execute(interaction: ButtonInteraction<CacheType>): Promise<void> {
        const turnId = interaction.customId.substring(this.customIdPrefix.length);
        const discordUserId = interaction.user.id;

        Logger.info(`TurnSubmitUrlButtonHandler: User ${interaction.user.username} (${discordUserId}) choosing URL submission for turn ${turnId}`);

        if (!turnId || turnId.trim().length === 0) {
            Logger.warn(`TurnSubmitUrlButtonHandler: Invalid turnId format from customId: ${interaction.customId}`);
            await interaction.reply({ 
                content: 'Invalid turn reference. Please try again or contact support.', 
                ephemeral: true 
            });
            return;
        }

        try {
            // Find the player record
            const player = await prisma.player.findUnique({ 
                where: { discordUserId } 
            });

            if (!player) {
                Logger.warn(`TurnSubmitUrlButtonHandler: Player not found for Discord user ${discordUserId}`);
                await interaction.reply({ 
                    content: strings.messages.ready.playerNotFound, 
                    ephemeral: true 
                });
                return;
            }

            // Get the turn to verify it's valid
            const turn = await prisma.turn.findUnique({
                where: { id: turnId }
            });

            if (!turn) {
                Logger.warn(`TurnSubmitUrlButtonHandler: Turn ${turnId} not found`);
                await interaction.reply({ 
                    content: 'Turn not found. Please try again or contact support.', 
                    ephemeral: true 
                });
                return;
            }

            // Verify the turn belongs to this player and is in PENDING status
            if (turn.playerId !== player.id) {
                Logger.warn(`TurnSubmitUrlButtonHandler: Turn ${turnId} does not belong to player ${player.id}`);
                await interaction.reply({ 
                    content: 'This turn does not belong to you.', 
                    ephemeral: true 
                });
                return;
            }

            if (turn.status !== 'PENDING') {
                Logger.warn(`TurnSubmitUrlButtonHandler: Turn ${turnId} is not in PENDING status (current: ${turn.status})`);
                await interaction.reply({ 
                    content: 'This turn is not available for submission.', 
                    ephemeral: true 
                });
                return;
            }

            if (turn.type !== 'DRAWING') {
                Logger.warn(`TurnSubmitUrlButtonHandler: Turn ${turnId} is not a DRAWING turn (type: ${turn.type})`);
                await interaction.reply({ 
                    content: 'URL submission is only available for drawing turns.', 
                    ephemeral: true 
                });
                return;
            }

            // Create and show the URL input modal
            const modal = new ModalBuilder()
                .setCustomId(`turn_submit_modal_${turnId}`)
                .setTitle('Submit Drawing Turn - URL');

            const urlInput = new TextInputBuilder()
                .setCustomId('turn_content')
                .setLabel('Image URL')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('https://example.com/your-image.png')
                .setRequired(true)
                .setMaxLength(500);

            const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);

            Logger.info(`TurnSubmitUrlButtonHandler: Showed URL submission modal for turn ${turnId} to player ${player.id}`);

        } catch (error) {
            Logger.error(`TurnSubmitUrlButtonHandler: Error processing URL submission for turn ${turnId} by user ${discordUserId}:`, error);
            await interaction.reply({
                content: 'An error occurred while preparing URL submission. Please try again or contact support.',
                ephemeral: true
            });
        }
    }
} 