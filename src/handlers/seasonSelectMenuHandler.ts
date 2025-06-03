import { CacheType, EmbedBuilder, StringSelectMenuInteraction } from 'discord.js';

import { createDashboardComponents } from './seasonDashboardButtonHandler.js';
import { SelectMenuHandler } from './selectMenuHandler.js';
import { interpolate, strings } from '../lang/strings.js';
import prisma from '../lib/prisma.js';
import { GameService } from '../services/GameService.js';
import { Logger } from '../services/index.js';
import { SchedulerService } from '../services/SchedulerService.js';
import { SeasonService } from '../services/SeasonService.js';
import { SeasonTurnService } from '../services/SeasonTurnService.js';


export class SeasonSelectMenuHandler implements SelectMenuHandler {
    // We will match exact custom IDs in the Bot model dispatcher for these specific select menus
    // So, customIdPrefix here is more of a conceptual grouping if we had many "season_select_*" menus.
    // For now, it's not strictly used for prefix matching in the dispatcher for this handler.
    customIdPrefix = 'season_select_';

    public async execute(interaction: StringSelectMenuInteraction<CacheType>): Promise<void> {
        // Create service instances
        const schedulerService = new SchedulerService(prisma);
        const gameService = new GameService(prisma, interaction.client);
        const turnService = new SeasonTurnService(prisma, interaction.client, schedulerService);
        const seasonService = new SeasonService(prisma, turnService, schedulerService, gameService);

        const parts = interaction.customId.substring(this.customIdPrefix.length).split('_');
        const action = parts[0]; // e.g., 'join'
        const seasonId = interaction.values[0]; // Selected season ID
        const discordUserId = interaction.user.id;
        const discordUserName = interaction.user.username;

        Logger.info(`SeasonSelectMenuHandler: User ${discordUserName} (${discordUserId}) attempting to ${action} season ${seasonId}`);

        if (action !== 'join') {
            Logger.warn(`SeasonSelectMenuHandler: Unsupported action '${action}' for user ${discordUserId}`);
            await interaction.reply({ content: 'This action is not supported.', ephemeral: true });
            return;
        }

        if (!seasonId || seasonId.trim().length === 0) {
            Logger.warn(`SeasonSelectMenuHandler: Invalid seasonId from selection: ${seasonId}`);
            await interaction.reply({ content: 'Invalid season selection. Please try again.', ephemeral: true });
            return;
        }

        try {
            // 1. Find or create player record
            let player = await prisma.player.findUnique({ where: { discordUserId } });
            if (!player) {
                try {
                    player = await prisma.player.create({
                        data: { discordUserId, name: discordUserName },
                    });
                    Logger.info(`SeasonSelectMenuHandler: Created new player record for ${discordUserName} (${discordUserId})`);
                } catch (error) {
                    Logger.error(`SeasonSelectMenuHandler: Failed to create player record for ${discordUserName} (${discordUserId}):`, error);
                    await interaction.reply({ content: strings.messages.joinSeason.errorPlayerCreateFailed || 'Could not prepare your player record. Please try again.', ephemeral: true });
                    return;
                }
            }
            const playerId = player.id;

            // 2. Check if season exists and is joinable
            const seasonDetails = await seasonService.findSeasonById(seasonId);
            if (!seasonDetails) {
                await interaction.reply({ content: interpolate(strings.messages.joinSeason.seasonNotFound, { seasonId }), ephemeral: true });
                return;
            }

            const validJoinStatuses = ['OPEN', 'SETUP'];
            if (!validJoinStatuses.includes(seasonDetails.status)) {
                await interaction.reply({
                    content: interpolate(strings.messages.joinSeason.notOpen, { seasonId, status: seasonDetails.status }),
                    ephemeral: true
                });
                return;
            }

            // 3. Check if player is already in the season
            const isPlayerInSeason = await prisma.playersOnSeasons.findUnique({
                where: {
                    playerId_seasonId: {
                        playerId: playerId,
                        seasonId: seasonId,
                    },
                },
            });

            if (isPlayerInSeason) {
                await interaction.reply({ content: interpolate(strings.messages.joinSeason.alreadyJoined, { seasonId }), ephemeral: true });
                return;
            }

            // 4. Add player to season
            const result = await seasonService.addPlayerToSeason(playerId, seasonId);

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
                let userMessage = interpolate(strings.messages.joinSeason.genericError, { seasonId });
                if (result.key) {
                    if (result.key === 'season_full') {
                        userMessage = interpolate(strings.messages.joinSeason.seasonFull, { seasonId });
                    } else if (result.key === 'player_already_in_season') {
                        userMessage = interpolate(strings.messages.joinSeason.alreadyJoined, { seasonId });
                    } else {
                        userMessage = `Failed to join season ${seasonId}: ${result.key}.`;
                    }
                }
                await interaction.reply({ content: userMessage, ephemeral: true });
            }

        } catch (error) {
            Logger.error(`SeasonSelectMenuHandler: Error processing ${action} for season ${seasonId} by user ${discordUserId}:`, error);
            await interaction.reply({
                content: interpolate(strings.messages.joinSeason.genericError, { seasonId }),
                ephemeral: true
            });
        }
    }

    private async handleShowSelection(interaction: StringSelectMenuInteraction<CacheType>, seasonId: string, seasonService: SeasonService): Promise<void> {
        Logger.info(`SeasonSelectMenuHandler: Handling SHOW for season ${seasonId} by user ${interaction.user.id}`);
        try {
            const season = await seasonService.findSeasonById(seasonId);
            if (!season) {
                await interaction.followUp({ content: strings.messages.status.seasonNotFound.replace('{seasonId}', seasonId), ephemeral: true });
                return;
            }

            let openUntilText = '';
            if (season.status === 'SETUP' && season.config.openDuration) {
                try {
                    const { parseDuration } = await import('../utils/datetime.js');
                    const duration = parseDuration(season.config.openDuration);
                    if (duration) {
                        const openUntil = new Date(season.createdAt.getTime() + duration.as('milliseconds'));
                        openUntilText = `<t:${Math.floor(openUntil.getTime() / 1000)}:R>`;
                    }
                } catch (e) {
                    Logger.warn(`SeasonSelectMenuHandler: Failed to parse openDuration for show selection of season ${season.id}:`, e);
                    openUntilText = 'Unknown';
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(`Season Details: ${season.id}`)
                .setColor(0x0099FF)
                .addFields(
                    { name: 'Status', value: season.status, inline: true },
                    { name: 'Players', value: `${season._count.players} / ${season.config.maxPlayers || '∞'}`, inline: true }
                );
            if (season.status === 'SETUP' && openUntilText) {
                embed.addFields({ name: 'Open Until', value: openUntilText, inline: true });
            }
            embed.addFields({ name: 'Created', value: `<t:${Math.floor(new Date(season.createdAt).getTime() / 1000)}:D>`, inline: true });

            let rulesDesc = `**Open Duration:** ${season.config.openDuration || 'Default'}\n`;
            rulesDesc += `**Min Players:** ${season.config.minPlayers}\n`;
            rulesDesc += `**Max Players:** ${season.config.maxPlayers || 'Unlimited'}\n`;
            rulesDesc += `**Turn Pattern:** ${season.config.turnPattern || 'Default'}\n`;
            rulesDesc += `**Claim Timeout:** ${season.config.claimTimeout || 'Default'}\n`;
            rulesDesc += `**Writing Timeout:** ${season.config.writingTimeout || 'Default'}\n`;
            rulesDesc += `**Drawing Timeout:** ${season.config.drawingTimeout || 'Default'}`;
            embed.addFields({ name: '📜 Rules & Configuration', value: rulesDesc });

            const seasonPlayers = await prisma.playersOnSeasons.findMany({
                where: { seasonId: season.id }, take: 10, include: { player: {select: {name: true}}}
            });
            if (seasonPlayers.length > 0) {
                const playerList = seasonPlayers.map(sp => `• ${sp.player.name}`).join('\n');
                embed.addFields({ name: `Players (${seasonPlayers.length}${season._count.players > seasonPlayers.length ? ` of ${season._count.players}` : ''})`, value: playerList });
            } else {
                embed.addFields({ name: 'Players', value: 'No players have joined yet.' });
            }

            const dashboardComponents = await createDashboardComponents(season.id, interaction.user, prisma);
            await interaction.followUp({ embeds: [embed], components: dashboardComponents, ephemeral: true });

        } catch (error) {
            Logger.error(`SeasonSelectMenuHandler: Error processing show selection for season ${seasonId} by user ${interaction.user.id}:`, error);
            await interaction.followUp({
                content: strings.messages.status.genericError.replace('{seasonId}', seasonId).replace('{errorMessage}', (error instanceof Error ? error.message : 'Unknown error')),
                ephemeral: true
            });
        }
    }
}
