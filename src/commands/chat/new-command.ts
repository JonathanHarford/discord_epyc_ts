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
// Assuming Lang service is available, e.g., import { Lang } from '../../services/LangService.js';
// For now, we'll construct strings and mark where Lang service should be used.

// TODO: Define a type/interface for the options object passed to the service
// interface NewSeasonOptions {
//   name: string;
//   creatorDiscordId: string;
//   openDuration?: string;
//   minPlayers?: number;
//   maxPlayers?: number;
//   turnPattern?: string;
//   claimTimeout?: string;
//   writingTimeout?: string;
//   drawingTimeout?: string;
//   // Add warning timeouts if needed based on schema/service
// }

// Renamed from newSeasonCommandData to newCommandData
export const newCommandData = new SlashCommandBuilder()
  .setName('new')
  .setDescription('Handles creation of new game entities.')
  .addSubcommand(subcommand =>
    subcommand
      .setName('season')
      .setDescription('Starts a new season of the Epyc game.')
      .addStringOption(option =>
        option.setName('name')
          .setDescription('The unique name for this season.')
          .setRequired(true))
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

export const command: Command = {
  names: ['new'],
  deferType: CommandDeferType.HIDDEN,
  requireClientPerms: ['SendMessages'],

  // autocomplete?(intr: AutocompleteInteraction, option: AutocompleteFocusedOption): Promise<ApplicationCommandOptionChoiceData[]> {
  //   // Implement autocomplete if needed for options in the future
  // },

  async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
    const subcommand = intr.options.getSubcommand();

    if (subcommand === 'season') {
      // TODO: Centralize PrismaClient management. Ideally, it should be injected or obtained from a shared context.
      // For now, instantiating locally and passing to the service. --> This is now resolved.
      // const prisma = new PrismaClient(); // Removed local instantiation
      const seasonService = new SeasonService(prisma); // Use global prisma instance

      const creatorDiscordId = intr.user.id;
      const creator: User = intr.user;

      const name = intr.options.getString('name', true);
      const openDuration = intr.options.getString('open_duration');
      const minPlayers = intr.options.getInteger('min_players');
      const maxPlayers = intr.options.getInteger('max_players');
      const turnPattern = intr.options.getString('turn_pattern');
      const claimTimeout = intr.options.getString('claim_timeout');
      const writingTimeout = intr.options.getString('writing_timeout');
      const drawingTimeout = intr.options.getString('drawing_timeout');

      const seasonOptions: NewSeasonOptions = {
        name,
        creatorDiscordId,
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
          // const successReply = Lang.get(instruction.key, instruction.data); // Key: 'season_create_success'
          // const successReply = `✅ Season '${instruction.data?.seasonName}\' (ID: ${instruction.data?.seasonId}) created successfully! Check your DMs for setup instructions.`;
          const successReply = Lang.getRef('newCommand.season.create_success_channel', Language.Default, instruction.data);
          await intr.editReply({ content: successReply });

          try {
            // const dmMessage = Lang.get('new_season_success_dm', instruction.data);
            // const dmMessage = `🎉 Your new Epyc season '${instruction.data?.seasonName}\' (ID: ${instruction.data?.seasonId}) is ready for setup!\nUse /join season:${instruction.data?.seasonId} for players to join.`;
            const dmMessage = Lang.getRef('newCommand.season.create_success_dm', Language.Default, instruction.data);
            await creator.send(dmMessage.trim());
          } catch (dmError) {
            console.error(`Failed to send DM to creator ${creatorDiscordId} for season ${instruction.data?.seasonId}:`, dmError);
            // const dmFailReply = Lang.get('new_season_dm_fail_reply', instruction.data);
            // const dmFailReply = `✅ Season '${instruction.data?.seasonName}' (ID: ${instruction.data?.seasonId}) created, but I failed to send setup instructions via DM. Please use /join season:${instruction.data?.seasonId}.`;
            const dmFailReply = Lang.getRef('newCommand.season.create_dm_fail_channel', Language.Default, instruction.data);
            await intr.followUp({ content: dmFailReply, ephemeral: true });
          }
        } else { // instruction.type === 'error'
          // const errorMessage = Lang.get(instruction.key, instruction.data);
          // let errorMessage = 'An error occurred while trying to create the season.'; // Default for unknown service errors
          // if (instruction.key === 'season_create_error_name_taken') {
          //     errorMessage = `❌ A season with the name '${instruction.data?.name}' already exists. Please choose a different name.`;
          // } else if (instruction.key === 'season_create_error_creator_not_found') {
          //     errorMessage = `❌ Creator with Discord ID ${instruction.data?.discordUserId} not found. Please ensure you are registered.`;
          // } else if (instruction.key === 'season_create_error_min_max_players') {
          //     errorMessage = `❌ Error: Maximum players (${instruction.data?.maxPlayers}) cannot be less than minimum players (${instruction.data?.minPlayers}).`;
          // } else if (instruction.key === 'season_create_error_prisma_unique_constraint' || instruction.key === 'season_create_error_prisma') {
          //     errorMessage = `❌ A database error occurred (Code: ${instruction.data?.errorCode}). Please try again.`;
          // } else if (instruction.key === 'season_create_error_unknown' && instruction.data?.message) {
          //     errorMessage = `❌ An unexpected error occurred: ${instruction.data.message}`;
          // }
          // Default to a generic key if the specific one isn't directly usable or for unexpected keys.
          // The plan was to use instruction.key directly, or map it. For now, let's assume direct usage or a generic fallback.
          // A more robust solution might involve a switch or a mapping function if service keys don't match Lang keys.
          let langKey = instruction.key; // Use service key directly
          // Attempt to map service keys to more specific lang keys or use a generic one
          // This mapping logic could be more sophisticated or configuration-driven
          if (instruction.key === 'season_create_error_name_taken') {
            langKey = 'newCommand.season.error_name_taken';
          } else if (instruction.key === 'season_create_error_creator_not_found') {
            langKey = 'newCommand.season.error_creator_not_found';
          } else if (instruction.key === 'season_create_error_min_max_players') {
            langKey = 'newCommand.season.error_min_max_players';
          } else if (instruction.key === 'season_create_error_prisma_unique_constraint' || instruction.key === 'season_create_error_prisma') {
            langKey = 'newCommand.season.error_db';
          } else if (instruction.key === 'season_create_error_unknown') {
            langKey = 'newCommand.season.error_unknown_service';
          } else {
            // Fallback for unmapped service error keys
            langKey = 'newCommand.season.error_generic_service'; 
          }
          const errorMessage = Lang.getRef(langKey, Language.Default, instruction.data);
          await intr.editReply({ content: errorMessage });
        }
      } catch (error) {
        // This catch block is for unexpected errors thrown by seasonService.createSeason itself,
        // though it's designed to return MessageInstruction for handled errors.
        // Or errors during intr.editReply / intr.followUp before prisma.$disconnect.
        console.error("Critical error in /new season command processing:", error);
        // const criticalErrorMessage = Lang.get('error_critical_command_processing');
        // await intr.editReply({ content: 'A critical unexpected error occurred. Please contact support.' });
        const criticalErrorMessage = Lang.getRef('common.error.critical_command', Language.Default);
        await intr.editReply({ content: criticalErrorMessage });
      } finally {
        // await prisma.$disconnect(); // Removed disconnect for local Prisma client
      }
    } else {
      // const unknownSubcommandMessage = Lang.get('new_command_unknown_subcommand');
      // const unknownSubcommandMessage = 'Unknown subcommand for /new.';
      const unknownSubcommandMessage = Lang.getRef('newCommand.error_unknown_subcommand', Language.Default);
      await intr.editReply({ content: unknownSubcommandMessage });
    }
  },
};

export default command; 