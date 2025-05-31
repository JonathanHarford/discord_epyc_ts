import { ActionRowBuilder, ButtonBuilder, ButtonStyle, CacheType, ModalSubmitInteraction } from 'discord.js';

import { ModalHandler } from './modalHandler.js';
import { strings } from '../lang/strings.js';
import prisma from '../lib/prisma.js';
import { GameService } from '../services/GameService.js';
import { Logger } from '../services/index.js';
import { SchedulerService } from '../services/SchedulerService.js';
import { NewSeasonOptions, SeasonService } from '../services/SeasonService.js';
import { SeasonTurnService } from '../services/SeasonTurnService.js';

// Temporary state storage for multi-step modal (if we extend it)
// For a single step, it's less critical but good for structure.
// Key: userId, Value: Partial<NewSeasonOptions> or a specific type for wizard data
export const seasonCreationState = new Map<string, Partial<NewSeasonOptions>>();

export class SeasonCreateModalHandler implements ModalHandler {
    customIdPrefix = 'season_create_';

    public async execute(interaction: ModalSubmitInteraction<CacheType>): Promise<void> {
        if (interaction.customId === 'season_create_step1') {
            await this.handleStep1(interaction);
        } else {
            Logger.warn(`SeasonCreateModalHandler: Received unhandled customId: ${interaction.customId}`);
            await interaction.reply({ content: 'Sorry, this action isn\'t recognized.', ephemeral: true });
        }
    }

    private async handleStep1(interaction: ModalSubmitInteraction<CacheType>): Promise<void> {
        const userId = interaction.user.id;

        // Create service instances
        const schedulerService = new SchedulerService(prisma);
        const gameService = new GameService(prisma);
        const turnService = new SeasonTurnService(prisma, interaction.client, schedulerService);
        const seasonService = new SeasonService(prisma, turnService, schedulerService, gameService);

        try {
            const seasonName = interaction.fields.getTextInputValue('seasonNameInput'); // Optional
            const maxPlayersStr = interaction.fields.getTextInputValue('maxPlayersInput');
            const minPlayersStr = interaction.fields.getTextInputValue('minPlayersInput');
            const openDuration = interaction.fields.getTextInputValue('openDurationInput'); // Optional

            // --- Validation ---
            const maxPlayers = parseInt(maxPlayersStr);
            const minPlayers = parseInt(minPlayersStr);

            if (isNaN(maxPlayers) || maxPlayers <= 0) {
                await interaction.reply({ content: 'Max Players must be a positive number.', ephemeral: true });
                return;
            }
            if (isNaN(minPlayers) || minPlayers <= 0) {
                await interaction.reply({ content: 'Min Players must be a positive number.', ephemeral: true });
                return;
            }
            if (minPlayers > maxPlayers) {
                await interaction.reply({ content: 'Min Players cannot be greater than Max Players.', ephemeral: true });
                return;
            }
            // Add openDuration validation if necessary (e.g., regex for '7d', '24h')

            // --- Store data (conceptually, for single step this directly becomes options) ---
            const currentData: Partial<NewSeasonOptions> = seasonCreationState.get(userId) || {};

            // Note: NewSeasonOptions doesn't have a 'name' field, removing this line
            // if (seasonName) currentData.name = seasonName;
            currentData.maxPlayers = maxPlayers;
            currentData.minPlayers = minPlayers;
            if (openDuration) currentData.openDuration = openDuration;
            // currentData.creatorPlayerId will be set by the service using interaction.user.id

            // --- For single-step modal, proceed to create season ---
            // Ensure creatorPlayerId is resolved before calling createSeason
            let playerRecord = await prisma.player.findUnique({ where: { discordUserId: userId } });
            if (!playerRecord) {
                try {
                    playerRecord = await prisma.player.create({
                        data: { discordUserId: userId, name: interaction.user.username },
                    });
                    Logger.info(`Created new player record for ${interaction.user.username} (ID: ${playerRecord.id}) during modal season creation.`);
                } catch (playerCreateError) {
                    Logger.error(`Failed to create player record for ${interaction.user.username} (Discord ID: ${userId}) during modal season creation:`, playerCreateError);
                    await interaction.reply({ content: strings.messages.newSeason.errorPlayerCreateFailed.replace('{discordId}', userId), ephemeral: true });
                    return;
                }
            }
            currentData.creatorPlayerId = playerRecord.id;


            // Assuming NewSeasonOptions aligns with what createSeason expects,
            // or adapt currentData to fit the service method's signature.
            const finalOptions = currentData as NewSeasonOptions;
            // The above cast is safe if all required fields for NewSeasonOptions are filled or optional.
            // creatorPlayerId is now added. Other fields like turn patterns would be defaults or from future steps.

            const result = await seasonService.createSeason(finalOptions);

            seasonCreationState.delete(userId); // Clean up state

            if (result.type === 'success' && result.data && result.data.seasonId) {
                const seasonId = result.data.seasonId;
                const joinButton = new ButtonBuilder()
                    .setCustomId(`season_join_${seasonId}`)
                    .setLabel('Join Season')
                    .setStyle(ButtonStyle.Primary);
                const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton);

                // Modal interactions can only be replied to or followed up ephemerally.
                // To send a public message, we need to do it via interaction.channel.send
                // and acknowledge the modal interaction ephemerally first.
                await interaction.reply({
                    content: strings.messages.newSeason.createSuccessEphemeral.replace('{seasonId}', seasonId.toString()) || `Season ${seasonId} created! A public announcement has been made.`,
                    ephemeral: true
                });
                await interaction.channel.send({
                    content: strings.messages.newSeason.createSuccessChannel
                                .replace('{seasonId}', seasonId.toString())
                                .replace('{mentionUser}', interaction.user.toString()),
                    components: [actionRow]
                });

            } else if (result.type === 'success') { // Missing seasonId in data
                 Logger.warn(`Season creation via modal success for user ${interaction.user.tag} but seasonId missing.`);
                 await interaction.reply({
                     content: strings.messages.newSeason.createSuccessChannel
                                .replace('{seasonId}', result.data?.seasonId?.toString() || 'Unknown')
                                .replace('{mentionUser}', interaction.user.toString()),
                     ephemeral: true // Keep ephemeral as public announcement might be problematic
                 });
            } else {
                // Handle specific error keys from result.key
                let userErrorMessage: string = strings.messages.newSeason.errorGenericService;
                 if (result.key) {
                    const keyMap: Record<string, string> = {
                        'season_create_error_creator_player_not_found': strings.messages.newSeason.errorCreatorNotFound,
                        'season_create_error_min_max_players': strings.messages.newSeason.errorMinMaxPlayers,
                        // Add other specific error keys from SeasonService.createSeason
                    };
                    userErrorMessage = keyMap[result.key] || userErrorMessage;
                }
                await interaction.reply({ content: userErrorMessage, ephemeral: true });
            }

        } catch (error) {
            Logger.error('Error processing season_create_step1 modal:', error);
            seasonCreationState.delete(userId); // Clean up state on error too
            if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while creating the season. Please try again.', ephemeral: true });
            } else {
                // If already replied (e.g. validation error), followUp might be better if the error is from service call
                await interaction.followUp({ content: 'An error occurred after initial validation. Please try again.', ephemeral: true });
            }
        }
    }
}
