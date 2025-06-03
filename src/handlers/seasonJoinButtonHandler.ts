import { ButtonInteraction, CacheType } from 'discord.js';

import { ButtonHandler } from './buttonHandler.js';
import { strings } from '../lang/strings.js';
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
                await interaction.reply({ content: strings.messages.joinSeason.seasonNotFound.replace('{seasonId}', seasonId), ephemeral: true });
                return;
            }

            const validJoinStatuses = ['OPEN', 'SETUP']; // Or whatever statuses are considered joinable
            if (!validJoinStatuses.includes(seasonDetails.status)) {
                await interaction.reply({
                    content: strings.messages.joinSeason.notOpen.replace('{seasonId}', seasonId).replace('{status}', seasonDetails.status),
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
                await interaction.reply({ content: strings.messages.joinSeason.alreadyJoined.replace('{seasonId}', seasonId), ephemeral: true });
                return;
            }

            // 4. Add player to season
            const result = await seasonService.addPlayerToSeason(playerId, seasonId); // Pass string seasonId as per service expectation

            if (result.type === 'success') {
                await interaction.reply({ content: strings.messages.joinSeason.successButton.replace('{seasonId}', seasonId), ephemeral: true });
            } else {
                // Use result.key to provide a more specific error message if available
                let userMessage = strings.messages.joinSeason.genericError.replace('{seasonId}', seasonId);
                if (result.key) {
                    // You might want to map result.key to more user-friendly strings
                    userMessage = `Failed to join season ${seasonId}: ${result.key}.`;
                     if (result.key === 'season_full') {
                        userMessage = strings.messages.joinSeason.seasonFull.replace('{seasonId}', seasonId);
                    } else if (result.key === 'player_already_in_season') {
                         userMessage = strings.messages.joinSeason.alreadyJoined.replace('{seasonId}', seasonId);
                    }
                }
                await interaction.reply({ content: userMessage, ephemeral: true });
            }

        } catch (error) {
            Logger.error(`SeasonJoinButtonHandler: Error processing join for season ${seasonId} by user ${discordUserId}:`, error);
            await interaction.reply({
                content: strings.messages.joinSeason.genericError.replace('{seasonId}', seasonId),
                ephemeral: true
            });
        }
    }
}
