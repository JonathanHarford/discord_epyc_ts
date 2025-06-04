import { ModalSubmitInteraction, CacheType } from 'discord.js';
import { ModalHandler } from './modalHandler.js'; // Or from './index.js' if re-exported
import { Logger } from '../services/index.js';
import prisma from '../lib/prisma.js'; // For fetching player
import { SeasonTurnService } from '../services/SeasonTurnService.js'; // Assuming path
import { OnDemandTurnService } from '../services/OnDemandTurnService.js'; // Assuming path
import { MessageAdapter } from '../messaging/MessageAdapter.js'; // For structured responses
import { strings } from '../lang/strings.js'; // For messages
import { interpolate } from '../lang/strings.js';
import { PlayerService } from '../services/PlayerService.js'; // To get player

// Placeholder for determining which service to use. This will need refinement.
// For now, we might default to SeasonTurnService or add logic to determine context.
// This is a known simplification for this step.
async function getTurnService(interaction: ModalSubmitInteraction<CacheType>, turnId: string): Promise<SeasonTurnService | OnDemandTurnService> {
    // Basic placeholder: In a real scenario, you might look up the turn's game
    // to see if it's a season game or on-demand game.
    // For now, let's assume SeasonTurnService for simplicity of this subtask,
    // knowing this needs to be more robust.
    const turn = await prisma.turn.findUnique({ where: { id: turnId }, include: { game: true } });
    if (turn?.game?.seasonId) {
         // Assuming SeasonTurnService needs discordClient and schedulerService, which are not directly available here.
         // This highlights a dependency injection need for handlers or service locator pattern.
         // For this subtask, we'll instantiate it simply.
         Logger.info(`[TextSubmitModalHandler] Using SeasonTurnService for turn ${turnId}`);
         return new SeasonTurnService(prisma, interaction.client, undefined); // undefined for scheduler for now
    } else if (turn?.game?.id) {
         Logger.info(`[TextSubmitModalHandler] Using OnDemandTurnService for turn ${turnId}`);
         return new OnDemandTurnService(prisma, interaction.client, undefined); // undefined for scheduler
    }
    throw new Error(`Could not determine turn service for turn ${turnId}`);
}


export class TextSubmitModalHandler implements ModalHandler {
    customIdPrefix = 'text_submit_modal_';
    private playerService: PlayerService;

    constructor() {
     this.playerService = new PlayerService(prisma); // Instantiate PlayerService
    }

    public async execute(interaction: ModalSubmitInteraction<CacheType>): Promise<void> {
        const turnId = interaction.customId.substring(this.customIdPrefix.length);
        const storyText = interaction.fields.getTextInputValue('storyTextInput');
        const discordUserId = interaction.user.id;

        Logger.info(`TextSubmitModalHandler: User ${interaction.user.username} (${discordUserId}) submitted text for turn ${turnId}`);

        if (!turnId || turnId.trim().length === 0) {
            Logger.warn(`TextSubmitModalHandler: Invalid turnId from customId: ${interaction.customId}`);
            await interaction.reply({ content: 'Error: Invalid turn reference from submission. Please try again.', ephemeral: true });
            return;
        }

        if (!storyText || storyText.trim().length === 0) {
            Logger.warn(`TextSubmitModalHandler: Empty story text submitted for turn ${turnId} by ${discordUserId}`);
            await interaction.reply({ content: 'Error: Story text cannot be empty.', ephemeral: true });
            return;
        }

        try {
            const player = await this.playerService.getPlayerByDiscordId(discordUserId);
            if (!player) {
                Logger.warn(`TextSubmitModalHandler: Player not found for Discord ID ${discordUserId}`);
                await interaction.reply({ content: strings.messages.submission.playerNotFound, ephemeral: true });
                return;
            }

            // Determine which turn service to use (Season or OnDemand)
            // This is a simplified approach for this subtask.
            // In a full implementation, the turn's game type would determine the service.
            const turn = await prisma.turn.findUnique({
                where: { id: turnId },
                include: { game: true }
            });

            let serviceResult;
            if (turn?.game?.seasonId) {
                const seasonTurnService = new SeasonTurnService(prisma, interaction.client); // Scheduler can be optional
                // The method submitTextTurn will be created in the next subtask (4.5)
                serviceResult = await seasonTurnService.submitTurn(turnId, player.id, storyText, 'text');
            } else if (turn?.game?.id) { // Assuming it's an on-demand game if no seasonId
                const onDemandTurnService = new OnDemandTurnService(prisma, interaction.client); // Scheduler can be optional
                // The method submitTextTurn will be created in the next subtask (4.5)
                // For now, OnDemandTurnService has submitTurn that takes contentType
                serviceResult = await onDemandTurnService.submitTurn(turnId, player.id, storyText, 'text');
            } else {
                Logger.error(`TextSubmitModalHandler: Could not find turn or determine game type for turn ${turnId}`);
                await interaction.reply({ content: 'Error: Could not process your submission. Turn or game not found.', ephemeral: true });
                return;
            }

            if (serviceResult.success) {
                 // Get the completed games channel ID for the link
                 let finishedGamesLink = 'the completed games channel';
                 const gameWithSeason = await prisma.game.findUnique({
                     where: { id: turn.game.id }, // turn is defined here
                     include: { season: true }
                 });
                 const guildId = gameWithSeason?.season?.guildId || gameWithSeason?.guildId;
                 if (guildId) {
                     const { ChannelConfigService } = await import('../services/ChannelConfigService.js');
                     const channelConfigService = new ChannelConfigService(prisma);
                     const completedChannelId = await channelConfigService.getCompletedChannelId(guildId);
                     if (completedChannelId) {
                         finishedGamesLink = `<#${completedChannelId}>`;
                     }
                 }

                const successMessage = interpolate(strings.messages.submission.submitSuccessModal, {
                    finishedGamesLink: finishedGamesLink
                });
                await interaction.reply({ content: successMessage, ephemeral: true });
                Logger.info(`TextSubmitModalHandler: Successfully submitted text for turn ${turnId} by player ${player.id}`);
            } else {
                Logger.error(`TextSubmitModalHandler: Failed to submit text for turn ${turnId}. Error: ${serviceResult.error}`);
                await interaction.reply({
                    content: interpolate(strings.messages.submission.submitFailed, { error: serviceResult.error || 'Unknown error', turnId: turnId }),
                    ephemeral: true
                });
            }

        } catch (error) {
            Logger.error(`TextSubmitModalHandler: Error processing text submission for turn ${turnId} by ${discordUserId}:`, error);
            // Avoid replying if already replied (e.g. from deeper error)
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({ content: 'An unexpected error occurred while submitting your story. Please try again.', ephemeral: true });
            } else {
              await interaction.followUp({ content: 'An unexpected error occurred while submitting your story. Please try again.', ephemeral: true });
            }
        }
    }
}
