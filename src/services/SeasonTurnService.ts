import type { CheckGameCompletionInput, CheckSeasonCompletionInput } from '../game/types.js';
import { Game, Player, Prisma, PrismaClient, Turn } from '@prisma/client';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client as DiscordClient } from 'discord.js';
import { nanoid } from 'nanoid';

import { checkGameCompletionPure, checkSeasonCompletionPure } from '../game/pureGameLogic.js';
import { interpolate, strings } from '../lang/strings.js';
import { SchedulerService } from '../services/SchedulerService.js';
import { TurnTimeoutService } from './interfaces/TurnTimeoutService.js';
import { FormatUtils } from '../utils/format-utils.js';
import { getSeasonTimeouts } from '../utils/seasonConfig.js';

export class SeasonTurnService implements TurnTimeoutService {
  private prisma: PrismaClient;
  private discordClient: DiscordClient;
  private schedulerService?: SchedulerService;
  // private langService: LangService; // Uncomment if used

  constructor(
    prisma: PrismaClient,
    discordClient: DiscordClient,
    schedulerService?: SchedulerService
    // langService: LangService, // Uncomment if used
  ) {
    this.prisma = prisma;
    this.discordClient = discordClient;
    this.schedulerService = schedulerService;
    // this.langService = langService; // Uncomment if used
  }

  /**
   * Creates an initial turn for a game, offers it to a player, and sends a DM.
   * @param game The game for which to offer the turn.
   * @param player The player to whom the turn is offered.
   * @param seasonId The ID of the season this game belongs to (for context in DM).
   * @param tx Optional Prisma transaction client to use for database operations.
   * @returns An object indicating success or failure, with the created turn or an error message.
   */
  async offerInitialTurn(
    game: Game,
    player: Player,
    seasonId: string,
    tx?: Prisma.TransactionClient
  ): Promise<{ success: boolean; turn?: Turn; error?: string }> {
    try {
      // Use the provided transaction client or fall back to the default prisma client
      const prismaClient = tx || this.prisma;

      // Get the season configuration to determine the first turn type
      const season = await prismaClient.season.findUnique({
        where: { id: seasonId },
        include: { config: true }
      });

      if (!season || !season.config) {
        console.error(`Season ${seasonId} or its config not found`);
        return { success: false, error: 'Season configuration not found' };
      }

      // Determine the first turn type based on turn pattern
      const turnPattern = season.config.turnPattern.split(',');
      const firstTurnType = turnPattern[0].trim().toUpperCase() as Prisma.TurnCreateInput['type'];

      const newTurn = await prismaClient.turn.create({
        data: {
          id: nanoid(),
          gameId: game.id,
          playerId: player.id,
          turnNumber: 1, // Initial turn
          status: 'OFFERED',
          type: firstTurnType,
          offeredAt: new Date(), // Set when turn is offered
          // expiresAt: // Claim timeout scheduling tracked in Task 38
          // content: // No content for an offered turn
          // nextTurnId: // Not applicable for initial turn
        },
      });

      // Get season-specific timeout values once for both messaging and scheduling
      let timeouts;
      try {
        timeouts = await getSeasonTimeouts(this.prisma, newTurn.id);
      } catch (timeoutError) {
        console.error(`Failed to get season timeouts for turn ${newTurn.id}:`, timeoutError);
        // Use default values if timeout retrieval fails
        timeouts = {
          claimTimeoutMinutes: 1440, // 24 hours default
          writingTimeoutMinutes: 1440,
          drawingTimeoutMinutes: 4320
        };
      }

      try {
        // Create the claim button
        const claimButton = new ButtonBuilder()
          .setCustomId(`turn_claim_${newTurn.id}`)
          .setLabel(strings.messages.turnOffer.claimButton)
          .setStyle(ButtonStyle.Primary);

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(claimButton);

        // Create the message content with interpolated variables
        const messageContent = interpolate(strings.messages.turnOffer.initialTurnOffer, {
          gameId: game.id,
          seasonId: seasonId,
          turnType: firstTurnType,
          claimTimeoutFormatted: FormatUtils.formatTimeout(timeouts.claimTimeoutMinutes)
        });

        // Send DM with button directly using Discord client
        const user = await this.discordClient.users.fetch(player.discordUserId);
        await user.send({
          content: messageContent,
          components: [actionRow]
        });

        console.log(`Successfully sent initial turn offer DM with claim button to player ${player.id} (${player.discordUserId}) for game ${game.id}, turn ${newTurn.id}`);
      } catch (dmError) {
        console.error(`Failed to send initial turn offer DM to player ${player.id} (${player.discordUserId}) for game ${game.id}:`, dmError);
        // Log error, but proceed as turn is programmatically offered.
      }
      
      // Schedule claim warning and timeout if SchedulerService is available
      if (this.schedulerService) {
        try {
          // Schedule claim warning if configured
          if (timeouts.claimWarningMinutes) {
            const claimWarningDate = new Date(Date.now() + timeouts.claimWarningMinutes * 60 * 1000);
            const claimWarningJobId = `turn-warning-${newTurn.id}`;
            
            const warningJobScheduled = await this.schedulerService.scheduleJob(
              claimWarningJobId,
              claimWarningDate,
              async (_jobData) => {
                console.log(`Claim warning triggered for initial turn ${newTurn.id}`);
                await this.sendClaimWarning(newTurn.id);
              },
              { turnId: newTurn.id },
              'turn-warning'
            );

            if (warningJobScheduled) {
              console.log(`Scheduled claim warning for initial turn ${newTurn.id} at ${claimWarningDate.toISOString()}`);
            } else {
              console.warn(`Failed to schedule claim warning for initial turn ${newTurn.id}`);
            }
          }

          // Schedule claim timeout
          const claimTimeoutDate = new Date(Date.now() + timeouts.claimTimeoutMinutes * 60 * 1000);
          
          const claimTimeoutJobId = `turn-claim-timeout-${newTurn.id}`;
          
          const jobScheduled = await this.schedulerService.scheduleJob(
            claimTimeoutJobId,
            claimTimeoutDate,
            async (_jobData) => {
              console.log(`Claim timeout triggered for initial turn ${newTurn.id}, player ${player.id}`);
              
              // Import and create the ClaimTimeoutHandler
              const { ClaimTimeoutHandler } = await import('../handlers/ClaimTimeoutHandler.js');
              const { TurnOfferingService } = await import('./TurnOfferingService.js');
              
              // Create TurnOfferingService instance for the handler
              const turnOfferingService = new TurnOfferingService(
                this.prisma,
                this.discordClient,
                this,
                this.schedulerService!
              );
              
              const claimTimeoutHandler = new ClaimTimeoutHandler(
                this.prisma,
                this.discordClient,
                this,
                turnOfferingService
              );

              // Execute the claim timeout handling
              const result = await claimTimeoutHandler.handleClaimTimeout(newTurn.id, player.id);

              if (!result.success) {
                throw new Error(`Claim timeout handling failed: ${result.error}`);
              }

              console.log(`Claim timeout handling completed successfully for initial turn ${newTurn.id}`);
            },
            { turnId: newTurn.id, playerId: player.id },
            'turn-claim-timeout'
          );

          if (jobScheduled) {
            console.log(`Scheduled claim timeout for initial turn ${newTurn.id} at ${claimTimeoutDate.toISOString()}`);
          } else {
            console.warn(`Failed to schedule claim timeout for initial turn ${newTurn.id}`);
          }
        } catch (schedulingError) {
          console.error(`Error scheduling claim timeout/warning for initial turn ${newTurn.id}:`, schedulingError);
          // Don't fail the turn creation if timeout scheduling fails
        }
      } else {
        console.warn(`SchedulerService not available, claim timeout/warning not scheduled for initial turn ${newTurn.id}`);
      }

      return { success: true, turn: newTurn };
    } catch (error) {
      console.error(`Error in SeasonTurnService.offerInitialTurn for game ${game.id}, player ${player.id}:`, error);
      let errorMessage = 'Unknown error occurred while offering the initial turn.';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      // Consider if Prisma errors need specific handling here
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Claims a turn that is currently OFFERED, transitioning it to PENDING state.
   * @param turnId The ID of the turn to claim.
   * @param playerId The ID of the player claiming the turn.
   * @returns An object indicating success or failure with the updated turn or error message.
   */
  async claimTurn(
    turnId: string,
    playerId: string
  ): Promise<{ success: boolean; turn?: Turn; error?: string }> {
    try {
      // Verify the turn exists and is in OFFERED state for this player
      const existingTurn = await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: { player: true, game: true }
      });

      if (!existingTurn) {
        return { success: false, error: 'Turn not found.' };
      }

      if (existingTurn.status !== 'OFFERED') {
        return { success: false, error: `Turn is not in OFFERED state. Current status: ${existingTurn.status}` };
      }

      if (existingTurn.playerId !== playerId) {
        return { success: false, error: 'Turn is not offered to this player.' };
      }

      // Update turn to PENDING state with atomic operation
      const updatedTurn = await this.prisma.turn.update({
        where: { id: turnId },
        data: {
          status: 'PENDING',
          claimedAt: new Date(),
          updatedAt: new Date()
        },
        include: { player: true, game: true }
      });

      console.log(`Turn ${turnId} claimed by player ${playerId}, status updated to PENDING`);
      return { success: true, turn: updatedTurn };
    } catch (error) {
      console.error(`Error in SeasonTurnService.claimTurn for turn ${turnId}, player ${playerId}:`, error);
      let errorMessage = 'Unknown error occurred while claiming the turn.';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Submits content for a turn that is currently PENDING, transitioning it to COMPLETED state.
   * @param turnId The ID of the turn to submit.
   * @param playerId The ID of the player submitting the turn.
   * @param content The content to submit (text or image URL).
   * @param contentType The type of content ('text' or 'image').
   * @returns An object indicating success or failure with the updated turn or error message.
   */
  async submitTurn(
    turnId: string,
    playerId: string,
    content: string,
    contentType: 'text' | 'image'
  ): Promise<{ success: boolean; turn?: Turn; error?: string }> {
    try {
      // Validate content is not empty
      if (!content || content.trim() === '') {
        return { success: false, error: 'Content cannot be empty.' };
      }

      // Validate content type
      if (contentType !== 'text' && contentType !== 'image') {
        return { success: false, error: 'Invalid content type. Must be "text" or "image".' };
      }

      // Verify the turn exists and is in PENDING state for this player
      const existingTurn = await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: { player: true, game: true }
      });

      if (!existingTurn) {
        return { success: false, error: 'Turn not found.' };
      }

      if (existingTurn.status !== 'PENDING') {
        return { success: false, error: `Turn is not in PENDING state. Current status: ${existingTurn.status}` };
      }

      if (existingTurn.playerId !== playerId) {
        return { success: false, error: 'Turn does not belong to this player.' };
      }

      // Prepare update data based on content type
      const updateData: Prisma.TurnUpdateInput = {
        status: 'COMPLETED',
        completedAt: new Date(),
        updatedAt: new Date()
      };

      if (contentType === 'text') {
        updateData.textContent = content;
      } else if (contentType === 'image') {
        updateData.imageUrl = content;
      }

      // Update turn to COMPLETED state with atomic operation
      const updatedTurn = await this.prisma.turn.update({
        where: { id: turnId },
        data: updateData,
        include: { player: true, game: true }
      });

      console.log(`Turn ${turnId} submitted by player ${playerId}, status updated to COMPLETED`);

      // Check if the game is now completed after this turn submission
      try {
        // Gather data for pure game completion check
        const seasonPlayers = await this.prisma.player.findMany({
          where: {
            seasons: {
              some: {
                seasonId: existingTurn.game.seasonId
              }
            }
          }
        });

        const completedOrSkippedTurns = await this.prisma.turn.findMany({
          where: {
            gameId: existingTurn.gameId,
            status: {
              in: ['COMPLETED', 'SKIPPED']
            }
          },
          include: {
            player: true
          }
        });

        const gameCompletionInput: CheckGameCompletionInput = {
          gameId: existingTurn.gameId,
          seasonPlayers: seasonPlayers,
          completedOrSkippedTurns: completedOrSkippedTurns
        };

        const completionResult = checkGameCompletionPure(gameCompletionInput);
        const isGameCompleted = completionResult.isCompleted;
        
        if (isGameCompleted) {
          // Update the game status to COMPLETED
          await this.prisma.game.update({
            where: { id: existingTurn.gameId },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              updatedAt: new Date()
            }
          });
          
          console.log(`Game ${existingTurn.gameId} marked as COMPLETED after turn ${turnId} submission`);
          
          // Post to completed games channel
          try {
            const { ChannelConfigService } = await import('./ChannelConfigService.js');
            const channelConfigService = new ChannelConfigService(this.prisma);
            
            // Get the season to retrieve the guildId
            const season = await this.prisma.season.findUnique({
              where: { id: existingTurn.game.seasonId },
              select: { guildId: true }
            });
            
            if (season?.guildId) {
              const completedChannelId = await channelConfigService.getCompletedChannelId(season.guildId);
              
              if (completedChannelId) {
                const completedChannel = await this.discordClient.channels.fetch(completedChannelId);
                if (completedChannel?.isTextBased() && 'send' in completedChannel) {
                  const gameCompletionMessage = interpolate(strings.messages.game.completionAnnouncement, {
                    gameId: existingTurn.gameId,
                    seasonId: existingTurn.game.seasonId,
                    finishedGamesLink: `<#${completedChannelId}>`
                  });
                  
                  await completedChannel.send(gameCompletionMessage);
                  console.log(`Posted game completion announcement for game ${existingTurn.gameId} to completed channel ${completedChannelId}`);
                }
              }
            } else {
              console.log(`Game ${existingTurn.gameId} has no guild ID, skipping completion announcement`);
            }
          } catch (channelPostError) {
            console.error(`Failed to post game completion to completed channel for game ${existingTurn.gameId}:`, channelPostError);
            // Don't fail the turn submission if channel posting fails
          }
          
          // Check if the season is now completed after this game completion
          try {
            // Gather data for pure season completion check
            const season = await this.prisma.season.findUnique({
              where: { id: existingTurn.game.seasonId },
              include: {
                games: true,
                players: true,
                config: true
              }
            });

            if (season) {
              const seasonCompletionInput: CheckSeasonCompletionInput = {
                season: season
              };

              const seasonCompletionResult = checkSeasonCompletionPure(seasonCompletionInput);
              if (seasonCompletionResult.isCompleted) {
                // Update the season status to COMPLETED
                await this.prisma.season.update({
                  where: { id: existingTurn.game.seasonId },
                  data: {
                    status: 'COMPLETED',
                    updatedAt: new Date()
                  }
                });
                console.log(`Season ${existingTurn.game.seasonId} marked as COMPLETED after game ${existingTurn.gameId} completion`);
              }
            }
          } catch (seasonCompletionError) {
            console.error(`Error checking season completion for season ${existingTurn.game.seasonId} after game ${existingTurn.gameId}:`, seasonCompletionError);
            // Don't fail the turn submission if season completion check fails
          }
        } else {
          // Game is not completed, trigger turn offering for the next turn
          try {
            const { TurnOfferingService } = await import('./TurnOfferingService.js');
            const turnOfferingService = new TurnOfferingService(
              this.prisma,
              this.discordClient,
              this,
              this.schedulerService!
            );
            
            const offerResult = await turnOfferingService.offerNextTurn(
              existingTurn.gameId,
              'turn_completed'
            );
            
            if (offerResult.success) {
              console.log(`Successfully triggered turn offering for game ${existingTurn.gameId} after turn ${turnId} completion`);
            } else {
              console.warn(`Failed to trigger turn offering for game ${existingTurn.gameId} after turn ${turnId} completion: ${offerResult.error}`);
            }
          } catch (turnOfferingError) {
            console.error(`Error triggering turn offering for game ${existingTurn.gameId} after turn ${turnId} completion:`, turnOfferingError);
            // Don't fail the turn submission if turn offering fails
          }
        }
      } catch (gameCompletionError) {
        console.error(`Error checking game completion for game ${existingTurn.gameId} after turn ${turnId}:`, gameCompletionError);
        // Don't fail the turn submission if game completion check fails
      }

      return { success: true, turn: updatedTurn };
    } catch (error) {
      console.error(`Error in SeasonTurnService.submitTurn for turn ${turnId}, player ${playerId}:`, error);
      let errorMessage = 'Unknown error occurred while submitting the turn.';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Dismisses an offered turn, reverting it back to AVAILABLE state.
   * This is typically called when a claim timeout occurs.
   * @param turnId The ID of the turn to dismiss.
   * @returns An object indicating success or failure with the updated turn or error message.
   */
  async dismissOffer(
    turnId: string
  ): Promise<{ success: boolean; turn?: Turn; error?: string }> {
    try {
      // Verify the turn exists and is in OFFERED state
      const existingTurn = await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: { player: true, game: true }
      });

      if (!existingTurn) {
        return { success: false, error: 'Turn not found.' };
      }

      if (existingTurn.status !== 'OFFERED') {
        return { success: false, error: `Turn is not in OFFERED state. Current status: ${existingTurn.status}` };
      }

      // Update turn back to AVAILABLE state and clear player assignment
      const updatedTurn = await this.prisma.turn.update({
        where: { id: turnId },
        data: {
          status: 'AVAILABLE',
          playerId: null, // Clear player assignment
          offeredAt: null, // Clear offer timestamp
          updatedAt: new Date()
        },
        include: { player: true, game: true }
      });

      console.log(`Turn ${turnId} offer dismissed, status reverted to AVAILABLE`);
      return { success: true, turn: updatedTurn };
    } catch (error) {
      console.error(`Error in SeasonTurnService.dismissOffer for turn ${turnId}:`, error);
      let errorMessage = 'Unknown error occurred while dismissing the turn offer.';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Skips a turn that is currently PENDING, transitioning it to SKIPPED state.
   * This is typically called when a submission timeout occurs.
   * @param turnId The ID of the turn to skip.
   * @returns An object indicating success or failure with the updated turn or error message.
   */
  async skipTurn(
    turnId: string
  ): Promise<{ success: boolean; turn?: Turn; error?: string }> {
    try {
      // Verify the turn exists and is in PENDING state
      const existingTurn = await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: { player: true, game: true }
      });

      if (!existingTurn) {
        return { success: false, error: 'Turn not found.' };
      }

      if (existingTurn.status !== 'PENDING') {
        return { success: false, error: `Turn is not in PENDING state. Current status: ${existingTurn.status}` };
      }

      // Update turn to SKIPPED state with atomic operation
      const updatedTurn = await this.prisma.turn.update({
        where: { id: turnId },
        data: {
          status: 'SKIPPED',
          skippedAt: new Date(),
          updatedAt: new Date()
        },
        include: { player: true, game: true }
      });

      console.log(`Turn ${turnId} skipped for player ${existingTurn.playerId}, status updated to SKIPPED`);

      // Check if the game is now completed after this turn skip
      try {
        // Gather data for pure game completion check
        const seasonPlayers = await this.prisma.player.findMany({
          where: {
            seasons: {
              some: {
                seasonId: existingTurn.game.seasonId
              }
            }
          }
        });

        const completedOrSkippedTurns = await this.prisma.turn.findMany({
          where: {
            gameId: existingTurn.gameId,
            status: {
              in: ['COMPLETED', 'SKIPPED']
            }
          },
          include: {
            player: true
          }
        });

        const gameCompletionInput: CheckGameCompletionInput = {
          gameId: existingTurn.gameId,
          seasonPlayers: seasonPlayers,
          completedOrSkippedTurns: completedOrSkippedTurns
        };

        const completionResult = checkGameCompletionPure(gameCompletionInput);
        const isGameCompleted = completionResult.isCompleted;
        
        if (isGameCompleted) {
          // Update the game status to COMPLETED
          await this.prisma.game.update({
            where: { id: existingTurn.gameId },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              updatedAt: new Date()
            }
          });
          
          console.log(`Game ${existingTurn.gameId} marked as COMPLETED after turn ${turnId} skip`);
          
          // Post to completed games channel
          try {
            const { ChannelConfigService } = await import('./ChannelConfigService.js');
            const channelConfigService = new ChannelConfigService(this.prisma);
            
            // Get the season to retrieve the guildId
            const season = await this.prisma.season.findUnique({
              where: { id: existingTurn.game.seasonId },
              select: { guildId: true }
            });
            
            if (season?.guildId) {
              const completedChannelId = await channelConfigService.getCompletedChannelId(season.guildId);
              
              if (completedChannelId) {
                const completedChannel = await this.discordClient.channels.fetch(completedChannelId);
                if (completedChannel?.isTextBased() && 'send' in completedChannel) {
                  const gameCompletionMessage = interpolate(strings.messages.game.completionAnnouncement, {
                    gameId: existingTurn.gameId,
                    seasonId: existingTurn.game.seasonId,
                    finishedGamesLink: `<#${completedChannelId}>`
                  });
                  
                  await completedChannel.send(gameCompletionMessage);
                  console.log(`Posted game completion announcement for game ${existingTurn.gameId} to completed channel ${completedChannelId}`);
                }
              }
            } else {
              console.log(`Game ${existingTurn.gameId} has no guild ID, skipping completion announcement`);
            }
          } catch (channelPostError) {
            console.error(`Failed to post game completion to completed channel for game ${existingTurn.gameId}:`, channelPostError);
            // Don't fail the turn skip if channel posting fails
          }
          
          // Check if the season is now completed after this game completion
          try {
            // Gather data for pure season completion check
            const season = await this.prisma.season.findUnique({
              where: { id: existingTurn.game.seasonId },
              include: {
                games: true,
                players: true,
                config: true
              }
            });

            if (season) {
              const seasonCompletionInput: CheckSeasonCompletionInput = {
                season: season
              };

              const seasonCompletionResult = checkSeasonCompletionPure(seasonCompletionInput);
              if (seasonCompletionResult.isCompleted) {
                // Update the season status to COMPLETED
                await this.prisma.season.update({
                  where: { id: existingTurn.game.seasonId },
                  data: {
                    status: 'COMPLETED',
                    updatedAt: new Date()
                  }
                });
                console.log(`Season ${existingTurn.game.seasonId} marked as COMPLETED after game ${existingTurn.gameId} completion`);
              }
            }
          } catch (seasonCompletionError) {
            console.error(`Error checking season completion for season ${existingTurn.game.seasonId} after game ${existingTurn.gameId}:`, seasonCompletionError);
            // Don't fail the turn skip if season completion check fails
          }
        } else {
          // Game is not completed, trigger turn offering for the next turn
          try {
            const { TurnOfferingService } = await import('./TurnOfferingService.js');
            const turnOfferingService = new TurnOfferingService(
              this.prisma,
              this.discordClient,
              this,
              this.schedulerService!
            );
            
            const offerResult = await turnOfferingService.offerNextTurn(
              existingTurn.gameId,
              'turn_skipped'
            );
            
            if (offerResult.success) {
              console.log(`Successfully triggered turn offering for game ${existingTurn.gameId} after turn ${turnId} skip`);
            } else {
              console.warn(`Failed to trigger turn offering for game ${existingTurn.gameId} after turn ${turnId} skip: ${offerResult.error}`);
            }
          } catch (turnOfferingError) {
            console.error(`Error triggering turn offering for game ${existingTurn.gameId} after turn ${turnId} skip:`, turnOfferingError);
            // Don't fail the turn skip if turn offering fails
          }
        }
      } catch (gameCompletionError) {
        console.error(`Error checking game completion for game ${existingTurn.gameId} after turn ${turnId}:`, gameCompletionError);
        // Don't fail the turn skip if game completion check fails
      }

      return { success: true, turn: updatedTurn };
    } catch (error) {
      console.error(`Error in SeasonTurnService.skipTurn for turn ${turnId}:`, error);
      let errorMessage = 'Unknown error occurred while skipping the turn.';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Offers a turn to a specific player, transitioning it from AVAILABLE to OFFERED state.
   * @param turnId The ID of the turn to offer.
   * @param playerId The ID of the player to offer the turn to.
   * @returns An object indicating success or failure with the updated turn or error message.
   */
  async offerTurn(
    turnId: string,
    playerId: string
  ): Promise<{ success: boolean; turn?: Turn; error?: string }> {
    try {
      // Verify the turn exists and is in AVAILABLE state
      const existingTurn = await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: { player: true, game: true }
      });

      if (!existingTurn) {
        return { success: false, error: 'Turn not found.' };
      }

      if (existingTurn.status !== 'AVAILABLE') {
        return { success: false, error: `Turn is not in AVAILABLE state. Current status: ${existingTurn.status}` };
      }

      // Verify the player exists
      const player = await this.prisma.player.findUnique({
        where: { id: playerId }
      });

      if (!player) {
        return { success: false, error: 'Player not found.' };
      }

      // Update turn to OFFERED state with atomic operation
      const updatedTurn = await this.prisma.turn.update({
        where: { id: turnId },
        data: {
          status: 'OFFERED',
          playerId: playerId,
          offeredAt: new Date(),
          updatedAt: new Date()
        },
        include: { player: true, game: true }
      });

      // Get season-specific timeout values for scheduling
      let timeouts;
      try {
        timeouts = await getSeasonTimeouts(this.prisma, turnId);
      } catch (timeoutError) {
        console.error(`Failed to get season timeouts for turn ${turnId}:`, timeoutError);
        // Use default values if timeout retrieval fails
        timeouts = {
          claimTimeoutMinutes: 1440, // 24 hours default
          writingTimeoutMinutes: 1440,
          drawingTimeoutMinutes: 4320
        };
      }

      // Schedule claim warning and timeout if SchedulerService is available
      if (this.schedulerService) {
        try {
          // Schedule claim warning if configured
          if (timeouts.claimWarningMinutes) {
            const claimWarningDate = new Date(Date.now() + timeouts.claimWarningMinutes * 60 * 1000);
            const claimWarningJobId = `turn-warning-${turnId}`;
            
            const warningJobScheduled = await this.schedulerService.scheduleJob(
              claimWarningJobId,
              claimWarningDate,
              async (_jobData) => {
                console.log(`Claim warning triggered for turn ${turnId}`);
                await this.sendClaimWarning(turnId);
              },
              { turnId },
              'turn-warning'
            );

            if (warningJobScheduled) {
              console.log(`Scheduled claim warning for turn ${turnId} at ${claimWarningDate.toISOString()}`);
            } else {
              console.warn(`Failed to schedule claim warning for turn ${turnId}`);
            }
          }

          // Schedule claim timeout
          const claimTimeoutDate = new Date(Date.now() + timeouts.claimTimeoutMinutes * 60 * 1000);
          
          const claimTimeoutJobId = `turn-claim-timeout-${turnId}`;
          
          const jobScheduled = await this.schedulerService.scheduleJob(
            claimTimeoutJobId,
            claimTimeoutDate,
            async (_jobData) => {
              console.log(`Claim timeout triggered for turn ${turnId}, player ${playerId}`);
              
              // Import and create the ClaimTimeoutHandler
              const { ClaimTimeoutHandler } = await import('../handlers/ClaimTimeoutHandler.js');
              const { TurnOfferingService } = await import('./TurnOfferingService.js');
              
              // Create TurnOfferingService instance for the handler
              const turnOfferingService = new TurnOfferingService(
                this.prisma,
                this.discordClient,
                this,
                this.schedulerService!
              );
              
              const claimTimeoutHandler = new ClaimTimeoutHandler(
                this.prisma,
                this.discordClient,
                this,
                turnOfferingService
              );

              // Execute the claim timeout handling
              const result = await claimTimeoutHandler.handleClaimTimeout(turnId, playerId);

              if (!result.success) {
                throw new Error(`Claim timeout handling failed: ${result.error}`);
              }

              console.log(`Claim timeout handling completed successfully for turn ${turnId}`);
            },
            { turnId, playerId },
            'turn-claim-timeout'
          );

          if (jobScheduled) {
            console.log(`Scheduled claim timeout for turn ${turnId} at ${claimTimeoutDate.toISOString()}`);
          } else {
            console.warn(`Failed to schedule claim timeout for turn ${turnId}`);
          }
        } catch (schedulingError) {
          console.error(`Error scheduling claim timeout/warning for turn ${turnId}:`, schedulingError);
          // Don't fail the turn offering if timeout scheduling fails
        }
      } else {
        console.warn(`SchedulerService not available, claim timeout/warning not scheduled for turn ${turnId}`);
      }

      console.log(`Turn ${turnId} offered to player ${playerId}, status updated to OFFERED`);
      return { success: true, turn: updatedTurn };
    } catch (error) {
      console.error(`Error in SeasonTurnService.offerTurn for turn ${turnId}, player ${playerId}:`, error);
      let errorMessage = 'Unknown error occurred while offering the turn.';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Updates the status of a turn with proper validation and atomic operation.
   * This is a general method for state transitions with validation.
   * @param turnId The ID of the turn to update.
   * @param newStatus The new status to set.
   * @param additionalData Optional additional data to update.
   * @returns An object indicating success or failure with the updated turn or error message.
   */
  async updateTurnStatus(
    turnId: string,
    newStatus: string,
    additionalData?: Partial<Prisma.TurnUpdateInput>
  ): Promise<{ success: boolean; turn?: Turn; error?: string }> {
    try {
      // Verify the turn exists
      const existingTurn = await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: { player: true, game: true }
      });

      if (!existingTurn) {
        return { success: false, error: 'Turn not found.' };
      }

      // Validate state transition (basic validation)
      const validTransitions: Record<string, string[]> = {
        'AVAILABLE': ['OFFERED'],
        'OFFERED': ['PENDING', 'AVAILABLE'], // AVAILABLE for dismissing offer
        'PENDING': ['COMPLETED', 'SKIPPED'],
        'COMPLETED': [], // Terminal state
        'SKIPPED': [] // Terminal state
      };

      const allowedNextStates = validTransitions[existingTurn.status] || [];
      if (!allowedNextStates.includes(newStatus)) {
        return { 
          success: false, 
          error: `Invalid state transition from ${existingTurn.status} to ${newStatus}` 
        };
      }

      // Prepare update data
      const updateData: Prisma.TurnUpdateInput = {
        status: newStatus,
        updatedAt: new Date(),
        ...additionalData
      };

      // Update turn with atomic operation
      const updatedTurn = await this.prisma.turn.update({
        where: { id: turnId },
        data: updateData,
        include: { player: true, game: true }
      });

      console.log(`Turn ${turnId} status updated from ${existingTurn.status} to ${newStatus}`);
      return { success: true, turn: updatedTurn };
    } catch (error) {
      console.error(`Error in SeasonTurnService.updateTurnStatus for turn ${turnId}:`, error);
      let errorMessage = 'Unknown error occurred while updating turn status.';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Gets a turn by ID with full details.
   * @param turnId The ID of the turn to retrieve.
   * @returns The turn with related data or null if not found.
   */
  async getTurn(turnId: string): Promise<Turn | null> {
    try {
      return await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: { 
          player: true, 
          game: {
            include: {
              season: true
            }
          },
          previousTurn: true,
          nextTurn: true
        }
      });
    } catch (error) {
      console.error(`Error in SeasonTurnService.getTurn for turn ${turnId}:`, error);
      return null;
    }
  }

  /**
   * Gets all turns for a specific game.
   * @param gameId The ID of the game.
   * @param status Optional status filter.
   * @returns Array of turns for the game.
   */
  async getTurnsForGame(gameId: string, status?: string): Promise<Turn[]> {
    try {
      const whereClause: Prisma.TurnWhereInput = { gameId };
      if (status) {
        whereClause.status = status;
      }

      return await this.prisma.turn.findMany({
        where: whereClause,
        include: { 
          player: true, 
          game: true 
        },
        orderBy: { turnNumber: 'asc' }
      });
    } catch (error) {
      console.error(`Error in SeasonTurnService.getTurnsForGame for game ${gameId}:`, error);
      return [];
    }
  }

  /**
   * Gets all turns for a specific player.
   * @param playerId The ID of the player.
   * @param status Optional status filter.
   * @returns Array of turns for the player.
   */
  async getTurnsForPlayer(playerId: string, status?: string): Promise<Turn[]> {
    try {
      const whereClause: Prisma.TurnWhereInput = { playerId };
      if (status) {
        whereClause.status = status;
      }

      return await this.prisma.turn.findMany({
        where: whereClause,
        include: { 
          player: true, 
          game: {
            include: {
              season: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      console.error(`Error in SeasonTurnService.getTurnsForPlayer for player ${playerId}:`, error);
      return [];
    }
  }

  /**
   * Sends a claim warning to a player for a turn that is about to timeout.
   * @param turnId The ID of the turn to send warning for.
   */
  async sendClaimWarning(turnId: string): Promise<void> {
    try {
      const turn = await this.prisma.turn.findUnique({
        where: { id: turnId },
        include: { 
          player: true, 
          game: {
            include: {
              season: true
            }
          }
        }
      });

      if (!turn || !turn.player) {
        console.error(`Turn ${turnId} or player not found for claim warning`);
        return;
      }

      if (turn.status !== 'OFFERED') {
        console.log(`Turn ${turnId} is not in OFFERED state, skipping claim warning`);
        return;
      }

      // Get season-specific timeout values
      const timeouts = await getSeasonTimeouts(this.prisma, turnId);
      
      // Calculate the actual timeout expiration time
      // The turn became OFFERED at turn.updatedAt, and will timeout after claimTimeoutMinutes
      const claimTimeoutMinutes = timeouts.claimTimeoutMinutes;
      const turnOfferedAt = turn.updatedAt;
      const timeoutExpiresAt = new Date(turnOfferedAt.getTime() + claimTimeoutMinutes * 60 * 1000);
      
      const user = await this.discordClient.users.fetch(turn.player.discordUserId);
      
      // Create the warning message with precise remaining time
      const message = interpolate(strings.messages.turnTimeout.claimWarning, {
        remainingTime: FormatUtils.formatRemainingTime(timeoutExpiresAt),
        gameId: turn.game.id,
        seasonId: turn.game.season?.id || 'Unknown',
        turnNumber: turn.turnNumber,
        turnType: turn.type.toLowerCase()
      });
      
      await user.send(message);
      console.log(`Claim warning sent to player ${turn.player.id} for turn ${turnId}`);

    } catch (error) {
      console.error(`Error sending claim warning for turn ${turnId}:`, error);
    }
  }
} 