import { StringSelectMenuInteraction } from 'discord.js';

export interface SelectMenuHandler {
  customIdPrefix: string;
  execute(interaction: StringSelectMenuInteraction): Promise<void>;
}
