import { AutocompleteInteraction } from 'discord.js';

export interface AutocompleteHandler {
  commandName: string;
  optionName?: string; // optionName can be optional
  execute(interaction: AutocompleteInteraction): Promise<void>;
}
