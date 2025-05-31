import { CacheType, EmbedBuilder, StringSelectMenuInteraction } from 'discord.js';

import { createDashboardComponents } from './seasonDashboardButtonHandler.js';
import { SelectMenuHandler } from './selectMenuHandler.js';
import { strings } from '../lang/strings.js';
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
        const gameService = new GameService(prisma);
        const turnService = new SeasonTurnService(prisma, interaction.client, schedulerService);
        const seasonService = new SeasonService(prisma, turnService, schedulerService, gameService);

        const selectedSeasonId = interaction.values[0];
        const discordUserId = interaction.user.id;
        const discordUserName = interaction.user.username;

        Logger.info(`SeasonSelectMenuHandler: User ${discordUserName} (${discordUserId}) selected season ${selectedSeasonId} via ${interaction.customId}`);

        // Update the original message to acknowledge selection and remove the select menu
        try {
            await interaction.update({
                content: strings.messages.selectSeason.selectionProcessing?.replace('{seasonId}', selectedSeasonId) || `Processing your selection for Season ${selectedSeasonId}...`,
                components: []
            });
        } catch (error) {
            Logger.error(`SeasonSelectMenuHandler: Failed to update original message for ${interaction.customId}:`, error);
            // Non-fatal, proceed with handling the selection
        }

        if (interaction.customId === 'season_select_join') {
            await this.handleJoinSelection(interaction, selectedSeasonId, discordUserId, discordUserName, seasonService);
        } else if (interaction.customId === 'season_select_show') {
            await this.handleShowSelection(interaction, selectedSeasonId, seasonService);
        } else {
            Logger.warn(`SeasonSelectMenuHandler: Unknown customId: ${interaction.customId}`);
            // interaction.update already happened, so we might send a followUp here if needed
            await interaction.followUp({ content: 'Sorry, I can\'t determine what to do with this selection.', ephemeral: true });
        }
    }

    private async handleJoinSelection(interaction: StringSelectMenuInteraction<CacheType>, seasonId: string, discordUserId: string, discordUserName: string, seasonService: SeasonService): Promise<void> {
        Logger.info(`SeasonSelectMenuHandler: Handling JOIN for season ${seasonId} by user ${discordUserId}`);
        try {
            let player = await prisma.player.findUnique({ where: { discordUserId } });
            if (!player) {
                player = await prisma.player.create({ data: { discordUserId, name: discordUserName } });
                Logger.info(`SeasonSelectMenuHandler: Created player record for ${discordUserName} during join selection.`);
            }

            const seasonDetails = await seasonService.findSeasonById(seasonId);
            if (!seasonDetails) {
                await interaction.followUp({ content: strings.messages.joinSeason.seasonNotFound.replace('{seasonId}', seasonId), ephemeral: true });
                return;
            }

            const validJoinStatuses = ['OPEN', 'SETUP'];
            if (!validJoinStatuses.includes(seasonDetails.status)) {
                await interaction.followUp({
                    content: strings.messages.joinSeason.notOpen.replace('{seasonId}', seasonId).replace('{status}', seasonDetails.status),
                    ephemeral: true
                });
                return;
            }

            const isPlayerInSeason = await prisma.playersOnSeasons.findUnique({
                where: { playerId_seasonId: { playerId: player.id, seasonId: seasonId } },
            });
            if (isPlayerInSeason) {
                await interaction.followUp({ content: strings.messages.joinSeason.alreadyJoined.replace('{seasonId}', seasonId), ephemeral: true });
                return;
            }

            const isSeasonFull = seasonDetails.config.maxPlayers ? seasonDetails._count.players >= seasonDetails.config.maxPlayers : false;
            if (isSeasonFull) {
                await interaction.followUp({ content: strings.messages.joinSeason.seasonFull.replace('{seasonId}', seasonId), ephemeral: true });
                return;
            }

            const result = await seasonService.addPlayerToSeason(player.id, seasonId);
            if (result.type === 'success') {
                await interaction.followUp({ content: strings.messages.joinSeason.successButton.replace('{seasonId}', seasonId), ephemeral: true });
            } else {
                let userMessage = strings.messages.joinSeason.genericError.replace('{seasonId}', seasonId);
                 if (result.key) {
                    const keyMap: Record<string, string> = {
                        'season_full': strings.messages.joinSeason.seasonFull,
                        'player_already_in_season': strings.messages.joinSeason.alreadyJoined,
                    };
                    userMessage = keyMap[result.key]?.replace('{seasonId}', seasonId) || `Failed to join season ${seasonId}: ${result.key}.`;
                }
                await interaction.followUp({ content: userMessage, ephemeral: true });
            }
        } catch (error) {
            Logger.error(`SeasonSelectMenuHandler: Error processing join selection for season ${seasonId} by user ${discordUserId}:`, error);
            await interaction.followUp({
                content: strings.messages.joinSeason.genericError.replace('{seasonId}', seasonId).replace('{errorMessage}', (error instanceof Error ? error.message : 'Unknown error')),
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
