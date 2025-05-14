import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SeasonService } from '../../services/SeasonService.js';
import prisma from '../../lib/prisma.js';
import { Lang } from '../../services/lang.js';
import { Language } from '../../models/enum-helpers/language.js';
import { MessageInstruction } from '../../types/MessageInstruction.js';

export const joinSeasonCommandData = new SlashCommandBuilder()
  .setName('join')
  .setDescription('Join an existing season')
  .addStringOption(option =>
    option.setName('season_id')
      .setDescription('The ID of the season to join')
      .setRequired(true));

export const JoinSeasonCommand: any = {
  data: joinSeasonCommandData,
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const seasonIdOption = interaction.options.getString('season_id', true);
    const discordUserId = interaction.user.id;

    const seasonService = new SeasonService(prisma);

    let instruction: MessageInstruction;

    try {
      // IMPORTANT: SeasonService.addPlayerToSeason now expects an internal Player ID.
      // You'll need to implement logic here to resolve discordUserId to your internal player ID.
      // This might involve calling a PlayerService to find or create the player.
      // For now, this is a placeholder for that logic:
      const internalPlayerId = discordUserId; // TODO: Replace with actual player ID resolution

      // The result from addPlayerToSeason is now directly the MessageInstruction
      instruction = await seasonService.addPlayerToSeason(internalPlayerId, seasonIdOption);

      // The service provides the 'key' and most 'data'.
      // We ensure seasonId and a seasonName fallback are present in data, 
      // similar to the original command's behavior for its lang strings.
      const serviceData = instruction.data || {};
      instruction.data = {
        ...serviceData,
        seasonId: seasonIdOption, // Ensure seasonId is available
        // Use seasonName from service if present, otherwise fallback to seasonIdOption
        seasonName: serviceData.seasonName || seasonIdOption 
      };

    } catch (error) {
      console.error('Error in /join command:', error);
      instruction = {
        type: 'error',
        key: 'common.error.critical_command',
        data: { errorDetail: (error as Error).message },
      };
    }

    const replyContent = Lang.getRef(instruction.key, Language.Default, instruction.data);

    await interaction.editReply({ content: replyContent });
  },
}; 