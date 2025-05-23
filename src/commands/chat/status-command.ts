import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { SeasonService, TurnService } from '../../services/index.js';
import prisma from '../../lib/prisma.js';
import { Language } from '../../models/enum-helpers/language.js';
import { Command, CommandDeferType } from '../command.js';
import { EventData } from '../../models/internal-models.js';
import { LangKeys } from '../../constants/lang-keys.js';
import { MessageAdapter } from '../../messaging/MessageAdapter.js';
import { MessageHelpers } from '../../messaging/MessageHelpers.js';
import { MessageInstruction } from '../../types/MessageInstruction.js';
import { PrismaClient } from '@prisma/client';

export const statusCommandData = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Get status information for a season')
  .addStringOption(option =>
    option.setName('season')
      .setDescription('The ID of the season to check status for')
      .setRequired(true));

export class StatusCommand implements Command {
  public names = [statusCommandData.name];
  public data = statusCommandData;
  public deferType = CommandDeferType.HIDDEN;
  public requireClientPerms: PermissionsString[] = ['SendMessages'];

  private prisma: PrismaClient;
  private seasonService: SeasonService;
  private turnService: TurnService;

  constructor(prisma: PrismaClient, seasonService: SeasonService, turnService: TurnService) {
    this.prisma = prisma;
    this.seasonService = seasonService;
    this.turnService = turnService;
  }

  public async execute(interaction: ChatInputCommandInteraction, data: EventData): Promise<void> {
    console.log(`[StatusCommand] Executing /status command for user: ${interaction.user.id}, username: ${interaction.user.username}`);
    const seasonId = interaction.options.getString('season', true);
    console.log(`[StatusCommand] Received season: ${seasonId}`);

    try {
      // Get season details including config and player count
      const season = await this.seasonService.findSeasonById(seasonId);
      
      if (!season) {
        const notFoundInstruction: MessageInstruction = {
          type: 'error',
          key: 'status.seasonNotFound',
          data: { seasonId },
          formatting: { ephemeral: true }
        };
        await MessageAdapter.processInstruction(notFoundInstruction, interaction, data.lang);
        return;
      }

      // Get all games for this season with their turns
      const games = await this.prisma.game.findMany({
        where: { seasonId },
        include: {
          turns: {
            orderBy: { turnNumber: 'asc' },
            include: {
              player: {
                select: { name: true, discordUserId: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      // Calculate status information
      const statusData = {
        seasonId: season.id,
        seasonStatus: season.status,
        playerCount: season._count.players,
        minPlayers: season.config.minPlayers,
        maxPlayers: season.config.maxPlayers,
        gameCount: games.length,
        games: games.map(game => {
          const turns = game.turns;
          const pendingTurns = turns.filter(turn => turn.status === 'PENDING').length;
          const offeredTurns = turns.filter(turn => turn.status === 'OFFERED').length;
          const completedTurns = turns.filter(turn => turn.status === 'COMPLETED').length;
          const totalTurns = turns.length;
          
          // Find current turn (most recent non-completed turn)
          const currentTurn = turns.find(turn => 
            turn.status === 'PENDING' || turn.status === 'OFFERED'
          );

          return {
            gameId: game.id,
            gameStatus: game.status,
            totalTurns,
            completedTurns,
            pendingTurns,
            offeredTurns,
            currentTurn: currentTurn ? {
              turnNumber: currentTurn.turnNumber,
              type: currentTurn.type,
              status: currentTurn.status,
              playerName: currentTurn.player?.name || 'Unknown',
              offeredAt: currentTurn.offeredAt,
              claimedAt: currentTurn.claimedAt
            } : null
          };
        })
      };

      // Create success instruction with formatted data
      const successInstruction = MessageHelpers.embedMessage(
        'info',
        'status.seasonStatus',
        statusData,
        false // Not ephemeral, so others can see the status
      );

      await MessageAdapter.processInstruction(successInstruction, interaction, data.lang);
      
    } catch (error) {
      console.error('Error in /status command:', error);
      const errorInstruction: MessageInstruction = {
        type: 'error',
        key: 'status.genericError',
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

export default StatusCommand; 