import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { SeasonService, TurnService } from '../../services/index.js';
import prisma from '../../lib/prisma.js';
import { Command, CommandDeferType } from '../command.js';
import { EventData } from '../../models/internal-models.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { strings } from '../../lang/strings.js';
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
        await SimpleMessage.sendError(interaction, strings.messages.status.seasonNotFound, { seasonId }, true);
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
      const gameDetails = games.map(game => {
        const turns = game.turns;
        const pendingTurns = turns.filter(turn => turn.status === 'PENDING').length;
        const offeredTurns = turns.filter(turn => turn.status === 'OFFERED').length;
        const completedTurns = turns.filter(turn => turn.status === 'COMPLETED').length;
        const totalTurns = turns.length;
        
        // Find current turn (most recent non-completed turn)
        const currentTurn = turns.find(turn => 
          turn.status === 'PENDING' || turn.status === 'OFFERED'
        );

        let gameInfo = `**Game ${game.id}** (${game.status})\n`;
        gameInfo += `Turns: ${completedTurns}/${totalTurns} completed`;
        if (pendingTurns > 0) gameInfo += `, ${pendingTurns} pending`;
        if (offeredTurns > 0) gameInfo += `, ${offeredTurns} offered`;
        
        if (currentTurn) {
          gameInfo += `\nCurrent: Turn ${currentTurn.turnNumber} (${currentTurn.type}) - ${currentTurn.player?.name || 'Unknown'} (${currentTurn.status})`;
        }
        
        return gameInfo;
      }).join('\n\n');

      await SimpleMessage.sendEmbed(interaction, strings.embeds.seasonStatus, {
        seasonId: season.id,
        seasonStatus: season.status,
        playerCount: season._count.players,
        minPlayers: season.config.minPlayers,
        maxPlayers: season.config.maxPlayers,
        gameCount: games.length,
        gameDetails: gameDetails || 'No games found'
      }, false, 'info'); // Not ephemeral, so others can see the status
      
    } catch (error) {
      console.error('Error in /status command:', error);
      await SimpleMessage.sendError(interaction, strings.messages.status.genericError, { 
        seasonId, 
        errorMessage: error instanceof Error ? error.message : 'Unknown error' 
      }, true);
    }
  }
}

export default StatusCommand; 