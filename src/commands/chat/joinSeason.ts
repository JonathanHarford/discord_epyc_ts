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

    const seasonId = interaction.options.getString('season_id', true);
    const discordUserId = interaction.user.id;

    const seasonService = new SeasonService(prisma);

    try {
      // Step 1: First check if the season exists and is open for joining
      const season = await seasonService.findSeasonById(seasonId);
      
      if (!season) {
        await interaction.editReply({ 
          content: Lang.getRef('joinCommand.join_season_error_not_found', Language.Default, { seasonId }) 
        });
        return;
      }
      
      // Step 2: Check if season is in a valid state for joining (SETUP, PENDING_START, OPEN)
      const validJoinStatuses = ['SETUP', 'PENDING_START', 'OPEN'];
      if (!validJoinStatuses.includes(season.status)) {
        await interaction.editReply({ 
          content: Lang.getRef('joinCommand.join_season_error_not_open', Language.Default, { 
            seasonId,
            seasonName: season.name,
            status: season.status 
          }) 
        });
        return;
      }
      
      // Step 3: Find or create the player record for this Discord user
      const player = await prisma.player.findUnique({
        where: { discordUserId }
      });
      
      if (!player) {
        // This is a first-time player, so we need to create their player record
        try {
          const newPlayer = await prisma.player.create({
            data: {
              discordUserId,
              name: interaction.user.username,
            }
          });
          
          // Now use the new player ID to add them to the season
          const result = await seasonService.addPlayerToSeason(newPlayer.id, seasonId);
          await interaction.editReply({ 
            content: Lang.getRef(result.key, Language.Default, {
              ...result.data,
              seasonId,
              seasonName: season.name
            }) 
          });
          
        } catch (error) {
          console.error('Error creating player record:', error);
          await interaction.editReply({ 
            content: Lang.getRef('joinCommand.join_season_error_unknown', Language.Default, { 
              seasonId,
              errorMessage: error instanceof Error ? error.message : 'Unknown error'
            }) 
          });
        }
        return;
      }
      
      // Step 4: Add existing player to the season
      const result = await seasonService.addPlayerToSeason(player.id, seasonId);
      
      // The key should already be formatted for Lang.getRef
      await interaction.editReply({ 
        content: Lang.getRef(result.key, Language.Default, {
          ...result.data,
          seasonId,
          seasonName: season.name
        }) 
      });
      
    } catch (error) {
      console.error('Error in /join command:', error);
      await interaction.editReply({ 
        content: Lang.getRef('joinCommand.join_season_error_unknown', Language.Default, { 
          seasonId,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }) 
      });
    }
  },
}; 