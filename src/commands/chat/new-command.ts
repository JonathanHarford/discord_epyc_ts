import {
  ApplicationCommandOptionChoiceData,
  AutocompleteFocusedOption,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  PermissionsString,
  SlashCommandBuilder,
  PermissionsBitField,
  User,
} from 'discord.js';
import { Command, CommandDeferType } from '../command.js';
import { EventData } from '../../models/internal-models.js';
import { SeasonService, NewSeasonOptions } from '../../services/SeasonService.js';
import { MessageInstruction } from '../../types/MessageInstruction.js';
import { SimpleMessage } from '../../messaging/SimpleMessage.js';
import { strings, interpolate } from '../../lang/strings.js';
import prisma from '../../lib/prisma.js';
import { PrismaClient } from '@prisma/client';

// Renamed from newSeasonCommandData to newCommandData
export const newCommandData = new SlashCommandBuilder()
  .setName('new')
  .setDescription('Handles creation of new game entities.')
  .addSubcommand(subcommand =>
    subcommand
      .setName('season')
      .setDescription('Starts a new season of the Epyc game.')
      .addStringOption(option =>
        option.setName('open_duration')
          .setDescription('How long the season is open for joining (e.g., "7d", "24h"). Default varies.')
          .setRequired(false))
      .addIntegerOption(option =>
        option.setName('min_players')
          .setDescription('Minimum number of players required to start. Default varies.')
          .setRequired(false)
          .setMinValue(process.env.NODE_ENV === 'production' ? 2 : 1))
      .addIntegerOption(option =>
        option.setName('max_players')
          .setDescription('Maximum number of players allowed to join. Default varies.')
          .setRequired(false))
      .addStringOption(option =>
        option.setName('turn_pattern')
          .setDescription('Pattern of turns (e.g., "writing,drawing"). Default varies.')
          .setRequired(false))
      .addStringOption(option =>
        option.setName('claim_timeout')
          .setDescription('Time allowed to claim a turn offer (e.g., "1d", "12h"). Default varies.')
          .setRequired(false))
      .addStringOption(option =>
        option.setName('writing_timeout')
          .setDescription('Time allowed to submit a writing turn (e.g., "1d", "8h"). Default varies.')
          .setRequired(false))
      .addStringOption(option =>
        option.setName('drawing_timeout')
          .setDescription('Time allowed to submit a drawing turn (e.g., "1d", "1h"). Default varies.')
          .setRequired(false))
  )
  .setDMPermission(false);

export class NewCommand implements Command {
  public names = ['new'];
  public deferType = CommandDeferType.HIDDEN;
  public requireClientPerms: PermissionsString[] = ['SendMessages'];

  private prisma: PrismaClient;
  private seasonService: SeasonService;

  // Inject dependencies
  constructor(prisma: PrismaClient, seasonService: SeasonService) {
    this.prisma = prisma;
    this.seasonService = seasonService;
  }

  public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
    const subcommand = intr.options.getSubcommand();

    if (subcommand === 'season') {
      const discordUserId = intr.user.id;
      const discordUserName = intr.user.username;

      // --- Find or Create Player ---
      let playerRecord = await this.prisma.player.findUnique({
        where: { discordUserId: discordUserId },
      });

      if (!playerRecord) {
        try {
          playerRecord = await this.prisma.player.create({
            data: {
              discordUserId: discordUserId,
              name: discordUserName,
            },
          });
          console.log(`New player record created for ${discordUserName} (ID: ${playerRecord.id}) during /new season command.`);
        } catch (playerCreateError) {
          console.error(`Failed to create player record for ${discordUserName} (Discord ID: ${discordUserId}):`, playerCreateError);
          
          await SimpleMessage.sendError(
            intr,
            strings.messages.newSeason.errorPlayerCreateFailed,
            { discordId: discordUserId }
          );
          return;
        }
      }
      const creatorPlayerId = playerRecord.id;
      // --- End Find or Create Player ---

      const openDuration = intr.options.getString('open_duration');
      const minPlayers = intr.options.getInteger('min_players');
      const maxPlayers = intr.options.getInteger('max_players');
      const turnPattern = intr.options.getString('turn_pattern');
      const claimTimeout = intr.options.getString('claim_timeout');
      const writingTimeout = intr.options.getString('writing_timeout');
      const drawingTimeout = intr.options.getString('drawing_timeout');

      const seasonOptions: NewSeasonOptions = {
        creatorPlayerId,
        ...(openDuration !== null && { openDuration }),
        ...(minPlayers !== null && { minPlayers }),
        ...(maxPlayers !== null && { maxPlayers }),
        ...(turnPattern !== null && { turnPattern }),
        ...(claimTimeout !== null && { claimTimeout }),
        ...(writingTimeout !== null && { writingTimeout }),
        ...(drawingTimeout !== null && { drawingTimeout }),
      };

      try {
        const instruction: MessageInstruction = await this.seasonService.createSeason(seasonOptions);

        if (instruction.type === 'success') {
          // Send success message with user mention
          await SimpleMessage.sendSuccess(
            intr,
            strings.messages.newSeason.createSuccessChannel,
            { 
              ...instruction.data, 
              mentionUser: intr.user.toString() 
            }
          );
        } else {
          // Handle different error types
          let errorMessage: string;
          
          if (instruction.key === 'season_create_error_creator_player_not_found') {
            errorMessage = strings.messages.newSeason.errorCreatorNotFound;
          } else if (instruction.key === 'season_create_error_min_max_players') {
            errorMessage = strings.messages.newSeason.errorMinMaxPlayers;
          } else if (instruction.key === 'season_create_error_prisma_unique_constraint' || instruction.key === 'season_create_error_prisma') {
            errorMessage = strings.messages.newSeason.errorDatabase;
          } else if (instruction.key === 'season_create_error_unknown') {
            errorMessage = strings.messages.newSeason.errorUnknownService;
          } else {
            errorMessage = strings.messages.newSeason.errorGenericService;
          }
          
          await SimpleMessage.sendError(intr, errorMessage, instruction.data);
        }
      } catch (error) {
        console.error("Critical error in /new season command processing:", error);
        await SimpleMessage.sendError(intr, strings.messages.common.errorCriticalCommand);
      }
    } else {
      await SimpleMessage.sendError(intr, "That subcommand for 'new' isn't recognized. Please check the command and try again.");
    }
  }
}

export default NewCommand; 