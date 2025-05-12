import {
  ApplicationCommandOptionChoiceData,
  AutocompleteFocusedOption,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  PermissionsString,
  SlashCommandBuilder,
  PermissionsBitField,
} from 'discord.js';
import { Command, CommandDeferType } from '../command.js';
import { EventData } from '../../models/internal-models.js'; // Assuming this path is correct
import { SeasonService, NewSeasonOptions } from '../../services/SeasonService.js'; // Import the service and options type
// import logger from '../../utils/logger'; // Placeholder if needed

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

// We still need the builder for registration, but it's not part of the exported Command object itself
// The registration service likely extracts this or uses a separate definition.
// Let's assume a convention where the builder is defined separately or exported alongside.
export const newSeasonCommandData = new SlashCommandBuilder()
  .setName('newseason')
  .setDescription('Starts a new season of the Epyc game.')
  // Required option
  .addStringOption(option =>
    option.setName('name')
      .setDescription('The unique name for this season.')
      .setRequired(true))
  // Optional configuration options
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
  .setDefaultMemberPermissions(PermissionsBitField.Flags.SendMessages) // Use the flag directly
  .setDMPermission(false); // Typically, seasons are created in channels

export const command: Command = {
  names: ['newseason'], // Matches SlashCommandBuilder name
  deferType: CommandDeferType.HIDDEN, // Use HIDDEN for setup commands (ephemeral reply)
  requireClientPerms: ['SendMessages'], // Permissions the bot needs

  // autocomplete?(intr: AutocompleteInteraction, option: AutocompleteFocusedOption): Promise<ApplicationCommandOptionChoiceData[]> {
  //   // Implement autocomplete if needed for options in the future
  // },

  async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
    // logger.info(`'/newseason' command executed by ${intr.user.tag} with data: ${JSON.stringify(data)}`); // Optional logging

    // Options extraction (already deferred by framework based on deferType)
    const name = intr.options.getString('name', true);
    const openDuration = intr.options.getString('open_duration');
    const minPlayers = intr.options.getInteger('min_players');
    const maxPlayers = intr.options.getInteger('max_players');
    const turnPattern = intr.options.getString('turn_pattern');
    const claimTimeout = intr.options.getString('claim_timeout');
    const writingTimeout = intr.options.getString('writing_timeout');
    const drawingTimeout = intr.options.getString('drawing_timeout');
    const creatorDiscordId = intr.user.id;

    // Basic Validation
    if (minPlayers !== null && maxPlayers !== null && maxPlayers < minPlayers) {
      // logger.warn(`Invalid options for /newseason: maxPlayers (${maxPlayers}) < minPlayers (${minPlayers})`);
      await intr.editReply({ content: 'Error: Maximum players cannot be less than minimum players.' });
      return;
    }

    // Prepare Data for Service
    const seasonOptions = {
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
      // Call Service Layer
      // TODO: Inject SeasonService properly instead of instantiating here
      const seasonService = new SeasonService(/* dependencies */);
      // Pass only the options argument for now
      const newSeason = await seasonService.createSeason(seasonOptions as NewSeasonOptions);
      // logger.info(`Season '${newSeason.name}' (ID: ${newSeason.id}) created by ${intr.user.tag}`);

      // Send Confirmation Reply (handle properly in subtask 6.4)
      // Use the actual name from the result object
      await intr.editReply({ content: `✅ Season '${newSeason.name}' (ID: ${newSeason.id}) created successfully! Check your DMs for the next step.` });

    } catch (error) {
      // Error Handling (Implement properly in subtask 6.4)
      // logger.error(`Error creating season '${name}':`, error);
      console.error("Error in /newseason command:", error);
      // Ensure reply is edited even if error occurs before service call completes (or during)
      try {
        // Attempt to edit the reply, catching errors if it fails (e.g., interaction expired)
        await intr.editReply({ content: 'An error occurred while trying to create the season.' });
      } catch (editError) {
        console.error("Failed to edit reply for /newseason error:", editError);
        // Log the failure, but don't try to reply again as the interaction is likely invalid
      }
    }
  },
};

export default command; // Ensure default export for dynamic loading 