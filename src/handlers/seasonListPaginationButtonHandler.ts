import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType } from 'discord.js';

import { ButtonHandler } from './buttonHandler.js';
import prisma from '../lib/prisma.js';
import { Logger } from '../services/index.js';

export class SeasonListPaginationButtonHandler implements ButtonHandler {
    customIdPrefix = 'season_list_';

    public async execute(interaction: ButtonInteraction<CacheType>): Promise<void> {
        const customIdParts = interaction.customId.split('_');
        
        // Expected format: season_list_{action}_{currentPage}_{userId}
        if (customIdParts.length !== 5) {
            Logger.warn(`SeasonListPaginationButtonHandler: Invalid customId format: ${interaction.customId}`);
            await interaction.reply({ content: 'Invalid pagination action.', ephemeral: true });
            return;
        }

        const action = customIdParts[2]; // 'prev' or 'next'
        const currentPage = parseInt(customIdParts[3]);
        const originalUserId = customIdParts[4];

        // Only allow the original user to navigate
        if (interaction.user.id !== originalUserId) {
            await interaction.reply({ content: 'You can only navigate your own season list.', ephemeral: true });
            return;
        }

        if (action !== 'prev' && action !== 'next') {
            Logger.warn(`SeasonListPaginationButtonHandler: Invalid action: ${action}`);
            await interaction.reply({ content: 'Invalid pagination action.', ephemeral: true });
            return;
        }

        try {
            await interaction.deferUpdate();

            // Calculate new page
            let newPage = currentPage;
            if (action === 'prev') {
                newPage = Math.max(0, currentPage - 1);
            } else if (action === 'next') {
                newPage = currentPage + 1;
            }

            // Re-fetch and rebuild the season list for the new page
            await this.updateSeasonListPage(interaction, newPage);

        } catch (error) {
            Logger.error(`SeasonListPaginationButtonHandler: Error handling pagination:`, error);
            if (interaction.deferred) {
                await interaction.editReply({ content: 'An error occurred while updating the page.' }).catch(e => 
                    Logger.error('SeasonListPaginationButtonHandler: Failed to edit reply on error', e)
                );
            } else {
                await interaction.reply({ content: 'An error occurred while updating the page.', ephemeral: true }).catch(e => 
                    Logger.error('SeasonListPaginationButtonHandler: Failed to reply on error', e)
                );
            }
        }
    }

    private async updateSeasonListPage(interaction: ButtonInteraction<CacheType>, newPage: number): Promise<void> {
        const discordUserId = interaction.user.id;
        
        // Get player info
        let player = await prisma.player.findUnique({ where: { discordUserId } });
        if (!player) {
            try {
                player = await prisma.player.create({data: {discordUserId, name: interaction.user.username}});
                Logger.info(`Created player record for ${interaction.user.tag} during season list pagination.`);
            } catch (e) {
                Logger.error(`Failed to create player record for ${interaction.user.tag} during season list pagination:`, e);
            }
        }
        const playerId = player?.id;

        // Fetch seasons (same logic as in season command)
        const seasons = await prisma.season.findMany({
            include: {
                config: true,
                _count: { select: { players: true } },
                players: playerId ? { where: { playerId } } : false,
                creator: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' },
        });

        const visibleSeasons = seasons.filter(s => s.status !== 'TERMINATED');

        if (visibleSeasons.length === 0) {
            await interaction.editReply({ content: 'No active seasons found.', components: [] });
            return;
        }

        // Categorize seasons (same logic as in season command)
        const joinableSeasons = visibleSeasons.filter(s => {
            const isUserInSeason = playerId ? s.players.some(p => p.playerId === playerId) : false;
            const isSeasonFull = s.config.maxPlayers ? s._count.players >= s.config.maxPlayers : false;
            return (s.status === 'OPEN' || s.status === 'SETUP') && !isUserInSeason && !isSeasonFull;
        });

        const joinedSeasons = visibleSeasons.filter(s => {
            const isUserInSeason = playerId ? s.players.some(p => p.playerId === playerId) : false;
            return isUserInSeason;
        });

        const otherSeasons = visibleSeasons.filter(s => {
            const isUserInSeason = playerId ? s.players.some(p => p.playerId === playerId) : false;
            const isSeasonFull = s.config.maxPlayers ? s._count.players >= s.config.maxPlayers : false;
            const isJoinable = (s.status === 'OPEN' || s.status === 'SETUP') && !isUserInSeason && !isSeasonFull;
            return !isUserInSeason && !isJoinable;
        });

        // Format seasons with buttons (same logic as in season command)
        const formatSeasonWithButtons = (s: any): { content: string, components: ActionRowBuilder<ButtonBuilder>[] } => {
            const createdDate = new Date(s.createdAt).toISOString().split('T')[0];
            const creatorName = s.creator?.name || 'Unknown';
            const playerCount = s._count.players;
            const maxPlayers = s.config.maxPlayers || '∞';
            const seasonLine = `**${s.id}** - @${creatorName} ${createdDate} (${playerCount}/${maxPlayers})`;

            const buttons: ButtonBuilder[] = [];
            
            // Always add Show button
            const showButton = new ButtonBuilder()
                .setCustomId(`season_show_${s.id}`)
                .setLabel('Show Details')
                .setStyle(ButtonStyle.Secondary);
            buttons.push(showButton);

            // Conditionally add Join button
            const isUserInSeason = playerId ? s.players.some(p => p.playerId === playerId) : false;
            const isSeasonFull = s.config.maxPlayers ? s._count.players >= s.config.maxPlayers : false;
            const canJoin = (s.status === 'OPEN' || s.status === 'SETUP') && !isUserInSeason && !isSeasonFull;
            
            if (canJoin) {
                const joinButton = new ButtonBuilder()
                    .setCustomId(`season_join_${s.id}`)
                    .setLabel('Join Season')
                    .setStyle(ButtonStyle.Primary);
                buttons.push(joinButton);
            } else if (isUserInSeason) {
                const joinedButton = new ButtonBuilder()
                    .setCustomId(`season_joined_${s.id}`)
                    .setLabel('Already Joined')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true);
                buttons.push(joinedButton);
            }

            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
            
            return {
                content: seasonLine,
                components: [actionRow]
            };
        };

        // Build season entries
        const seasonEntries: { content: string, components: ActionRowBuilder<ButtonBuilder>[] }[] = [];
        let message = '';

        if (joinableSeasons.length > 0) {
            message += `**You can join:**\n`;
            joinableSeasons.forEach(season => {
                const entry = formatSeasonWithButtons(season);
                seasonEntries.push(entry);
            });
            message += '\n';
        }

        if (joinedSeasons.length > 0) {
            message += `**You've joined:**\n`;
            joinedSeasons.forEach(season => {
                const entry = formatSeasonWithButtons(season);
                seasonEntries.push(entry);
            });
            message += '\n';
        }

        if (otherSeasons.length > 0) {
            message += `**Other seasons:**\n`;
            otherSeasons.forEach(season => {
                const entry = formatSeasonWithButtons(season);
                seasonEntries.push(entry);
            });
        }

        if (seasonEntries.length === 0) {
            await interaction.editReply({ content: 'No seasons found. Use `/season new` to start a new season!', components: [] });
            return;
        }

        // Pagination logic
        const maxSeasonsPerPage = 4;
        const totalPages = Math.ceil(seasonEntries.length / maxSeasonsPerPage);
        const currentPage = Math.min(newPage, totalPages - 1); // Ensure we don't go beyond last page
        const startIndex = currentPage * maxSeasonsPerPage;
        const endIndex = Math.min(startIndex + maxSeasonsPerPage, seasonEntries.length);
        
        const currentPageSeasons = seasonEntries.slice(startIndex, endIndex);
        const seasonComponents = currentPageSeasons.flatMap(entry => entry.components);
        
        // Create navigation buttons
        const navigationRow = new ActionRowBuilder<ButtonBuilder>();
        
        const prevButton = new ButtonBuilder()
            .setCustomId(`season_list_prev_${currentPage}_${interaction.user.id}`)
            .setLabel('◀ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0);
        
        const pageButton = new ButtonBuilder()
            .setCustomId(`season_list_page_info_${currentPage}_${interaction.user.id}`)
            .setLabel(`Page ${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);
        
        const nextButton = new ButtonBuilder()
            .setCustomId(`season_list_next_${currentPage}_${interaction.user.id}`)
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages - 1);
        
        navigationRow.addComponents(prevButton, pageButton, nextButton);
        
        let fullContent = message + currentPageSeasons.map(entry => entry.content).join('\n');
        fullContent += `\n\n*Showing ${startIndex + 1}-${endIndex} of ${seasonEntries.length} seasons*`;
        
        const allComponents = [...seasonComponents, navigationRow];
        await interaction.editReply({ content: fullContent, components: allComponents });
    }
} 