import { ModalSubmitInteraction } from 'discord.js';

export interface ModalHandler {
  customIdPrefix: string;
  execute(interaction: ModalSubmitInteraction): Promise<void>;
}
