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
import { EventData } from '../../models/internal-models.js'; // Assuming this path is correct
import { SeasonService, NewSeasonOptions } from '../../services/SeasonService.js'; // Import the service and options type
import { PrismaClient, Prisma } from '@prisma/client'; // Import PrismaClient and Prisma for error codes
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

    // TODO: PrismaClient should be injected, not instantiated here.
    // This is a temporary setup for development.
    const prisma = new PrismaClient();
    const creatorDiscordId = intr.user.id; // Get creator ID directly from interaction
    let creator: User | null = intr.user; // Store user object for DM

    // Options extraction (already deferred by framework based on deferType)
    const name = intr.options.getString('name', true);
    const openDuration = intr.options.getString('open_duration');
    const minPlayers = intr.options.getInteger('min_players');
    const maxPlayers = intr.options.getInteger('max_players');
    const turnPattern = intr.options.getString('turn_pattern');
    const claimTimeout = intr.options.getString('claim_timeout');
    const writingTimeout = intr.options.getString('writing_timeout');
    const drawingTimeout = intr.options.getString('drawing_timeout');

    // Basic Validation
    if (minPlayers !== null && maxPlayers !== null && maxPlayers < minPlayers) {
      // logger.warn(`Invalid options for /newseason: maxPlayers (${maxPlayers}) < minPlayers (${minPlayers})`);
      await intr.editReply({ content: 'Error: Maximum players cannot be less than minimum players.' });
      return;
    }

    // Prepare Data for Service
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
      // Call Service Layer
      // TODO: Inject SeasonService properly instead of instantiating here
      const seasonService = new SeasonService(prisma); // Pass prisma client
      const newSeason = await seasonService.createSeason(seasonOptions);
      // logger.info(`Season '${newSeason.name}' (ID: ${newSeason.id}) created by ${intr.user.tag}`);

      // Send Confirmation Reply (Public/Ephemeral)
      await intr.editReply({
        content: `✅ Season '${newSeason.name}' (ID: ${newSeason.id}) created successfully! Check your DMs to add players and start the season.`
      });

      // Send DM to Creator (Subtask 6.4)
      try {
        if (!creator) {
          // Attempt to fetch the user if not available directly from interaction
          creator = await intr.client.users.fetch(creatorDiscordId);
        }
        if (creator) {
          await creator.send(
            `🎉 Your new Epyc season '${newSeason.name}' (ID: ${newSeason.id}) is ready for setup!\n\nUse the following commands in the server channel:\n- \`/join season:${newSeason.id}\` for players to join.\n- Or, you can use \`/invite season:${newSeason.id}\` to invite specific users.\n\nOnce enough players have joined (min ${newSeason.config.minPlayers}), the season will start automatically based on the \`open_duration\` (\`${newSeason.config.openDuration}\`), or when the maximum number of players (\`${newSeason.config.maxPlayers}\`) is reached.`
          );
          // Optional: Log DM success
        } else {
          console.error(`Could not find user ${creatorDiscordId} to send DM.`);
          // Maybe update the public reply? For now, just log.
        }
      } catch (dmError) {
        console.error(`Failed to send DM to creator ${creatorDiscordId} for season ${newSeason.id}:`, dmError);
        // Update the original reply to inform the user about the DM failure
        await intr.editReply({
          content: `✅ Season '${newSeason.name}' (ID: ${newSeason.id}) created, but I failed to send you the setup instructions via DM. Please use \`/join season:${newSeason.id}\` to get started.`
        });
      }

      await prisma.$disconnect();
    } catch (error) {
      console.error("Error in /newseason command:", error);
      let userErrorMessage = 'An error occurred while trying to create the season.';

      // Refined Error Handling (Subtask 6.4)
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Handle known Prisma errors (e.g., unique constraint violation)
        if (error.code === 'P2002') {
          // Assuming the unique constraint is on the 'name' field of the Season model
          // The error message might contain target field info: error.meta?.target
          if ((error.meta?.target as string[])?.includes('name')) {
            userErrorMessage = `❌ A season with the name '${name}' already exists. Please choose a different name.`;
          } else {
            userErrorMessage = '❌ Failed to create season due to a database conflict. Please try again.'; // More generic
          }
        }
      } else if (error instanceof Error && error.message.includes('Creator player not found')) {
        userErrorMessage = `❌ ${error.message} Please make sure you are registered with the bot first.`; // Use specific message
      }

      try {
        await intr.editReply({ content: userErrorMessage });
      } catch (editError) {
        console.error("Failed to edit reply for /newseason error:", editError);
      }
      await prisma.$disconnect();
    }
  },
};

export default command; // Ensure default export for dynamic loading 