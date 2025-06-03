import type { SelectNextPlayerInput } from '../game/types.js';
import { Player, PrismaClient, Turn } from '@prisma/client';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client as DiscordClient } from 'discord.js';

import { Logger } from './logger.js';
import { SchedulerService } from './SchedulerService.js';
import { SeasonTurnService } from './SeasonTurnService.js';
import { selectNextPlayerPure } from '../game/pureGameLogic.js';
import { interpolate, strings } from '../lang/strings.js';
import { FormatUtils } from '../utils/format-utils.js';
import { getSeasonTimeouts } from '../utils/seasonConfig.js';
import { ServerContextService } from '../utils/server-context.js';

export interface TurnOfferingResult {
    success: boolean;
    turn?: Turn;
    player?: Player;
    error?: string;
}

/**
 * Service responsible for managing the turn offering mechanism.
 * This service handles the process of finding the next player and offering them a turn.
 */
export class TurnOfferingService {
    private prisma: PrismaClient;
    private discordClient: DiscordClient;
    private turnService: SeasonTurnService;
    private schedulerService: SchedulerService;
    private serverContextService: ServerContextService;

    constructor(
        prisma: PrismaClient,
        discordClient: DiscordClient,
        turnService: SeasonTurnService,
        schedulerService: SchedulerService
    ) {
        this.prisma = prisma;
        this.discordClient = discordClient;
        this.turnService = turnService;
        this.schedulerService = schedulerService;
        this.serverContextService = new ServerContextService(prisma, discordClient);
    }

    /**
     * Offers the next available turn in a game to the appropriate player.
     * This is the main entry point for the turn offering mechanism.
     * 
     * @param gameId - The ID of the game to offer a turn for
     * @param triggerReason - The reason this offering was triggered (for logging)
     * @returns Promise<TurnOfferingResult> - The result of the offering process
     */
    async offerNextTurn(
        gameId: string,
        triggerReason: 'turn_completed' | 'turn_skipped' | 'season_activated' | 'claim_timeout' = 'turn_completed'
    ): Promise<TurnOfferingResult> {
        try {
            Logger.info(`TurnOfferingService: Starting turn offering process for game ${gameId}, trigger: ${triggerReason}`);

            // 1. Find the next available turn in the game
            const nextAvailableTurn = await this.findNextAvailableTurn(gameId);
            if (!nextAvailableTurn) {
                Logger.info(`TurnOfferingService: No available turns found for game ${gameId}`);
                return { success: false, error: 'No available turns found in game' };
            }

            // 2. Gather data for Next Player Logic
            const gameData = await this.prisma.game.findUnique({
                where: { id: gameId },
                include: {
                    season: {
                        include: {
                            players: {
                                include: {
                                    player: true
                                }
                            },
                            games: true,
                            config: true
                        }
                    },
                    turns: {
                        include: {
                            player: true
                        }
                    }
                }
            });

            if (!gameData || !gameData.season) {
                Logger.error(`TurnOfferingService: Game ${gameId} or its season not found`);
                return { success: false, error: 'Game or season not found' };
            }

            const seasonPlayers = gameData.season.players.map(p => p.player);
            
            // Get all games in the season with their turns
            const allSeasonGames = await this.prisma.game.findMany({
                where: { seasonId: gameData.seasonId },
                include: {
                    turns: {
                        include: {
                            player: true
                        }
                    }
                }
            });

            // 3. Use pure Next Player Logic to determine the next player
            const selectNextPlayerInput: SelectNextPlayerInput = {
                gameData: gameData,
                seasonPlayers: seasonPlayers,
                allSeasonGames: allSeasonGames,
                turnType: nextAvailableTurn.type as 'WRITING' | 'DRAWING'
            };

            const nextPlayerResult = selectNextPlayerPure(selectNextPlayerInput);

            if (!nextPlayerResult.success || !nextPlayerResult.playerId || !nextPlayerResult.player) {
                Logger.warn(`TurnOfferingService: Failed to select next player for game ${gameId}: ${nextPlayerResult.error}`);
                return { 
                    success: false, 
                    error: `Failed to select next player: ${nextPlayerResult.error}` 
                };
            }

            // 4. Offer the turn to the selected player using SeasonTurnService
            const offerResult = await this.turnService.offerTurn(
                nextAvailableTurn.id,
                nextPlayerResult.playerId
            );

            if (!offerResult.success || !offerResult.turn) {
                Logger.error(`TurnOfferingService: Failed to offer turn ${nextAvailableTurn.id} to player ${nextPlayerResult.playerId}: ${offerResult.error}`);
                return {
                    success: false,
                    error: `Failed to offer turn: ${offerResult.error}`
                };
            }

            // 5. Send DM notification to the selected player
            const dmResult = await this.sendTurnOfferDM(
                nextPlayerResult.player,
                offerResult.turn,
                gameId
            );

            if (!dmResult) {
                Logger.warn(`TurnOfferingService: Failed to send DM to player ${nextPlayerResult.playerId}, but turn was offered successfully`);
                // Don't fail the entire process if DM fails
            }

            // Note: Claim timeout scheduling is handled by SeasonTurnService.offerTurn()
            // No need to schedule it again here

            Logger.info(`TurnOfferingService: Successfully offered turn ${offerResult.turn.id} to player ${nextPlayerResult.playerId} for game ${gameId}`);
            
            return {
                success: true,
                turn: offerResult.turn,
                player: nextPlayerResult.player
            };

        } catch (error) {
            Logger.error(`TurnOfferingService: Error in offerNextTurn for game ${gameId}:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    /**
     * Finds the next available turn in a game.
     * Returns the first AVAILABLE turn ordered by turn number.
     * 
     * @param gameId - The ID of the game to search
     * @returns Promise<Turn | null> - The next available turn or null if none found
     */
    private async findNextAvailableTurn(gameId: string): Promise<Turn | null> {
        try {
            const availableTurn = await this.prisma.turn.findFirst({
                where: {
                    gameId: gameId,
                    status: 'AVAILABLE'
                },
                orderBy: {
                    turnNumber: 'asc'
                }
            });

            return availableTurn;
        } catch (error) {
            Logger.error(`TurnOfferingService: Error finding next available turn for game ${gameId}:`, error);
            return null;
        }
    }

    /**
     * Sends a DM notification to a player about their turn offer.
     * 
     * @param player - The player to send the DM to
     * @param turn - The turn that was offered
     * @param gameId - The ID of the game
     * @returns Promise<boolean> - True if DM was sent successfully
     */
    private async sendTurnOfferDM(
        player: Player,
        turn: Turn,
        gameId: string
    ): Promise<boolean> {
        try {
            // Get game and season information for the DM
            const gameWithSeason = await this.prisma.game.findUnique({
                where: { id: gameId },
                include: { season: true }
            });

            if (!gameWithSeason) {
                Logger.error(`TurnOfferingService: Game ${gameId} not found when sending DM`);
                return false;
            }

            // Get season-specific timeout values
            const timeouts = await getSeasonTimeouts(this.prisma, turn.id);

            // Calculate the actual timeout expiration time
            // The turn became OFFERED at turn.updatedAt, and will timeout after claimTimeoutMinutes
            const claimTimeoutMinutes = timeouts.claimTimeoutMinutes;
            const turnOfferedAt = turn.updatedAt;
            const timeoutExpiresAt = new Date(turnOfferedAt.getTime() + claimTimeoutMinutes * 60 * 1000);

            // Get server context information
            const serverContext = await this.serverContextService.getGameServerContext(gameId);

            // Create the claim button
            const claimButton = new ButtonBuilder()
                .setCustomId(`turn_claim_${turn.id}`)
                .setLabel(strings.messages.turnOffer.claimButton)
                .setStyle(ButtonStyle.Primary);

            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(claimButton);

            // Create the message content with interpolated variables
            const messageContent = interpolate(strings.messages.turnOffer.newTurnAvailable, {
                serverName: serverContext.serverName,
                gameId: gameId,
                seasonId: gameWithSeason.season?.id,
                turnNumber: turn.turnNumber,
                turnType: turn.type,
                claimTimeoutFormatted: FormatUtils.formatRemainingTime(timeoutExpiresAt)
            });

            // Send DM with button directly using Discord client
            const user = await this.discordClient.users.fetch(player.discordUserId);
            await user.send({
                content: messageContent,
                components: [actionRow]
            });

            Logger.info(`TurnOfferingService: Successfully sent turn offer DM to player ${player.id} (${player.discordUserId})`);
            return true;

        } catch (error) {
            Logger.error(`TurnOfferingService: Error sending turn offer DM to player ${player.id}:`, error);
            return false;
        }
    }

    /**
     * Schedules a claim timeout timer for a turn offer.
     * 
     * @param turnId - The ID of the turn
     * @param playerId - The ID of the player who was offered the turn
     * @returns Promise<boolean> - True if timeout was scheduled successfully
     */
    private async scheduleClaimTimeout(
        turnId: string,
        playerId: string
    ): Promise<boolean> {
        try {
            // Get season-specific timeout values
            const timeouts = await getSeasonTimeouts(this.prisma, turnId);
            const claimTimeoutDate = new Date(Date.now() + timeouts.claimTimeoutMinutes * 60 * 1000);
            
            const claimTimeoutJobId = `turn-claim-timeout-${turnId}`;
            
            const jobScheduled = await this.schedulerService.scheduleJob(
                claimTimeoutJobId,
                claimTimeoutDate,
                async (_jobData) => {
                    Logger.info(`Claim timeout triggered for turn ${turnId}, player ${playerId}`);
                    
                    // Import and create the ClaimTimeoutHandler
                    const { ClaimTimeoutHandler } = await import('../handlers/ClaimTimeoutHandler.js');
                    const claimTimeoutHandler = new ClaimTimeoutHandler(
                        this.prisma,
                        this.discordClient,
                        this.turnService,
                        this
                    );

                    // Execute the claim timeout handling
                    const result = await claimTimeoutHandler.handleClaimTimeout(turnId, playerId);

                    if (!result.success) {
                        throw new Error(`Claim timeout handling failed: ${result.error}`);
                    }

                    Logger.info(`Claim timeout handling completed successfully for turn ${turnId}`);
                },
                { turnId: turnId, playerId: playerId },
                'turn-claim-timeout'
            );

            if (jobScheduled) {
                Logger.info(`TurnOfferingService: Scheduled claim timeout for turn ${turnId} at ${claimTimeoutDate.toISOString()}`);
                return true;
            } else {
                Logger.warn(`TurnOfferingService: Failed to schedule claim timeout for turn ${turnId}`);
                return false;
            }

        } catch (error) {
            Logger.error(`TurnOfferingService: Error scheduling claim timeout for turn ${turnId}:`, error);
            return false;
        }
    }

    /**
     * Checks if a game has any more available turns.
     * 
     * @param gameId - The ID of the game to check
     * @returns Promise<boolean> - True if there are available turns
     */
    async hasAvailableTurns(gameId: string): Promise<boolean> {
        try {
            const availableTurnCount = await this.prisma.turn.count({
                where: {
                    gameId: gameId,
                    status: 'AVAILABLE'
                }
            });

            return availableTurnCount > 0;
        } catch (error) {
            Logger.error(`TurnOfferingService: Error checking available turns for game ${gameId}:`, error);
            return false;
        }
    }

    /**
     * Gets statistics about turn offering for a game.
     * Useful for debugging and monitoring.
     * 
     * @param gameId - The ID of the game
     * @returns Promise<object> - Statistics about the game's turns
     */
    async getTurnOfferingStats(gameId: string): Promise<{
        totalTurns: number;
        availableTurns: number;
        offeredTurns: number;
        pendingTurns: number;
        completedTurns: number;
        skippedTurns: number;
    }> {
        try {
            const [
                totalTurns,
                availableTurns,
                offeredTurns,
                pendingTurns,
                completedTurns,
                skippedTurns
            ] = await Promise.all([
                this.prisma.turn.count({ where: { gameId } }),
                this.prisma.turn.count({ where: { gameId, status: 'AVAILABLE' } }),
                this.prisma.turn.count({ where: { gameId, status: 'OFFERED' } }),
                this.prisma.turn.count({ where: { gameId, status: 'PENDING' } }),
                this.prisma.turn.count({ where: { gameId, status: 'COMPLETED' } }),
                this.prisma.turn.count({ where: { gameId, status: 'SKIPPED' } })
            ]);

            return {
                totalTurns,
                availableTurns,
                offeredTurns,
                pendingTurns,
                completedTurns,
                skippedTurns
            };
        } catch (error) {
            Logger.error(`TurnOfferingService: Error getting turn stats for game ${gameId}:`, error);
            return {
                totalTurns: 0,
                availableTurns: 0,
                offeredTurns: 0,
                pendingTurns: 0,
                completedTurns: 0,
                skippedTurns: 0
            };
        }
    }
} 