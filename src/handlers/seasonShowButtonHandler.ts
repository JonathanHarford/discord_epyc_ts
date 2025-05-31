import { ButtonInteraction, CacheType, EmbedBuilder } from 'discord.js';
import { ButtonHandler } from './buttonHandler.js';
import { SeasonService } from '../services/SeasonService.js';
import { Logger } from '../services/index.js';
import { strings } from '../lang/strings.js';
import prisma from '../lib/prisma.js'; // Direct prisma import

import { createDashboardComponents } from './seasonDashboardButtonHandler.js'; // Import the helper

// Assuming SeasonService can be instantiated like this.
// Adjust if a DI pattern or singleton access is used elsewhere.
const seasonService = new SeasonService(prisma);

export class SeasonShowButtonHandler implements ButtonHandler {
    customIdPrefix = 'season_show_';

    public async execute(interaction: ButtonInteraction<CacheType>): Promise<void> {
        const seasonId = interaction.customId.substring(this.customIdPrefix.length);
        Logger.info(`SeasonShowButtonHandler: User ${interaction.user.tag} (${interaction.user.id}) showing details for season ${seasonId}`);

        if (!seasonId) {
            Logger.warn(`SeasonShowButtonHandler: Invalid seasonId extracted from customId: ${interaction.customId}`);
            await interaction.reply({ content: 'Could not determine which season to show.', ephemeral: true });
            return;
        }

        try {
            const season = await seasonService.findSeasonById(seasonId); // Includes config and _count.players

            if (!season) {
                await interaction.reply({ content: strings.messages.status.seasonNotFound.replace('{seasonId}', seasonId), ephemeral: true });
                return;
            }

            let openUntilText = '';
            if (season.status === 'SETUP' && season.config.openDuration) {
                try {
                    const { parseDuration } = await import('../utils/datetime.js'); // Adjusted path
                    const duration = parseDuration(season.config.openDuration);
                    if (duration) {
                        const openUntil = new Date(season.createdAt.getTime() + duration.as('milliseconds'));
                        openUntilText = `<t:${Math.floor(openUntil.getTime() / 1000)}:R>`; // Relative timestamp
                    }
                } catch (error) {
                    Logger.warn(`SeasonShowButtonHandler: Failed to parse openDuration for season ${season.id}:`, error);
                    openUntilText = 'Unknown';
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(`Season Details: ${season.id}`)
                .setColor(0x0099FF) // Blue
                .addFields(
                    { name: 'Status', value: season.status, inline: true },
                    { name: 'Players', value: `${season._count.players} / ${season.config.maxPlayers || '∞'}`, inline: true }
                );

            if (season.status === 'SETUP' && openUntilText) {
                embed.addFields({ name: 'Open Until', value: openUntilText, inline: true });
            }
            embed.addFields({ name: 'Created', value: `<t:${Math.floor(new Date(season.createdAt).getTime() / 1000)}:D>`, inline: true });

            let rulesDescription = '';
            rulesDescription += `**Open Duration:** ${season.config.openDuration || 'Default'}\n`;
            rulesDescription += `**Min Players:** ${season.config.minPlayers}\n`;
            rulesDescription += `**Max Players:** ${season.config.maxPlayers || 'Unlimited'}\n`;
            rulesDescription += `**Turn Pattern:** ${season.config.turnPattern || 'Default'}\n`;
            rulesDescription += `**Claim Timeout:** ${season.config.claimTimeout || 'Default'}\n`;
            rulesDescription += `**Writing Timeout:** ${season.config.writingTimeout || 'Default'}\n`;
            rulesDescription += `**Drawing Timeout:** ${season.config.drawingTimeout || 'Default'}`;

            embed.addFields({ name: '📜 Rules & Configuration', value: rulesDescription });

            const seasonPlayers = await prisma.seasonPlayer.findMany({
                where: { seasonId: season.id },
                take: 25, // Show up to 25 players
                include: { player: { select: { name: true } } }
            });

            if (seasonPlayers.length > 0) {
                const playerList = seasonPlayers.map(sp => `• ${sp.player.name}`).join('\n');
                embed.addFields({
                    name: `Players (${seasonPlayers.length}${season._count.players > seasonPlayers.length ? ` of ${season._count.players}` : ''})`,
                    value: playerList.substring(0, 1020) // Max field value length is 1024
                });
            } else {
                embed.addFields({ name: 'Players', value: 'No players have joined yet.' });
            }

            const dashboardComponents = await createDashboardComponents(season.id, interaction.user, prisma);
            await interaction.reply({ embeds: [embed], components: dashboardComponents, ephemeral: true });

        } catch (error) {
            Logger.error(`SeasonShowButtonHandler: Error showing details for season ${seasonId}:`, error);
            const errorMessage = strings.messages.status.genericError.replace('{seasonId}', seasonId).replace('{errorMessage}', (error instanceof Error ? error.message : 'Unknown error'));
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true }).catch(e => Logger.error("SeasonShowButtonHandler: Failed to followUp on error",e));
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true }).catch(e => Logger.error("SeasonShowButtonHandler: Failed to reply on error",e));
            }
        }
    }
}
