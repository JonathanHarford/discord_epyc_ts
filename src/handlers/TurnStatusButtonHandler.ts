import { ButtonInteraction, CacheType, EmbedBuilder } from 'discord.js';

import { ButtonHandler } from './buttonHandler.js';
import { strings } from '../lang/strings.js';
import prisma from '../lib/prisma.js';
import { Logger } from '../services/index.js';
import { FormatUtils } from '../utils/format-utils.js';
import { getSeasonTimeouts } from '../utils/seasonConfig.js';

export class TurnStatusButtonHandler implements ButtonHandler {
    customIdPrefix = 'turn_status_';

    public async execute(interaction: ButtonInteraction<CacheType>): Promise<void> {
        const turnId = interaction.customId.substring(this.customIdPrefix.length);
        const discordUserId = interaction.user.id;

        Logger.info(`TurnStatusButtonHandler: User ${interaction.user.username} (${discordUserId}) requesting status for turn ${turnId}`);

        if (!turnId || turnId.trim().length === 0) {
            Logger.warn(`TurnStatusButtonHandler: Invalid turnId format from customId: ${interaction.customId}`);
            await interaction.reply({ 
                content: 'Invalid turn reference. Please try again or contact support.', 
                ephemeral: true 
            });
            return;
        }

        try {
            // Find the player record
            const player = await prisma.player.findUnique({ 
                where: { discordUserId } 
            });

            if (!player) {
                Logger.warn(`TurnStatusButtonHandler: Player not found for Discord user ${discordUserId}`);
                await interaction.reply({ 
                    content: strings.messages.ready.playerNotFound, 
                    ephemeral: true 
                });
                return;
            }

            // Get the turn with game information
            const turn = await prisma.turn.findUnique({
                where: { id: turnId },
                include: {
                    game: {
                        include: {
                            season: true
                        }
                    }
                }
            });

            if (!turn) {
                Logger.warn(`TurnStatusButtonHandler: Turn ${turnId} not found`);
                await interaction.reply({ 
                    content: 'Turn not found. Please try again or contact support.', 
                    ephemeral: true 
                });
                return;
            }

            // Verify the turn belongs to this player
            if (turn.playerId !== player.id) {
                Logger.warn(`TurnStatusButtonHandler: Turn ${turnId} does not belong to player ${player.id}`);
                await interaction.reply({ 
                    content: 'This turn does not belong to you.', 
                    ephemeral: true 
                });
                return;
            }

            // Get timeout information
            const timeouts = await getSeasonTimeouts(prisma, turnId);
            
            // Calculate relevant timeout dates
            let timeoutInfo = '';
            if (turn.status === 'OFFERED') {
                const claimTimeoutDate = new Date(turn.updatedAt.getTime() + timeouts.claimTimeoutMinutes * 60 * 1000);
                timeoutInfo = `**Claim Timeout:** ${FormatUtils.formatRemainingTime(claimTimeoutDate)}`;
            } else if (turn.status === 'PENDING') {
                const submissionTimeoutMinutes = turn.type === 'WRITING' 
                    ? timeouts.writingTimeoutMinutes 
                    : timeouts.drawingTimeoutMinutes;
                const submissionTimeoutDate = new Date(turn.updatedAt.getTime() + submissionTimeoutMinutes * 60 * 1000);
                timeoutInfo = `**Submission Timeout:** ${FormatUtils.formatRemainingTime(submissionTimeoutDate)}`;
            }

            // Get previous turn for context (if applicable)
            let previousTurnInfo = '';
            if (turn.turnNumber > 1) {
                const previousTurn = await prisma.turn.findFirst({
                    where: {
                        gameId: turn.gameId,
                        turnNumber: turn.turnNumber - 1,
                        status: 'COMPLETED'
                    }
                });

                if (previousTurn) {
                    if (turn.type === 'WRITING' && previousTurn.imageUrl) {
                        previousTurnInfo = `**Previous Turn (Image):** [View Image](${previousTurn.imageUrl})`;
                    } else if (turn.type === 'DRAWING' && previousTurn.textContent) {
                        previousTurnInfo = `**Previous Turn (Text):** ${previousTurn.textContent.substring(0, 100)}${previousTurn.textContent.length > 100 ? '...' : ''}`;
                    }
                }
            }

            // Create status embed
            const embed = new EmbedBuilder()
                .setTitle(`Turn Status - ${turn.type} Turn`)
                .setColor(turn.status === 'PENDING' ? 0xFFAA00 : turn.status === 'COMPLETED' ? 0x00AA00 : 0x0099FF)
                .addFields(
                    { name: 'Turn Number', value: turn.turnNumber.toString(), inline: true },
                    { name: 'Status', value: turn.status, inline: true },
                    { name: 'Type', value: turn.type, inline: true },
                    { name: 'Game ID', value: turn.gameId, inline: true },
                    { name: 'Season', value: turn.game?.season?.id || 'Unknown', inline: true },
                    { name: 'Last Updated', value: `<t:${Math.floor(turn.updatedAt.getTime() / 1000)}:R>`, inline: true }
                );

            if (timeoutInfo) {
                embed.addFields({ name: 'Timeout Information', value: timeoutInfo, inline: false });
            }

            if (previousTurnInfo) {
                embed.addFields({ name: 'Context', value: previousTurnInfo, inline: false });
            }

            if (turn.status === 'COMPLETED' && turn.textContent) {
                embed.addFields({ name: 'Your Submission', value: turn.textContent.substring(0, 1000), inline: false });
            } else if (turn.status === 'COMPLETED' && turn.imageUrl) {
                embed.setImage(turn.imageUrl);
                embed.addFields({ name: 'Your Submission', value: '[Image submitted]', inline: false });
            }

            await interaction.reply({ 
                embeds: [embed], 
                ephemeral: true 
            });

            Logger.info(`TurnStatusButtonHandler: Provided status information for turn ${turnId} to player ${player.id}`);

        } catch (error) {
            Logger.error(`TurnStatusButtonHandler: Error getting turn status for turn ${turnId} by user ${discordUserId}:`, error);
            await interaction.reply({
                content: 'An error occurred while retrieving turn status. Please try again or contact support.',
                ephemeral: true
            });
        }
    }
} 