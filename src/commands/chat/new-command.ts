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

// Renamed from newSeasonCommandData to newCommandData
export const newCommandData = new SlashCommandBuilder()
  .setName('new')
  .setDescription('Handles creation of new game entities.')
  .addSubcommand(subcommand =>
    subcommand
      .setName('season')
      .setDescription('Starts a new season of the Epyc game.')
      // All existing options from newSeasonCommandData are moved here
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
  names: ['new'], // Changed from ['newseason']
  deferType: CommandDeferType.HIDDEN,
  requireClientPerms: ['SendMessages'],

  // autocomplete?(intr: AutocompleteInteraction, option: AutocompleteFocusedOption): Promise<ApplicationCommandOptionChoiceData[]> {
  //   // Implement autocomplete if needed for options in the future
  // },

  async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
    const subcommand = intr.options.getSubcommand();

    if (subcommand === 'season') {
      // Logic for '/new season'
      const prisma = new PrismaClient();
      const creatorDiscordId = intr.user.id;
      let creator: User | null = intr.user;

      const name = intr.options.getString('name', true);
      const openDuration = intr.options.getString('open_duration');
      const minPlayers = intr.options.getInteger('min_players');
      const maxPlayers = intr.options.getInteger('max_players');
      const turnPattern = intr.options.getString('turn_pattern');
      const claimTimeout = intr.options.getString('claim_timeout');
      const writingTimeout = intr.options.getString('writing_timeout');
      const drawingTimeout = intr.options.getString('drawing_timeout');

      if (minPlayers !== null && maxPlayers !== null && maxPlayers < minPlayers) {
        await intr.editReply({ content: 'Error: Maximum players cannot be less than minimum players.' });
        return;
      }

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
        const seasonService = new SeasonService(prisma);
        const newSeason = await seasonService.createSeason(seasonOptions);

        await intr.editReply({
          content: `✅ Season \'${newSeason.name}\' (ID: ${newSeason.id}) created successfully! Check your DMs to add players and start the season.`
        });

        try {
          if (!creator) {
            creator = await intr.client.users.fetch(creatorDiscordId);
          }
          if (creator) {
            
            await creator.send(`
🎉 Your new Epyc season '${newSeason.name}' (ID: ${newSeason.id}) is ready for setup!
Use the following commands in the server channel:
- /join season:${newSeason.id} for players to join.
- Or, you can use /invite season:${newSeason.id} to invite specific users.
Once enough players have joined (min ${newSeason.config.minPlayers}), the season will start automatically based on the open_duration (${newSeason.config.openDuration}), or when the maximum number of players (${newSeason.config.maxPlayers}) is reached.`.trim());
          } else {
            console.error(`Could not find user ${creatorDiscordId} to send DM.`);
          }
        } catch (dmError) {
          console.error(`Failed to send DM to creator ${creatorDiscordId} for season ${newSeason.id}:`, dmError);
          await intr.editReply({
            content: `✅ Season '${newSeason.name}' (ID: ${newSeason.id}) created, but I failed to send you the setup instructions via DM. Please use /join season:${newSeason.id} to get started.`
          });
        }
        await prisma.$disconnect();
      } catch (error) {
        console.error("Error in /new season command:", error);
        let userErrorMessage = 'An error occurred while trying to create the season.';

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002') {
            if ((error.meta?.target as string[])?.includes('name')) {
              userErrorMessage = `❌ A season with the name '${name}' already exists. Please choose a different name.`;
            } else {
              userErrorMessage = '❌ Failed to create season due to a database conflict. Please try again.';
            }
          }
        } else if (error instanceof Error && error.message.includes('Creator player not found')) {
          userErrorMessage = `❌ ${error.message} Please make sure you are registered with the bot first.`;
        }

        try {
          await intr.editReply({ content: userErrorMessage });
        } catch (editError) {
          console.error("Failed to edit reply for /new season error:", editError);
        }
        await prisma.$disconnect(); // Ensure disconnect in error path too
      }
    } else {
      // Handle other subcommands or lack thereof if needed
      await intr.editReply({ content: 'Unknown subcommand for /new.' });
    }
  },
};

export default command; // Ensure default export for dynamic loading 