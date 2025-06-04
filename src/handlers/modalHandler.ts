import { ModalSubmitInteraction, CacheType } from 'discord.js';

export interface ModalHandler {
  customIdPrefix: string;
  execute(interaction: ModalSubmitInteraction<CacheType>): Promise<void>;
}
