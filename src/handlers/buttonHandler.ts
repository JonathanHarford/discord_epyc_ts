import { ButtonInteraction } from 'discord.js';

export interface ButtonHandler {
  customIdPrefix: string;
  execute(interaction: ButtonInteraction): Promise<void>;
}
