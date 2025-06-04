import { ButtonInteraction, CacheType } from 'discord.js';
import { ButtonHandler } from './buttonHandler.js'; // Assuming ButtonHandler interface is in ./buttonHandler.js
import { Logger } from '../services/index.js'; // Assuming Logger is in ../services/index.js
import { createTextSubmissionModal } from '../utils/modalBuilders.js'; // Import the modal builder

export class TextSubmitPromptButtonHandler implements ButtonHandler {
    customIdPrefix = 'text_submit_prompt_';

    public async execute(interaction: ButtonInteraction<CacheType>): Promise<void> {
        const turnId = interaction.customId.substring(this.customIdPrefix.length);

        Logger.info(`TextSubmitPromptButtonHandler: User ${interaction.user.username} (${interaction.user.id}) clicked prompt for turn ${turnId}`);

        if (!turnId || turnId.trim().length === 0) {
            Logger.warn(`TextSubmitPromptButtonHandler: Invalid turnId format from customId: ${interaction.customId}`);
            // It's good practice to give the user some feedback, even if it's an error they shouldn't see.
            try {
                await interaction.reply({
                    content: 'Error: Invalid turn reference for submission prompt. Please try claiming the turn again.',
                    ephemeral: true
                });
            } catch (replyError) {
                Logger.error(`TextSubmitPromptButtonHandler: Failed to send error reply for invalid turnId:`, replyError);
            }
            return;
        }

        try {
            // Create the text submission modal
            const modal = createTextSubmissionModal(turnId);

            // Show the modal to the user
            await interaction.showModal(modal);
            // No explicit reply needed here, showModal handles the interaction.
            Logger.info(`TextSubmitPromptButtonHandler: Shown text submission modal for turn ${turnId} to user ${interaction.user.id}`);

        } catch (error) {
            Logger.error(`TextSubmitPromptButtonHandler: Error showing text submission modal for turn ${turnId} (user ${interaction.user.id}):`, error);
            try {
                // Check if interaction has already been replied to or deferred
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'Sorry, there was an error preparing the submission form. Please try again.',
                        ephemeral: true
                    });
                } else {
                    // If already replied/deferred, try a followup
                    await interaction.followUp({
                        content: 'Sorry, there was an error preparing the submission form. Please try again.',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                Logger.error(`TextSubmitPromptButtonHandler: Failed to send error reply for modal display failure:`, replyError);
            }
        }
    }
}
