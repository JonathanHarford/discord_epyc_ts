import { PrismaClient } from '@prisma/client';
import { Client as DiscordClient } from 'discord.js';
import { Logger } from '../services/index.js';
import { TurnService } from '../services/TurnService.js';
import { TurnOfferingService } from '../services/TurnOfferingService.js';
import { strings, interpolate } from '../lang/strings.js';

/**
 * Handler for submission timeout events.
 * When a player doesn't submit their turn within the timeout period,
 * this handler skips the turn and attempts to offer the turn to another player.
 */
export class SubmissionTimeoutHandler {
    private prisma: PrismaClient;
    private discordClient: DiscordClient;
    private turnService: TurnService;
    private turnOfferingService: TurnOfferingService;

    constructor(
        prisma: PrismaClient,
        discordClient: DiscordClient,
        turnService: TurnService,
        turnOfferingService: TurnOfferingService
    ) {
        this.prisma = prisma;
        this.discordClient = discordClient;
        this.turnService = turnService;
        this.turnOfferingService = turnOfferingService;
    }

    /**
     * Handles a submission timeout event for a specific turn.
     * 
     * @param turnId - The ID of the turn that timed out
     * @param playerId - The ID of the player who was supposed to submit the turn
     * @returns Promise<{ success: boolean; error?: string }>
     */
    async handleSubmissionTimeout(turnId: string, playerId: string): Promise<{ success: boolean; error?: string }> {
        try {
            Logger.info(`SubmissionTimeoutHandler: Processing submission timeout for turn ${turnId}, player ${playerId}`);

            // 1. Verify the turn exists and is still in PENDING state
            const turn = await this.prisma.turn.findUnique({
                where: { id: turnId },
                include: { 
                    game: {
                        include: {
                            season: true
                        }
                    },
                    player: true 
                }
            });

            if (!turn) {
                const error = `Turn ${turnId} not found during submission timeout handling`;
                Logger.error(`SubmissionTimeoutHandler: ${error}`);
                return { success: false, error };
            }

            if (turn.status !== 'PENDING') {
                // Turn might have been submitted or changed state since timeout was scheduled
                Logger.info(`SubmissionTimeoutHandler: Turn ${turnId} is no longer in PENDING state (current: ${turn.status}). Timeout handling skipped.`);
                return { success: true }; // Not an error, just no action needed
            }

            if (turn.playerId !== playerId) {
                const error = `Turn ${turnId} was assigned to ${turn.playerId}, not ${playerId}. Cannot process timeout.`;
                Logger.error(`SubmissionTimeoutHandler: ${error}`);
                return { success: false, error };
            }

            // 2. Skip the turn using TurnService
            Logger.info(`SubmissionTimeoutHandler: Skipping turn ${turnId} due to submission timeout`);
            const skipResult = await this.turnService.skipTurn(turnId);

            if (!skipResult.success) {
                const error = `Failed to skip turn ${turnId}: ${skipResult.error}`;
                Logger.error(`SubmissionTimeoutHandler: ${error}`);
                return { success: false, error };
            }

            Logger.info(`SubmissionTimeoutHandler: Successfully skipped turn ${turnId}`);

            // 3. Send DM notification to the player informing them they were skipped
            const dmResult = await this.sendSkippedNotificationDM(turn.player!, turn);

            if (!dmResult) {
                Logger.warn(`SubmissionTimeoutHandler: Failed to send skip notification DM to player ${playerId}, but turn was skipped successfully`);
                // Don't fail the timeout handling if DM fails
            }

            // 4. Trigger the Turn Offering Mechanism to find and offer the turn to another player
            Logger.info(`SubmissionTimeoutHandler: Attempting to offer next turn for game ${turn.gameId} after skip`);
            const offerResult = await this.turnOfferingService.offerNextTurn(
                turn.gameId,
                'turn_skipped'
            );

            if (!offerResult.success) {
                // Log warning but don't fail the timeout handling
                // The turn has been successfully skipped, which is the primary goal
                Logger.warn(`SubmissionTimeoutHandler: Failed to offer next turn for game ${turn.gameId}: ${offerResult.error}`);
                Logger.warn(`SubmissionTimeoutHandler: Turn ${turnId} has been skipped but no new offer was made`);
            } else {
                Logger.info(`SubmissionTimeoutHandler: Successfully offered next turn to another player for game ${turn.gameId}`);
            }

            Logger.info(`SubmissionTimeoutHandler: Submission timeout handling completed for turn ${turnId}`);
            return { success: true };

        } catch (error) {
            const errorMessage = `Unexpected error in submission timeout handler for turn ${turnId}: ${error instanceof Error ? error.message : String(error)}`;
            Logger.error(`SubmissionTimeoutHandler: ${errorMessage}`, error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Sends a DM notification to a player informing them their turn was skipped due to timeout.
     * 
     * @param player - The player to send the DM to
     * @param turn - The turn that was skipped
     * @returns Promise<boolean> - True if DM was sent successfully
     */
    private async sendSkippedNotificationDM(
        player: any, // Player type from Prisma
        turn: any    // Turn type from Prisma with game/season included
    ): Promise<boolean> {
        try {
            // Get the user from Discord and send DM directly
            const user = await this.discordClient.users.fetch(player.discordUserId);
            const message = interpolate(strings.messages.turnTimeout.submissionTimeoutSkipped, {
                gameId: turn.gameId,
                seasonId: turn.game?.season?.id,
                turnNumber: turn.turnNumber,
                turnType: turn.type,
                playerName: player.name
            });

            await user.send(message);
            Logger.info(`SubmissionTimeoutHandler: Successfully sent skip notification DM to player ${player.id} (${player.discordUserId})`);
            return true;

        } catch (error) {
            Logger.error(`SubmissionTimeoutHandler: Error sending skip notification DM to player ${player.id}:`, error);
            return false;
        }
    }
} 