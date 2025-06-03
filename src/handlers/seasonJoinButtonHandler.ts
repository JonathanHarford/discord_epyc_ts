import { ButtonInteraction, CacheType } from 'discord.js';

import { ButtonHandler } from './buttonHandler.js';
import { interpolate, strings } from '../lang/strings.js';
import prisma from '../lib/prisma.js';
import { GameService } from '../services/GameService.js';
import { Logger } from '../services/index.js';
import { SchedulerService } from '../services/SchedulerService.js';
import { SeasonService } from '../services/SeasonService.js';
import { SeasonTurnService } from '../services/SeasonTurnService.js';

export class SeasonJoinButtonHandler implements ButtonHandler {
    customIdPrefix = 'season_join_';

    public async execute(interaction: ButtonInteraction<CacheType>): Promise<void> {
        // Create service instances
        const schedulerService = new SchedulerService(prisma);
        const gameService = new GameService(prisma, interaction.client);
        const turnService = new SeasonTurnService(prisma, interaction.client, schedulerService);
        const seasonService = new SeasonService(prisma, turnService, schedulerService, gameService);

        const seasonId = interaction.customId.substring(this.customIdPrefix.length);
        const discordUserId = interaction.user.id;
        const discordUserName = interaction.user.username;

        Logger.info(`SeasonJoinButtonHandler: User ${discordUserName} (${discordUserId}) attempting to join season ${seasonId}`);

        if (!seasonId || seasonId.trim().length === 0) { // Basic validation for seasonId
            Logger.warn(`SeasonJoinButtonHandler: Invalid seasonId format from customId: ${interaction.customId}`);
            await interaction.reply({ content: strings.messages.joinSeason.genericErrorNoSeasonId, ephemeral: true });
            return;
        }

        try {
            // 1. Find or create player record (SeasonService might also do this, depends on its design)
            // For robustness, let's ensure player exists.
            let player = await prisma.player.findUnique({ where: { discordUserId } });
            if (!player) {
                try {
                    player = await prisma.player.create({
                        data: { discordUserId, name: discordUserName },
                    });
                    Logger.info(`SeasonJoinButtonHandler: Created new player record for ${discordUserName} (${discordUserId})`);
                } catch (error) {
                    Logger.error(`SeasonJoinButtonHandler: Failed to create player record for ${discordUserName} (${discordUserId}):`, error);
                    await interaction.reply({ content: strings.messages.joinSeason.errorPlayerCreateFailed || 'Could not prepare your player record. Please try again.', ephemeral: true });
                    return;
                }
            }
            const playerId = player.id;

            // 2. Check if season exists and is joinable (using SeasonService)
            const seasonDetails = await seasonService.findSeasonById(seasonId); // Assuming seasonId is string for this method
            if (!seasonDetails) {
                await interaction.reply({ content: interpolate(strings.messages.joinSeason.seasonNotFound, { seasonId }), ephemeral: true });
                return;
            }

            const validJoinStatuses = ['OPEN', 'SETUP']; // Or whatever statuses are considered joinable
            if (!validJoinStatuses.includes(seasonDetails.status)) {
                await interaction.reply({
                    content: interpolate(strings.messages.joinSeason.notOpen, { seasonId, status: seasonDetails.status }),
                    ephemeral: true
                });
                return;
            }

            // 3. Check if player is already in the season (SeasonService might also do this)
            const isPlayerInSeason = await prisma.playersOnSeasons.findUnique({
                where: {
                    playerId_seasonId: {
                        playerId: playerId,
                        seasonId: seasonId, // Use string seasonId as per schema
                    },
                },
            });

            if (isPlayerInSeason) {
                await interaction.reply({ content: interpolate(strings.messages.joinSeason.alreadyJoined, { seasonId }), ephemeral: true });
                return;
            }

            // 4. Add player to season
            const result = await seasonService.addPlayerToSeason(playerId, seasonId); // Pass string seasonId as per service expectation

            if (result.type === 'success') {
                // Use the enhanced messaging system with the specific message key and data returned by the service
                const messageKey = result.key || 'messages.season.joinSuccess';
                let messageText: string;
                
                // Get the appropriate message template based on the key returned by the service
                if (messageKey === 'messages.season.joinSuccessPlayersNeeded') {
                    messageText = strings.messages.season.joinSuccessPlayersNeeded;
                } else if (messageKey === 'messages.season.joinSuccessTimeRemaining') {
                    messageText = strings.messages.season.joinSuccessTimeRemaining;
                } else {
                    messageText = strings.messages.season.joinSuccess;
                }
                
                // Interpolate the message with the rich data from the service
                const enhancedMessage = interpolate(messageText, result.data || {});
                await interaction.reply({ content: enhancedMessage, ephemeral: true });
            } else {
                // Use result.key to provide a more specific error message if available
                let userMessage: string;
                if (result.key) {
                    // You might want to map result.key to more user-friendly strings
                    if (result.key === 'season_full') {
                        userMessage = interpolate(strings.messages.joinSeason.seasonFull, { seasonId });
                    } else if (result.key === 'player_already_in_season') {
                        userMessage = interpolate(strings.messages.joinSeason.alreadyJoined, { seasonId });
                    } else {
                        userMessage = `Failed to join season ${seasonId}: ${result.key}.`;
                    }
                } else {
                    userMessage = interpolate(strings.messages.joinSeason.genericError, { 
                        seasonId, 
                        errorMessage: result.key || 'Unknown error' 
                    });
                }
                await interaction.reply({ content: userMessage, ephemeral: true });
            }

        } catch (error) {
            Logger.error(`SeasonJoinButtonHandler: Error processing join for season ${seasonId} by user ${discordUserId}:`, error);
            await interaction.reply({
                content: interpolate(strings.messages.joinSeason.genericError, { 
                    seasonId, 
                    errorMessage: error instanceof Error ? error.message : 'Unknown error' 
                }),
                ephemeral: true
            });
        }
    }
}
