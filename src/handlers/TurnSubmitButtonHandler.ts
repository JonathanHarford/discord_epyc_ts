import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

import { ButtonHandler } from './buttonHandler.js';
import { strings } from '../lang/strings.js';
import prisma from '../lib/prisma.js';
import { Logger } from '../services/index.js';

export class TurnSubmitButtonHandler implements ButtonHandler {
    customIdPrefix = 'turn_submit_';

    public async execute(interaction: ButtonInteraction<CacheType>): Promise<void> {
        const turnId = interaction.customId.substring(this.customIdPrefix.length);
        const discordUserId = interaction.user.id;

        Logger.info(`TurnSubmitButtonHandler: User ${interaction.user.username} (${discordUserId}) attempting to submit turn ${turnId}`);

        if (!turnId || turnId.trim().length === 0) {
            Logger.warn(`TurnSubmitButtonHandler: Invalid turnId format from customId: ${interaction.customId}`);
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
                Logger.warn(`TurnSubmitButtonHandler: Player not found for Discord user ${discordUserId}`);
                await interaction.reply({ 
                    content: strings.messages.ready.playerNotFound, 
                    ephemeral: true 
                });
                return;
            }

            // Get the turn to determine its type
            const turn = await prisma.turn.findUnique({
                where: { id: turnId }
            });

            if (!turn) {
                Logger.warn(`TurnSubmitButtonHandler: Turn ${turnId} not found`);
                await interaction.reply({ 
                    content: 'Turn not found. Please try again or contact support.', 
                    ephemeral: true 
                });
                return;
            }

            // Verify the turn belongs to this player and is in PENDING status
            if (turn.playerId !== player.id) {
                Logger.warn(`TurnSubmitButtonHandler: Turn ${turnId} does not belong to player ${player.id}`);
                await interaction.reply({ 
                    content: 'This turn does not belong to you.', 
                    ephemeral: true 
                });
                return;
            }

            if (turn.status !== 'PENDING') {
                Logger.warn(`TurnSubmitButtonHandler: Turn ${turnId} is not in PENDING status (current: ${turn.status})`);
                await interaction.reply({ 
                    content: 'This turn is not available for submission.', 
                    ephemeral: true 
                });
                return;
            }

            if (turn.type === 'WRITING') {
                // For writing turns, show the modal directly
                const modal = new ModalBuilder()
                    .setCustomId(`turn_submit_modal_${turnId}`)
                    .setTitle('Submit Writing Turn');

                const textInput = new TextInputBuilder()
                    .setCustomId('turn_content')
                    .setLabel('Your writing content')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Enter your writing here...')
                    .setRequired(true)
                    .setMaxLength(2000);

                const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
                modal.addComponents(actionRow);

                await interaction.showModal(modal);
            } else {
                // For drawing turns, show ephemeral prompt with submission options (Task 71.5)
                const submissionOptionsMessage = `🎨 **Choose how to submit your drawing:**

**Option 1: Upload Image File** ⭐ *Recommended*
Use \`/submit-turn\` with an image attachment for the best experience.

**Option 2: Provide Image URL**
Click "Enter URL" below to provide a link to your image.

💡 **Tip:** File uploads are more reliable and don't require hosting your image elsewhere!`;

                const actionRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`turn_submit_url_${turnId}`)
                            .setLabel('Enter URL')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('🔗'),
                        new ButtonBuilder()
                            .setCustomId(`turn_submit_help_${turnId}`)
                            .setLabel('How to Upload?')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('❓')
                    );

                await interaction.reply({
                    content: submissionOptionsMessage,
                    components: [actionRow],
                    ephemeral: true
                });
            }

            Logger.info(`TurnSubmitButtonHandler: Showed submission modal for turn ${turnId} (${turn.type}) to player ${player.id}`);

        } catch (error) {
            Logger.error(`TurnSubmitButtonHandler: Error processing turn submission for turn ${turnId} by user ${discordUserId}:`, error);
            await interaction.reply({
                content: 'An error occurred while preparing turn submission. Please try again or contact support.',
                ephemeral: true
            });
        }
    }
} 