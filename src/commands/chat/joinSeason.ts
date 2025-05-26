import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { SeasonService } from '../../services/SeasonService.js';
import prisma from '../../lib/prisma.js';
import { Command, CommandDeferType } from '../command.js';
import { EventData } from '../../models/internal-models.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { strings } from '../../lang/strings.js';
import { PrismaClient } from '@prisma/client';

export const joinSeasonCommandData = new SlashCommandBuilder()
  .setName('join')
  .setDescription('Join an existing season')
  .addStringOption(option =>
    option.setName('season')
      .setDescription('The ID of the season to join')
      .setRequired(true));

export class JoinSeasonCommand implements Command {
  public names = [joinSeasonCommandData.name];
  public data = joinSeasonCommandData;
  public deferType = CommandDeferType.HIDDEN;
  public requireClientPerms: PermissionsString[] = ['SendMessages'];

  private prisma: PrismaClient;
  private seasonService: SeasonService;

  constructor(prisma: PrismaClient, seasonService: SeasonService) {
    this.prisma = prisma;
    this.seasonService = seasonService;
  }

  public async execute(interaction: ChatInputCommandInteraction, data: EventData): Promise<void> {
    console.log(`[JoinSeasonCommand] Executing /join command for user: ${interaction.user.id}, username: ${interaction.user.username}`);
    const seasonId = interaction.options.getString('season', true);
    const discordUserId = interaction.user.id;
    console.log(`[JoinSeasonCommand] Received season: ${seasonId}, discordUserId: ${discordUserId}`);

    try {
      const season = await this.seasonService.findSeasonById(seasonId);
      
      if (!season) {
        await SimpleMessage.sendError(
          interaction,
          strings.messages.joinSeason.seasonNotFound,
          { seasonId },
          true
        );
        return;
      }
      
      const validJoinStatuses = ['OPEN'];
      if (!validJoinStatuses.includes(season.status)) {
        await SimpleMessage.sendError(
          interaction,
          strings.messages.joinSeason.notOpen,
          { seasonId, status: season.status },
          true
        );
        return;
      }
      
      let player = await this.prisma.player.findUnique({
        where: { discordUserId }
      });
      
      if (!player) {
        try {
          player = await this.prisma.player.create({
            data: {
              discordUserId,
              name: interaction.user.username,
            }
          });
          
          const result = await this.seasonService.addPlayerToSeason(player.id, seasonId);
          
          if (result.type === 'success') {
            await SimpleMessage.sendSuccess(
              interaction,
              strings.messages.joinSeason.success,
              { ...result.data, seasonId },
              false
            );
          } else {
            await SimpleMessage.sendError(
              interaction,
              strings.messages.joinSeason.genericError,
              { seasonId, errorMessage: result.key },
              true
            );
          }
          
        } catch (error) {
          console.error('Error creating player record:', error);
          await SimpleMessage.sendError(
            interaction,
            strings.messages.joinSeason.genericError,
            {
              seasonId,
              errorMessage: error instanceof Error ? error.message : 'Unknown error'
            },
            true
          );
        }
        return;
      }
      
      const result = await this.seasonService.addPlayerToSeason(player.id, seasonId);
      
      if (result.type === 'success') {
        await SimpleMessage.sendSuccess(
          interaction,
          strings.messages.joinSeason.success,
          { ...result.data, seasonId },
          false
        );
      } else {
        await SimpleMessage.sendError(
          interaction,
          strings.messages.joinSeason.genericError,
          { seasonId, errorMessage: result.key },
          true
        );
      }
      
    } catch (error) {
      console.error('Error in /join command:', error);
      await SimpleMessage.sendError(
        interaction,
        strings.messages.joinSeason.genericError,
        { 
          seasonId, 
          errorMessage: error instanceof Error ? error.message : 'Unknown error' 
        },
        true
      );
    }
  }
}

export default JoinSeasonCommand; 