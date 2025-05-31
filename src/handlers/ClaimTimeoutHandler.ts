import { PrismaClient } from '@prisma/client';
import { Client as DiscordClient } from 'discord.js';

import { Logger } from '../services/index.js';
import { TurnTimeoutService } from '../services/interfaces/TurnTimeoutService.js';
import { TurnOfferingService } from '../services/TurnOfferingService.js';

/**
 * Handler for claim timeout events.
 * When a player doesn't claim an offered turn within the timeout period,
 * this handler dismisses the offer and attempts to offer the turn to another player.
 */
export class ClaimTimeoutHandler {
    private prisma: PrismaClient;
    private discordClient: DiscordClient;
    private turnService: TurnTimeoutService;
    private turnOfferingService: TurnOfferingService;

    constructor(
        prisma: PrismaClient,
        discordClient: DiscordClient,
        turnService: TurnTimeoutService,
        turnOfferingService: TurnOfferingService
    ) {
        this.prisma = prisma;
        this.discordClient = discordClient;
        this.turnService = turnService;
        this.turnOfferingService = turnOfferingService;
    }

    /**
     * Handles a claim timeout event for a specific turn.
     * 
     * @param turnId - The ID of the turn that timed out
     * @param playerId - The ID of the player who was offered the turn
     * @returns Promise<{ success: boolean; error?: string }>
     */
    async handleClaimTimeout(turnId: string, playerId: string): Promise<{ success: boolean; error?: string }> {
        try {
            Logger.info(`ClaimTimeoutHandler: Processing claim timeout for turn ${turnId}, player ${playerId}`);

            // 1. Verify the turn exists and is still in OFFERED state
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
                const error = `Turn ${turnId} not found during claim timeout handling`;
                Logger.error(`ClaimTimeoutHandler: ${error}`);
                return { success: false, error };
            }

            if (turn.status !== 'OFFERED') {
                // Turn might have been claimed or changed state since timeout was scheduled
                Logger.info(`ClaimTimeoutHandler: Turn ${turnId} is no longer in OFFERED state (current: ${turn.status}). Timeout handling skipped.`);
                return { success: true }; // Not an error, just no action needed
            }

            if (turn.playerId !== playerId) {
                const error = `Turn ${turnId} was offered to ${turn.playerId}, not ${playerId}. Cannot process timeout.`;
                Logger.error(`ClaimTimeoutHandler: ${error}`);
                return { success: false, error };
            }

            // 2. Dismiss the offer using SeasonTurnService
            Logger.info(`ClaimTimeoutHandler: Dismissing offer for turn ${turnId}`);
            const dismissResult = await this.turnService.dismissOffer(turnId);

            if (!dismissResult.success) {
                const error = `Failed to dismiss offer for turn ${turnId}: ${dismissResult.error}`;
                Logger.error(`ClaimTimeoutHandler: ${error}`);
                return { success: false, error };
            }

            Logger.info(`ClaimTimeoutHandler: Successfully dismissed offer for turn ${turnId}`);

            // 3. Trigger the Turn Offering Mechanism to find and offer to another player
            Logger.info(`ClaimTimeoutHandler: Attempting to offer turn ${turnId} to another player`);
            const offerResult = await this.turnOfferingService.offerNextTurn(
                turn.gameId,
                'claim_timeout'
            );

            if (!offerResult.success) {
                // Log warning but don't fail the timeout handling
                // The turn has been successfully dismissed, which is the primary goal
                Logger.warn(`ClaimTimeoutHandler: Failed to offer turn to another player for game ${turn.gameId}: ${offerResult.error}`);
                Logger.warn(`ClaimTimeoutHandler: Turn ${turnId} has been dismissed but no new offer was made`);
            } else {
                Logger.info(`ClaimTimeoutHandler: Successfully offered turn to another player for game ${turn.gameId}`);
            }

            Logger.info(`ClaimTimeoutHandler: Claim timeout handling completed for turn ${turnId}`);
            return { success: true };

        } catch (error) {
            const errorMessage = `Unexpected error in claim timeout handler for turn ${turnId}: ${error instanceof Error ? error.message : String(error)}`;
            Logger.error(`ClaimTimeoutHandler: ${errorMessage}`, error);
            return { success: false, error: errorMessage };
        }
    }
} 