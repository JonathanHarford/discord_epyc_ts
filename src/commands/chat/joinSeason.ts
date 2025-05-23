import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { SeasonService } from '../../services/SeasonService.js';
import prisma from '../../lib/prisma.js';
import { Lang } from '../../services/lang.js';
import { Language } from '../../models/enum-helpers/language.js';
import { Command, CommandDeferType } from '../command.js';
import { EventData } from '../../models/internal-models.js';
import { LangKeys } from '../../constants/lang-keys.js';
import { MessageAdapter } from '../../messaging/MessageAdapter.js';
import { MessageInstruction } from '../../types/MessageInstruction.js';
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
        const notFoundInstruction: MessageInstruction = {
          type: 'error',
          key: LangKeys.Commands.JoinSeason.seasonNotFound,
          data: { seasonId },
          formatting: { ephemeral: true }
        };
        await MessageAdapter.processInstruction(notFoundInstruction, interaction, data.lang);
        return;
      }
      
      const validJoinStatuses = ['SETUP', 'PENDING_START', 'OPEN'];
      if (!validJoinStatuses.includes(season.status)) {
        const notOpenInstruction: MessageInstruction = {
          type: 'error',
          key: LangKeys.Commands.JoinSeason.notOpen,
          data: { seasonId, status: season.status },
          formatting: { ephemeral: true }
        };
        await MessageAdapter.processInstruction(notOpenInstruction, interaction, data.lang);
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
          const resultInstruction: MessageInstruction = {
            ...result,
            data: { ...result.data, seasonId }
          };
          await MessageAdapter.processInstruction(resultInstruction, interaction, data.lang);
          
        } catch (error) {
          console.error('Error creating player record:', error);
          const errorInstruction: MessageInstruction = {
            type: 'error',
            key: LangKeys.Commands.JoinSeason.genericError,
            data: {
              seasonId,
              errorMessage: error instanceof Error ? error.message : 'Unknown error'
            },
            formatting: { ephemeral: true }
          };
          await MessageAdapter.processInstruction(errorInstruction, interaction, data.lang);
        }
        return;
      }
      
      const result = await this.seasonService.addPlayerToSeason(player.id, seasonId);
      
      const resultInstruction: MessageInstruction = {
        ...result,
        data: { ...result.data, seasonId }
      };
      await MessageAdapter.processInstruction(resultInstruction, interaction, data.lang);
      
    } catch (error) {
      console.error('Error in /join command:', error);
      const errorInstruction: MessageInstruction = {
        type: 'error',
        key: LangKeys.Commands.JoinSeason.genericError,
        data: { 
          seasonId, 
          errorMessage: error instanceof Error ? error.message : 'Unknown error' 
        },
        formatting: { ephemeral: true }
      };
      await MessageAdapter.processInstruction(errorInstruction, interaction, data.lang);
    }
  }
}

export default JoinSeasonCommand; 