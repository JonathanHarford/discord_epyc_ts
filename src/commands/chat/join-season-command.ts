import {
    ChatInputCommandInteraction,
    EmbedBuilder,
    PermissionsString,
    SlashCommandBuilder,
} from 'discord.js';
import { PrismaClient } from '@prisma/client'; // Import Prisma Client

import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { Lang, SeasonService } from '../../services/index.js'; // Import SeasonService
import { InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

// TODO: Properly inject PrismaClient and SeasonService
const prisma = new PrismaClient();
const seasonService = new SeasonService(prisma);

export class JoinSeasonCommand implements Command {
    public names = [Lang.getRef('chatCommands.joinSeason', Language.Default)]; // TODO: Add localization key
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];

    public get metadata() {
        return new SlashCommandBuilder()
            .setName(this.names[0])
            .setDescription(Lang.getRef('commandDescs.joinSeason', Language.Default)) // TODO: Add localization key
            .addStringOption(option =>
                option
                    .setName(Lang.getRef('arguments.seasonId', Language.Default)) // TODO: Add localization key
                    .setDescription(
                        Lang.getRef('argumentDescs.seasonId', Language.Default)
                    ) // TODO: Add localization key
                    .setRequired(true)
            );
    }

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const seasonIdInput = intr.options.getString(
            Lang.getRef('arguments.seasonId', Language.Default),
            true
        ); // TODO: Add localization key
        const userId = intr.user.id;

        // TODO: Implement more robust argument validation (e.g., check if it matches expected ID format if applicable)

        try {
            // Call the service layer to handle joining logic
            const result = await seasonService.addPlayerToSeason(userId, seasonIdInput);

            let embed: EmbedBuilder;
            if (result.success) {
                 // TODO: Use localized success message from Lang service
                embed = new EmbedBuilder()
                    .setColor('Green')
                    .setTitle('Season Joined!')
                    .setDescription(`${result.message}: ${result.season?.name || seasonIdInput}`);
            } else {
                 // TODO: Use localized error messages from Lang service based on result.message
                embed = new EmbedBuilder()
                    .setColor('Red')
                    .setTitle('Failed to Join Season')
                    .setDescription(result.message); // Use the specific error from the service
            }

            await InteractionUtils.send(intr, embed);

        } catch (error) {
            // Generic error handler for unexpected issues (e.g., DB connection error)
            console.error('Error executing join season command:', error);
             // TODO: Use localized generic error message
            const errorEmbed = new EmbedBuilder()
                .setColor('Red')
                .setTitle('Error')
                .setDescription('An unexpected error occurred while trying to join the season.');

            // Use send instead of editReply because deferType is HIDDEN
            await InteractionUtils.send(intr, errorEmbed).catch(console.error); // Catch potential errors sending the error message
        }
    }
} 