import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { SeasonService } from '../../services/SeasonService.js';
import prisma from '../../lib/prisma.js';
import { Lang } from '../../services/lang.js';
import { Language } from '../../models/enum-helpers/language.js';
import { Command, CommandDeferType } from '../command.js';
import { EventData } from '../../models/internal-models.js';

export const joinSeasonCommandData = new SlashCommandBuilder()
  .setName('join')
  .setDescription('Join an existing season')
  .addStringOption(option =>
    option.setName('season_id')
      .setDescription('The ID of the season to join')
      .setRequired(true));

export class JoinSeasonCommand implements Command {
  public names = [joinSeasonCommandData.name];
  public data = joinSeasonCommandData;
  public deferType = CommandDeferType.HIDDEN;
  public requireClientPerms: PermissionsString[] = ['SendMessages'];

  public async execute(interaction: ChatInputCommandInteraction, data: EventData): Promise<void> {
    console.log(`[JoinSeasonCommand] Executing /join command for user: ${interaction.user.id}, username: ${interaction.user.username}`);
    const seasonId = interaction.options.getString('season_id', true);
    const discordUserId = interaction.user.id;
    console.log(`[JoinSeasonCommand] Received season_id: ${seasonId}, discordUserId: ${discordUserId}`);

    const seasonService = new SeasonService(prisma);

    try {
      const season = await seasonService.findSeasonById(seasonId);
      
      if (!season) {
        await interaction.editReply({ 
          content: Lang.getRef('joinCommand.join_season_error_not_found', data.lang, { seasonId }) 
        });
        return;
      }
      
      const validJoinStatuses = ['SETUP', 'PENDING_START', 'OPEN'];
      if (!validJoinStatuses.includes(season.status)) {
        await interaction.editReply({ 
          content: Lang.getRef('joinCommand.join_season_error_not_open', data.lang, { 
            seasonId,
            status: season.status 
          }) 
        });
        return;
      }
      
      let player = await prisma.player.findUnique({
        where: { discordUserId }
      });
      
      if (!player) {
        try {
          player = await prisma.player.create({
            data: {
              discordUserId,
              name: interaction.user.username,
            }
          });
          
          const result = await seasonService.addPlayerToSeason(player.id, seasonId);
          await interaction.editReply({ 
            content: Lang.getRef(result.key, data.lang, {
              ...result.data,
              seasonId,
            }) 
          });
          
        } catch (error) {
          console.error('Error creating player record:', error);
          await interaction.editReply({ 
            content: Lang.getRef('joinCommand.join_season_error_unknown', data.lang, {
              seasonId,
              errorMessage: error instanceof Error ? error.message : 'Unknown error'
            }) 
          });
        }
        return;
      }
      
      const result = await seasonService.addPlayerToSeason(player.id, seasonId);
      
      await interaction.editReply({ 
        content: Lang.getRef(result.key, data.lang, {
          ...result.data,
          seasonId,
        }) 
      });
      
    } catch (error) {
      console.error('Error in /join command:', error);
      await interaction.editReply({ 
        content: Lang.getRef('joinCommand.join_season_error_unknown', data.lang, {
          seasonId,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }) 
      });
    }
  }
}

// Default export might be useful if other commands follow this pattern,
// but src/commands/chat/index.ts uses named exports.
// export default JoinSeasonCommand; 