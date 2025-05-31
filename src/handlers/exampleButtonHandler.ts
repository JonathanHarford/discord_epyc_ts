import { ButtonInteraction } from 'discord.js';

import { ButtonHandler } from './buttonHandler.js'; // Assuming .js extension if your tsconfig compiles to it and you use NodeNext/ESNext module resolution
import { Logger } from '../services/index.js'; // Adjust path as necessary

export class ExampleButtonHandler implements ButtonHandler {
    customIdPrefix = 'example_button_';

    public async execute(interaction: ButtonInteraction): Promise<void> {
        Logger.info(`ExampleButtonHandler executed for customId: ${interaction.customId}`);
        try {
            await interaction.reply({ content: `You clicked the button with custom ID: ${interaction.customId}!`, ephemeral: true });
        } catch (error) {
            Logger.error('Failed to reply to example button interaction:', error);
        }
    }
}
