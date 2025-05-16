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
import prisma from '../../lib/prisma.js'; // Import global Prisma client instance
import { Lang } from '../../services/lang.js';
import { Language } from '../../models/enum-helpers/language.js';


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
          .setMinValue(2))
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

  public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
    const subcommand = intr.options.getSubcommand();

    if (subcommand === 'season') {
      const seasonService = new SeasonService(prisma); // Use global prisma instance

      const discordUserId = intr.user.id;
      const discordUserName = intr.user.username; // Get username for player creation

      // --- Find or Create Player ---
      let playerRecord = await prisma.player.findUnique({
        where: { discordUserId: discordUserId },
      });

      if (!playerRecord) {
        try {
          playerRecord = await prisma.player.create({
            data: {
              discordUserId: discordUserId,
              name: discordUserName,
            },
          });
          console.log(`New player record created for ${discordUserName} (ID: ${playerRecord.id}) during /new season command.`);
        } catch (playerCreateError) {
          console.error(`Failed to create player record for ${discordUserName} (Discord ID: ${discordUserId}):`, playerCreateError);
          const playerCreateErrorMessage = Lang.getRef('newCommand.season.error_player_create_failed', Language.Default, { discordId: discordUserId });
          await intr.editReply({ content: playerCreateErrorMessage });
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
        const instruction: MessageInstruction = await seasonService.createSeason(seasonOptions);

        if (instruction.type === 'success') {
          const successReply = Lang.getRef('newCommand.season.create_success_channel', Language.Default, { ...instruction.data, mentionUser: intr.user.toString() });
          await intr.editReply({ content: successReply });
        } else { // Handle error case
          let langKey = instruction.key; // Use service key directly
          if (instruction.key === 'season_create_error_creator_not_found') {
            langKey = 'newCommand.season.error_creator_not_found';
          } else if (instruction.key === 'season_create_error_min_max_players') {
            langKey = 'newCommand.season.error_min_max_players';
          } else if (instruction.key === 'season_create_error_prisma_unique_constraint' || instruction.key === 'season_create_error_prisma') {
            langKey = 'newCommand.season.error_db';
          } else if (instruction.key === 'season_create_error_unknown') {
            langKey = 'newCommand.season.error_unknown_service';
          } else {
            langKey = 'newCommand.season.error_generic_service'; 
          }
          const errorMessage = Lang.getRef(langKey, Language.Default, instruction.data);
          await intr.editReply({ content: errorMessage });
        }
      } catch (error) {
        console.error("Critical error in /new season command processing:", error);
        const criticalErrorMessage = Lang.getRef('common.error.critical_command', Language.Default);
        await intr.editReply({ content: criticalErrorMessage });
      } finally {
        // await prisma.$disconnect(); // Removed disconnect for local Prisma client
      }
    } else {
      const unknownSubcommandMessage = Lang.getRef('newCommand.error_unknown_subcommand', Language.Default);
      await intr.editReply({ content: unknownSubcommandMessage });
    }
  }
}

export default NewCommand; 