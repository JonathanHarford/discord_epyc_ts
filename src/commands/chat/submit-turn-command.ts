import { ChatInputCommandInteraction, PermissionsString } from 'discord.js';

import { interpolate, strings } from '../../lang/strings.js';
import prisma from '../../lib/prisma.js';
import { EventData } from '../../models/internal-models.js';
import { Logger } from '../../services/index.js';
import { PlayerService } from '../../services/PlayerService.js';
import { SeasonTurnService } from '../../services/SeasonTurnService.js';
import { Command, CommandDeferType } from '../command.js';

export class SubmitTurnCommand implements Command {
    public names = ['submit-turn'];
    public deferType = CommandDeferType.HIDDEN; // Use ephemeral responses
    public requireClientPerms: PermissionsString[] = [];

    public async execute(interaction: ChatInputCommandInteraction, _data: EventData): Promise<void> {
        const discordUserId = interaction.user.id;
        const attachment = interaction.options.getAttachment('image', true);
        const providedTurnId = interaction.options.getString('turn-id', false);

        Logger.info(`SubmitTurnCommand: User ${interaction.user.username} (${discordUserId}) attempting to submit turn with image attachment`);

        try {
            // Find the player record
            const playerService = new PlayerService(prisma);
            const player = await playerService.getPlayerByDiscordId(discordUserId);

            if (!player) {
                Logger.warn(`SubmitTurnCommand: Player not found for Discord user ${discordUserId}`);
                await interaction.reply({ 
                    content: strings.messages.ready.playerNotFound, 
                    ephemeral: true 
                });
                return;
            }

            // Get pending turns for this player
            const turnService = new SeasonTurnService(prisma, interaction.client);
            const pendingTurns = await turnService.getTurnsForPlayer(player.id, 'PENDING');

            if (pendingTurns.length === 0) {
                await interaction.reply({
                    content: interpolate(strings.messages.submission.noPendingTurns, { playerName: player.name }),
                    ephemeral: true
                });
                return;
            }

            // Determine which turn to submit
            let turnToSubmit;
            if (providedTurnId) {
                // Use the provided turn ID if specified
                turnToSubmit = pendingTurns.find(turn => turn.id === providedTurnId);
                if (!turnToSubmit) {
                    await interaction.reply({
                        content: `Turn with ID "${providedTurnId}" not found among your pending turns.`,
                        ephemeral: true
                    });
                    return;
                }
            } else {
                // Auto-detect: use the first (oldest) pending turn
                turnToSubmit = pendingTurns[0];
            }

            // Verify this is a drawing turn (image submissions are for drawing turns)
            if (turnToSubmit.type !== 'DRAWING') {
                await interaction.reply({
                    content: `Turn #${turnToSubmit.turnNumber} is a ${turnToSubmit.type} turn. Image submissions are only for DRAWING turns. Please use the "Submit Turn" button for writing turns.`,
                    ephemeral: true
                });
                return;
            }

            // Validate the attachment is an image
            if (!attachment.contentType?.startsWith('image/')) {
                await interaction.reply({
                    content: 'Please upload an image file (PNG, JPG, GIF, etc.) for your drawing turn.',
                    ephemeral: true
                });
                return;
            }

            // Check file size (Discord has limits, but we can add our own)
            const maxSizeBytes = 8 * 1024 * 1024; // 8MB limit
            if (attachment.size > maxSizeBytes) {
                await interaction.reply({
                    content: 'Image file is too large. Please upload an image smaller than 8MB.',
                    ephemeral: true
                });
                return;
            }

            // Submit the turn using the attachment URL
            const submissionResult = await turnService.submitTurn(
                turnToSubmit.id, 
                player.id, 
                attachment.url, // Use the Discord CDN URL
                'image' // Content type for image submissions
            );

            if (submissionResult.success) {
                await interaction.reply({
                    content: `✅ **Turn submitted successfully!**\n\nYour drawing for Turn #${turnToSubmit.turnNumber} has been submitted.\n\n🖼️ **Image:** ${attachment.name}\n📏 **Size:** ${(attachment.size / 1024).toFixed(1)} KB`,
                    ephemeral: true
                });

                Logger.info(`SubmitTurnCommand: Successfully submitted turn ${turnToSubmit.id} for player ${player.id} with image attachment`);
            } else {
                const errorMessage = submissionResult.error || 'Unknown error occurred';
                await interaction.reply({
                    content: `❌ **Failed to submit turn:** ${errorMessage}`,
                    ephemeral: true
                });

                Logger.warn(`SubmitTurnCommand: Failed to submit turn ${turnToSubmit.id} for player ${player.id}: ${errorMessage}`);
            }

        } catch (error) {
            Logger.error(`SubmitTurnCommand: Error processing turn submission by user ${discordUserId}:`, error);
            await interaction.reply({
                content: 'An error occurred while submitting your turn. Please try again or contact support.',
                ephemeral: true
            });
        }
    }
} 