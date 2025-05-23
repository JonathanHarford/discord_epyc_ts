import { PrismaClient, Game, Player, Turn, Prisma } from '@prisma/client';
import { Client as DiscordClient } from 'discord.js';
import { nanoid } from 'nanoid';
import { checkGameCompletion, checkSeasonCompletion } from '../game/gameLogic.js';
// TODO: Import LangService if used for messages
// TODO: Import TaskSchedulerService if scheduling claim timeouts

export class TurnService {
  private prisma: PrismaClient;
  private discordClient: DiscordClient;
  // private langService: LangService; // Uncomment if used
  // private taskSchedulerService: TaskSchedulerService; // Uncomment if used

  constructor(
    prisma: PrismaClient,
    discordClient: DiscordClient,
    // langService: LangService, // Uncomment if used
    // taskSchedulerService: TaskSchedulerService // Uncomment if used
  ) {
    this.prisma = prisma;
    this.discordClient = discordClient;
    // this.langService = langService; // Uncomment if used
    // this.taskSchedulerService = taskSchedulerService; // Uncomment if used
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
      // For now, assume 'WRITING' or get from a default/config.
      // TODO: Determine initial turn type based on game/season config if available.
      const initialTurnType: Prisma.TurnCreateInput['type'] = 'WRITING';

      // Use the provided transaction client or fall back to the default prisma client
      const prismaClient = tx || this.prisma;

      const newTurn = await prismaClient.turn.create({
        data: {
          id: nanoid(),
          gameId: game.id,
          playerId: player.id,
          turnNumber: 1, // Initial turn
          status: 'OFFERED',
          type: initialTurnType,
          offeredAt: new Date(), // Set when turn is offered
          // expiresAt: // TODO: Set if scheduling claim timeout (integrates with Task 14/15 for scheduler)
          // content: // No content for an offered turn
          // nextTurnId: // Not applicable for initial turn
        },
      });

      try {
        const user = await this.discordClient.users.fetch(player.discordUserId);
        if (user) {
          // TODO: Replace with LangService/MessagingLayer for robust message construction and i18n.
          // TODO: Include actual claim timeout duration in the message.
          const claimTimeoutInfo = "a limited time"; // Placeholder
          await user.send(
            `It's your first turn in game \`${game.id}\` for season \`${seasonId}\`!\n` +
            `The turn type is: **${initialTurnType}**.\n` +
            `Please type \`/ready\` in this DM to claim your turn. You have ${claimTimeoutInfo} to claim it.`
          );
          console.log(`Successfully sent initial turn offer DM to player ${player.id} (${player.discordUserId}) for game ${game.id}, turn ${newTurn.id}`);
        } else {
          console.error(`Could not find Discord user with ID ${player.discordUserId} (Player internal ID: ${player.id}) to send initial turn offer for game ${game.id}.`);
          // The turn is still created and offered. Admin/system might need alerting.
        }
      } catch (dmError) {
        console.error(`Failed to send initial turn offer DM to player ${player.id} (${player.discordUserId}) for game ${game.id}:`, dmError);
        // Log error, but proceed as turn is programmatically offered.
      }
      
      // TODO: Schedule claim timeout using TaskSchedulerService (relates to Task 14/15)
      // Example: this.taskSchedulerService.scheduleTurnClaimTimeout(newTurn.id, configuredClaimDuration);

      return { success: true, turn: newTurn };
    } catch (error) {
      console.error(`Error in TurnService.offerInitialTurn for game ${game.id}, player ${player.id}:`, error);
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
      console.error(`Error in TurnService.claimTurn for turn ${turnId}, player ${playerId}:`, error);
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
        const isGameCompleted = await checkGameCompletion(existingTurn.gameId, this.prisma);
        
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
          
          // Check if the season is now completed after this game completion
          try {
            const seasonCompletionResult = await checkSeasonCompletion(existingTurn.game.seasonId, this.prisma);
            if (seasonCompletionResult.completed) {
              console.log(`Season ${existingTurn.game.seasonId} marked as COMPLETED after game ${existingTurn.gameId} completion`);
            }
          } catch (seasonCompletionError) {
            console.error(`Error checking season completion for season ${existingTurn.game.seasonId} after game ${existingTurn.gameId}:`, seasonCompletionError);
            // Don't fail the turn submission if season completion check fails
          }
        }
      } catch (gameCompletionError) {
        console.error(`Error checking game completion for game ${existingTurn.gameId} after turn ${turnId}:`, gameCompletionError);
        // Don't fail the turn submission if game completion check fails
      }

      return { success: true, turn: updatedTurn };
    } catch (error) {
      console.error(`Error in TurnService.submitTurn for turn ${turnId}, player ${playerId}:`, error);
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
      console.error(`Error in TurnService.dismissOffer for turn ${turnId}:`, error);
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
        const isGameCompleted = await checkGameCompletion(existingTurn.gameId, this.prisma);
        
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
          
          // Check if the season is now completed after this game completion
          try {
            const seasonCompletionResult = await checkSeasonCompletion(existingTurn.game.seasonId, this.prisma);
            if (seasonCompletionResult.completed) {
              console.log(`Season ${existingTurn.game.seasonId} marked as COMPLETED after game ${existingTurn.gameId} completion`);
            }
          } catch (seasonCompletionError) {
            console.error(`Error checking season completion for season ${existingTurn.game.seasonId} after game ${existingTurn.gameId}:`, seasonCompletionError);
            // Don't fail the turn skip if season completion check fails
          }
        }
      } catch (gameCompletionError) {
        console.error(`Error checking game completion for game ${existingTurn.gameId} after turn ${turnId}:`, gameCompletionError);
        // Don't fail the turn skip if game completion check fails
      }

      return { success: true, turn: updatedTurn };
    } catch (error) {
      console.error(`Error in TurnService.skipTurn for turn ${turnId}:`, error);
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

      console.log(`Turn ${turnId} offered to player ${playerId}, status updated to OFFERED`);
      return { success: true, turn: updatedTurn };
    } catch (error) {
      console.error(`Error in TurnService.offerTurn for turn ${turnId}, player ${playerId}:`, error);
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
      console.error(`Error in TurnService.updateTurnStatus for turn ${turnId}:`, error);
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
      console.error(`Error in TurnService.getTurn for turn ${turnId}:`, error);
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
      console.error(`Error in TurnService.getTurnsForGame for game ${gameId}:`, error);
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
      console.error(`Error in TurnService.getTurnsForPlayer for player ${playerId}:`, error);
      return [];
    }
  }
} 