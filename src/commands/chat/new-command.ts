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
import { MessageAdapter } from '../../messaging/MessageAdapter.js';
import prisma from '../../lib/prisma.js'; // Import global Prisma client instance
import { Lang } from '../../services/lang.js';
import { Language } from '../../models/enum-helpers/language.js';
import { PrismaClient } from '@prisma/client'; // ADDED: Import PrismaClient type


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
  // .setDefaultMemberPermissions(PermissionsBitField.Flags.SendMessages) // This should be on the subcommand or handled differently for base command
  .setDMPermission(false); // Can be true if subcommands are usable in DMs

export class NewCommand implements Command {
  public names = ['new'];
  public deferType = CommandDeferType.HIDDEN;
  public requireClientPerms: PermissionsString[] = ['SendMessages'];

  private prisma: PrismaClient; // ADDED: Store Prisma client
  private seasonService: SeasonService; // ADDED: Store SeasonService

  // Inject dependencies
  constructor(prisma: PrismaClient, seasonService: SeasonService) { // MODIFIED: Added constructor with injected services
    this.prisma = prisma;
    this.seasonService = seasonService;
  }

  public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
    const subcommand = intr.options.getSubcommand();

    if (subcommand === 'season') {
      // REMOVE: Instantiate SeasonService here, use injected instance
      // const seasonService = new SeasonService(prisma, null); // Use global prisma instance

      const discordUserId = intr.user.id;
      const discordUserName = intr.user.username; // Get username for player creation

      // --- Find or Create Player ---
      // Use injected prisma instance
      let playerRecord = await this.prisma.player.findUnique({
        where: { discordUserId: discordUserId },
      });

      if (!playerRecord) {
        try {
          // Use injected prisma instance
          playerRecord = await this.prisma.player.create({
            data: {
              discordUserId: discordUserId,
              name: discordUserName,
            },
          });
          console.log(`New player record created for ${discordUserName} (ID: ${playerRecord.id}) during /new season command.`);
        } catch (playerCreateError) {
          console.error(`Failed to create player record for ${discordUserName} (Discord ID: ${discordUserId}):`, playerCreateError);
          const playerCreateErrorInstruction: MessageInstruction = {
            type: 'error',
            key: 'newCommand.season.error_player_create_failed',
            data: { discordId: discordUserId },
            formatting: { ephemeral: true }
          };
          await MessageAdapter.processInstruction(playerCreateErrorInstruction, intr, Language.Default);
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
        creatorPlayerId, // Correctly use internal player ID
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

        // Map service keys to command-specific keys if needed
        if (instruction.type === 'success') {
          // Add user mention to the success data
          const enhancedInstruction: MessageInstruction = {
            ...instruction,
            key: 'newCommand.season.create_success_channel',
            data: { ...instruction.data, mentionUser: intr.user.toString() }
          };
          await MessageAdapter.processInstruction(enhancedInstruction, intr, Language.Default);
        } else {
          // Map service error keys to command-specific keys
          let mappedKey = instruction.key;
          if (instruction.key === 'season_create_error_creator_player_not_found') {
            mappedKey = 'newCommand.season.error_creator_not_found';
          } else if (instruction.key === 'season_create_error_min_max_players') {
            mappedKey = 'newCommand.season.error_min_max_players';
          } else if (instruction.key === 'season_create_error_prisma_unique_constraint' || instruction.key === 'season_create_error_prisma') {
            mappedKey = 'newCommand.season.error_db';
          } else if (instruction.key === 'season_create_error_unknown') {
            mappedKey = 'newCommand.season.error_unknown_service';
          } else {
            mappedKey = 'newCommand.season.error_generic_service';
          }
          
          const mappedInstruction: MessageInstruction = {
            ...instruction,
            key: mappedKey
          };
          await MessageAdapter.processInstruction(mappedInstruction, intr, Language.Default);
        }
      } catch (error) {
        console.error("Critical error in /new season command processing:", error);
        const criticalErrorInstruction: MessageInstruction = {
          type: 'error',
          key: 'common.error.critical_command',
          formatting: { ephemeral: true }
        };
        await MessageAdapter.processInstruction(criticalErrorInstruction, intr, Language.Default);
      } finally {
        // await prisma.$disconnect(); // Removed disconnect for local Prisma client
      }
    } else {
      const unknownSubcommandInstruction: MessageInstruction = {
        type: 'error',
        key: 'newCommand.error_unknown_subcommand',
        formatting: { ephemeral: true }
      };
      await MessageAdapter.processInstruction(unknownSubcommandInstruction, intr, Language.Default);
    }
  }
}

export default NewCommand; 