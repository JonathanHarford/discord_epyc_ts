import { Game, Player, Prisma, PrismaClient } from '@prisma/client';
import { humanId } from 'human-id';
import { DateTime } from 'luxon';
import { nanoid } from 'nanoid';

import { GameService } from './GameService.js';
import { SchedulerService } from './SchedulerService.js';
import { SeasonTurnService } from './SeasonTurnService.js';
import { MessageHelpers, MessageInstruction } from '../messaging/index.js';
import { formatTimeRemaining, parseDuration } from '../utils/datetime.js';

// Define a more specific return type for findSeasonById, including config and player count
type SeasonDetails = Prisma.SeasonGetPayload<{
  include: {
    config: true;
    _count: {
      select: { players: true }
    }
  }
}>

// Possible statuses for a season before activation
const PRE_ACTIVATION_SEASON_STATUSES = ['SETUP', 'OPEN', 'PENDING_START']; // Ordered by intended flow: SETUP -> OPEN -> PENDING_START -> ACTIVE

// Define a type for the Prisma transaction client
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export class SeasonService {
  private prisma: PrismaClient;
  private turnService: SeasonTurnService;
  private schedulerService: SchedulerService; // ADDED: SchedulerService instance
  private gameService: GameService; // ADDED: GameService instance

  // Inject PrismaClient instance, SeasonTurnService, SchedulerService, and GameService
  constructor(prisma: PrismaClient, turnService: SeasonTurnService, schedulerService: SchedulerService, gameService: GameService) { // MODIFIED: Added gameService
    this.prisma = prisma;
    this.turnService = turnService;
    this.schedulerService = schedulerService; // ADDED: Assign schedulerService
    this.gameService = gameService; // ADDED: Assign gameService
  }

  /**
   * Creates a new season, including its configuration, within a database transaction.
   * Ensures the creator player exists before proceeding.
   * @param options The details for the new season.
   * @returns A MessageInstruction object indicating success or failure with a message key and data.
   */
  async createSeason(options: NewSeasonOptions): Promise<MessageInstruction> {
    console.log('SeasonService.createSeason DB logic executing with options:', options);

    // Validate minPlayers and maxPlayers
    if (options.minPlayers != null && options.maxPlayers != null && options.maxPlayers < options.minPlayers) {
      console.warn(`Validation Error: maxPlayers (${options.maxPlayers}) cannot be less than minPlayers (${options.minPlayers}).`);
      return MessageHelpers.validationError(
        'season_create_error_min_max_players',
        { minPlayers: options.minPlayers, maxPlayers: options.maxPlayers }
      );
    }

    try {
      // 1. Find the creator Player using their internal Player ID
      const creator = await this.prisma.player.findUnique({
        where: { id: options.creatorPlayerId },
      });

      if (!creator) {
        console.error(`Creator player with Player ID ${options.creatorPlayerId} not found.`);
        return MessageHelpers.commandError(
          'season_create_error_creator_player_not_found', // Updated key
          { playerId: options.creatorPlayerId }
        );
      }

      // Use a transaction to ensure atomicity: create config and season together
      const newSeasonWithConfig = await this.prisma.$transaction(async (tx) => {
        // 2. Create the SeasonConfig record
        const configData: Prisma.SeasonConfigCreateInput = {
          id: nanoid(), // Use nanoid directly
          ...(options.turnPattern && { turnPattern: options.turnPattern }),
          ...(options.claimTimeout && { claimTimeout: options.claimTimeout }),
          ...(options.writingTimeout && { writingTimeout: options.writingTimeout }),
          ...(options.drawingTimeout && { drawingTimeout: options.drawingTimeout }),
          ...(options.openDuration && { openDuration: options.openDuration }),
          ...(options.minPlayers && { minPlayers: options.minPlayers }),
          ...(options.maxPlayers && { maxPlayers: options.maxPlayers }),
        };
        const newConfig = await tx.seasonConfig.create({ data: configData });

        // 3. Create the Season record
        const seasonData: Prisma.SeasonCreateInput = {
          id: humanId({ separator: '-', capitalize: false }), // Use human-id for season ID
          status: 'OPEN', 
          creator: {
            connect: { id: creator.id },
          },
          config: {
            connect: { id: newConfig.id },
          },
          // Store origin information for announcements
          ...(options.guildId && { guildId: options.guildId }),
          ...(options.channelId && { channelId: options.channelId }),
        };

        const newSeason = await tx.season.create({
          data: seasonData,
          include: { config: true }, 
        });

        return newSeason;
      });

      // Schedule activation job if openDuration is set
      if (newSeasonWithConfig.config.openDuration) {
        const luxonDuration = parseDuration(newSeasonWithConfig.config.openDuration);
        if (luxonDuration && luxonDuration.as('milliseconds') > 0) { // Ensure duration is positive
          const activationTime = DateTime.now().plus(luxonDuration).toJSDate();
          
          // MODIFIED: Use SchedulerService
          const jobId = `season-activation-${newSeasonWithConfig.id}`; // Create a unique job ID
          const jobScheduled = await this.schedulerService.scheduleJob(
            jobId,
            activationTime,
            async () => { // The callback function
              console.log(`Scheduled job (via SchedulerService) running for season ${newSeasonWithConfig.id} (open_duration timeout).`);
              await this.handleOpenDurationTimeout(newSeasonWithConfig.id);
              // No need to delete job here, SchedulerService handles it for one-time jobs
            },
            undefined, // jobData
            'season-activation' // jobType
          );

          if (jobScheduled) {
            console.log(`SeasonService.createSeason: Scheduled activation (via SchedulerService) for season ${newSeasonWithConfig.id} at ${activationTime.toISOString()} with job ID ${jobId}`);
          } else {
            console.warn(`SeasonService.createSeason: Failed to schedule activation job for season ${newSeasonWithConfig.id} using SchedulerService.`);
            // Consider if an error should be returned to the user or if a warning is sufficient
          }
        } else {
          console.warn(`SeasonService.createSeason: Invalid or zero openDuration format for season ${newSeasonWithConfig.id}: '${newSeasonWithConfig.config.openDuration}'. Job not scheduled.`);
        }
      }

      console.log(`Season (ID: ${newSeasonWithConfig.id}) created successfully in DB.`);
      return MessageHelpers.commandSuccess(
        'season_create_success',
        {
          seasonId: newSeasonWithConfig.id,
          status: newSeasonWithConfig.status,
          openDuration: newSeasonWithConfig.config.openDuration, // Add openDuration for the message
          // Potentially include other relevant details for the success message
        }
      );
    } catch (error) {
      console.error('Error creating season:', error);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P2002 is the Prisma error code for unique constraint violation
        if (error.code === 'P2002') {
          const target = error.meta?.target as string[] | undefined;
          // if (target && target.includes('name')) { // Check if the unique constraint was on the name field
          //   return {
          //     type: 'error',
          //     key: 'season_create_error_name_taken',
          //     data: { name: options.name },
          //   };
          // }
          // Handle other unique constraint violations if necessary
          return {
            type: 'error',
            key: 'season_create_error_prisma_unique_constraint',
            data: { errorCode: error.code, target: target },
          };
        }
        // Handle other known Prisma errors
        return {
          type: 'error',
          key: 'season_create_error_prisma',
          data: { errorCode: error.code, message: error.message },
        };
      }
      // Handle other unexpected errors
      return {
        type: 'error',
        key: 'season_create_error_unknown',
        data: { message: (error instanceof Error) ? error.message : 'An unknown error occurred' },
      };
    }
  }

  /**
   * Finds a season by its unique ID, including its configuration and current player count.
   * @param seasonId The unique ID of the season.
   * @returns The Season object with config and player count, or null if not found.
   */
  async findSeasonById(seasonId: string): Promise<SeasonDetails | null> {
    console.log(`SeasonService.findSeasonById: Searching for season with ID: ${seasonId}`);
    try {
      const season = await this.prisma.season.findUnique({
        where: { id: seasonId },
        include: {
          config: true, // Include related config
          _count: { // Include count of related players
            select: { players: true },
          },
        },
      });

      if (season) {
        console.log(`SeasonService.findSeasonById: Found season with ID: ${season.id}`);
      } else {
        console.log(`SeasonService.findSeasonById: Season with ID ${seasonId} not found.`);
      }
      return season;
    } catch (error) {
      console.error(`SeasonService.findSeasonById: Error finding season ${seasonId}:`, error);
      // Consider re-throwing or returning a specific error state
      throw error; // Rethrow for now, command handler should catch
    }
  }

  /**
   * Adds a player (by their internal Player ID) to a specified season.
   * Handles player creation if they don't exist, checks season status, max player limit, and if player already joined.
   * @param playerId The internal ID of the player trying to join.
   * @param seasonId The ID of the season to join.
   * @returns An MessageInstruction object indicating success or failure reason.
   */
  async addPlayerToSeason(playerId: string, seasonId: string): Promise<MessageInstruction> {
    console.log(`SeasonService.addPlayerToSeason: Attempting to add player ${playerId} to season ${seasonId}`);

    return await this.prisma.$transaction(async (tx) => {
      // 0. Verify the player exists
      const player = await tx.player.findUnique({
        where: { id: playerId },
      });

      if (!player) {
        console.log(`SeasonService.addPlayerToSeason: Player ${playerId} not found.`);
        return { type: 'error', key: 'messages.season.joinPlayerNotFound', data: { playerId } };
      }

      // 1. Find the season (and check if it exists)
      const season = await tx.season.findUnique({
        where: { id: seasonId },
        include: { config: true, _count: { select: { players: true } } },
      });

      if (!season) {
        console.log(`SeasonService.addPlayerToSeason: Season ${seasonId} not found.`);
        return { type: 'error', key: 'messages.season.joinSeasonNotFound' };
      }

      // 2. Check if season is open for joining (Define valid statuses)
      const validJoinStatuses = ['OPEN']; 
      if (!validJoinStatuses.includes(season.status)) {
        console.log(`SeasonService.addPlayerToSeason: Season ${seasonId} status (${season.status}) is not valid for joining.`);
        return { type: 'error', key: 'messages.season.joinNotOpen', data: { status: season.status /*, seasonName: season.name */ } };
      }

      // 3. Check max player limit
      const maxPlayers = season.config.maxPlayers;
      const currentPlayerCount = season._count.players;
      if (maxPlayers !== null && currentPlayerCount >= maxPlayers) {
          console.log(`SeasonService.addPlayerToSeason: Season ${seasonId} is full (${currentPlayerCount}/${maxPlayers}).`);
          return { type: 'error', key: 'messages.season.joinFull', data: { currentPlayers: currentPlayerCount, maxPlayers: maxPlayers /*, seasonName: season.name */ } };
      }

      // Player finding/creation logic is removed from here. Assumes valid playerId is passed.

      // 4. Check if player is already in the season
      const existingJoin = await tx.playersOnSeasons.findUnique({
        where: {
          playerId_seasonId: {
            playerId: player.id, // Use the validated player's ID
            seasonId: seasonId,
          },
        },
      });

      if (existingJoin) {
        console.log(`SeasonService.addPlayerToSeason: Player ${playerId} (ID: ${player.id}) already in season ${seasonId}.`);
        return { type: 'error', key: 'messages.season.joinAlreadyJoined', data: { /* seasonName: season.name */ } };
      }

      // 5. Add player to season using the transaction client (tx)
      await tx.playersOnSeasons.create({
        data: {
          playerId: player.id,
          seasonId: season.id,
        },
      });
      console.log(`SeasonService.addPlayerToSeason: Player ${player.id} successfully added to season ${seasonId}.`);

      // Recalculate player count *within the current transaction*
      const updatedPlayerCount = await tx.playersOnSeasons.count({
        where: { seasonId: season.id },
      });
      console.log(`SeasonService.addPlayerToSeason: Updated player count for season ${seasonId} is ${updatedPlayerCount}.`);

      // 6. Check if max players reached after adding this player
      if (maxPlayers !== null && updatedPlayerCount >= maxPlayers) {
        console.log(`SeasonService.addPlayerToSeason: Max players reached for season ${seasonId} (${updatedPlayerCount}/${maxPlayers}). Triggering activation.`);
        
        try {
          // Pass the current transaction client (tx) to activateSeason
          const activationResult = await this.activateSeason(season.id, { triggeredBy: 'max_players', playerCount: updatedPlayerCount }, tx);
          if (activationResult.type === 'success') {
            console.log(`SeasonService.addPlayerToSeason: Season ${seasonId} activated successfully due to max players.`);
            // Return the activation success message directly
            return activationResult;
          } else {
            console.error(`SeasonService.addPlayerToSeason: Activation failed for season ${seasonId} after max players reached. Error: ${activationResult.key}`, activationResult.data);
            // Return the activation error message
            // This case should be handled carefully: player was added, but activation failed.
            // For now, we return the activation error, but this might need more robust error handling or rollback.
            return activationResult;
          }
        } catch (activationError) {
          console.error(`SeasonService.addPlayerToSeason: Unexpected error during activation for season ${seasonId}:`, activationError);
          // Return a user-friendly error message
          return {
            type: 'error' as const,
            key: 'messages.season.joinSuccessButActivationFailed',
            data: { seasonId, playerCount: updatedPlayerCount }
          };
        }
      }

      // Player joined, but season not yet activated by max players
      // Calculate timing information for the success message
      let timeRemaining = 'unknown';
      let playersNeeded = 0;
      let activationTrigger = 'unknown';

      // Determine primary activation trigger and calculate appropriate values
      if (maxPlayers !== null && season.config.openDuration) {
        // Both triggers exist - determine which is more likely to trigger first
        const playersToMax = maxPlayers - updatedPlayerCount;
        if (playersToMax <= 2) { // Close to max players
          activationTrigger = 'max_players';
          playersNeeded = playersToMax;
        } else {
          activationTrigger = 'open_duration';
          // Calculate time remaining from season creation (approximation)
          const luxonDuration = parseDuration(season.config.openDuration);
          if (luxonDuration && luxonDuration.as('milliseconds') > 0) {
            timeRemaining = formatTimeRemaining(luxonDuration);
          }
        }
      } else if (maxPlayers !== null) {
        // Only max players trigger
        activationTrigger = 'max_players';
        playersNeeded = maxPlayers - updatedPlayerCount;
      } else if (season.config.openDuration) {
        // Only open duration trigger
        activationTrigger = 'open_duration';
        const luxonDuration = parseDuration(season.config.openDuration);
        if (luxonDuration && luxonDuration.as('milliseconds') > 0) {
          timeRemaining = formatTimeRemaining(luxonDuration);
        }
      }

      // Choose appropriate message key based on activation trigger
      let messageKey = 'messages.season.joinSuccess';
      if (activationTrigger === 'max_players') {
        messageKey = 'messages.season.joinSuccessPlayersNeeded';
      } else if (activationTrigger === 'open_duration') {
        messageKey = 'messages.season.joinSuccessTimeRemaining';
      }

      return {
        type: 'success',
        key: messageKey,
        data: {
          seasonId: season.id,
          currentPlayers: updatedPlayerCount,
          maxPlayers: maxPlayers,
          timeRemaining: timeRemaining,
          playersNeeded: playersNeeded,
          activationTrigger: activationTrigger,
        },
      };
    });
  }

  /**
   * Activates a season: changes its status to ACTIVE, creates initial games, and offers turns.
   * Can be triggered by max_players being reached or open_duration timeout.
   * Uses an optional Prisma transaction client if provided.
   * @param seasonId The ID of the season to activate.
   * @param activationParams Optional parameters indicating the trigger and player count.
   * @param tx Optional Prisma transaction client.
   * @returns A MessageInstruction indicating success or failure.
   */
  async activateSeason(
    seasonId: string,
    activationParams?: { triggeredBy?: 'max_players' | 'open_duration_timeout'; playerCount?: number },
    tx?: PrismaTransactionClient // Optional transaction client
  ): Promise<MessageInstruction> {
    const triggeredBy = activationParams?.triggeredBy || 'unknown';
    console.log(`SeasonService.activateSeason: Attempting to activate season ${seasonId}, triggered by: ${triggeredBy}`);

    // Define a function to perform the activation logic, which can be wrapped in a transaction or use an existing one.
    const activationLogic = async (prismaClient: PrismaTransactionClient | PrismaClient): Promise<MessageInstruction> => {
      // 1. Fetch the season and its configuration
      const season = await prismaClient.season.findUnique({
        where: { id: seasonId },
        include: {
          config: true,
          players: { // Fetch players linked to the season
            include: {
              player: true, // Include the actual player details
            },
          },
        },
      });

      if (!season) {
        console.error(`SeasonService.activateSeason: Season ${seasonId} not found.`);
        return { type: 'error' as const, key: 'season_activate_error_not_found', data: { seasonId } };
      }

      // 2. Check if season is already active or in a non-activatable state
      if (season.status === 'ACTIVE' || season.status === 'COMPLETED' || season.status === 'CANCELLED') {
        console.warn(`SeasonService.activateSeason: Season ${seasonId} is already ${season.status} and cannot be activated again.`);
        return { type: 'error' as const, key: 'season_activate_error_already_active_or_completed', data: { seasonId, status: season.status } };
      }
      
      // Check if the season is in a pre-activation state
      if (!PRE_ACTIVATION_SEASON_STATUSES.includes(season.status)) {
        console.warn(`SeasonService.activateSeason: Season ${seasonId} has an invalid status '${season.status}' for activation.`);
        return { type: 'error' as const, key: 'season_activate_error_invalid_status', data: { seasonId, status: season.status } };
      }

      // 3. Determine player count for checks (use actual count from DB within this transaction)
      const playersInSeason = season.players.map(pOnS => pOnS.player);
      const actualPlayerCountInTx = playersInSeason.length;
      console.log(`SeasonService.activateSeason: Season ${seasonId} has ${actualPlayerCountInTx} players currently in this transaction.`);

      // 4. Check min/max player conditions based on trigger
      const { minPlayers } = season.config;

      if (triggeredBy === 'open_duration_timeout') {
        if (minPlayers !== null && actualPlayerCountInTx < minPlayers) {
          console.warn(`SeasonService.activateSeason: Season ${seasonId} (timeout) does not meet min player requirement (${actualPlayerCountInTx}/${minPlayers}). Cancelling season.`);
          await prismaClient.season.update({
            where: { id: seasonId },
            data: { status: 'CANCELLED' }, // Or a new status like 'ABORTED_MIN_PLAYERS'
          });
          const errorResult = { type: 'error' as const, key: 'season_activate_error_min_players_not_met_on_timeout', data: { seasonId, currentPlayers: actualPlayerCountInTx, minPlayers } };
          await this.sendSeasonActivationFailureNotification(seasonId, errorResult, 'open_duration_timeout');
          return errorResult;
        }
      } else if (triggeredBy === 'max_players') {
        // If triggered by max_players, we should have at least minPlayers and the season should be ready for activation
        // The actual validation is that we have enough players to start the season
        if (minPlayers !== null && actualPlayerCountInTx < minPlayers) {
          console.warn(`SeasonService.activateSeason: Season ${seasonId} (max_players trigger) does not meet min player requirement (${actualPlayerCountInTx}/${minPlayers}). Activation aborted.`);
          const errorResult = { type: 'error' as const, key: 'season_activate_error_min_players_not_met_on_max_players', data: { seasonId, currentPlayers: actualPlayerCountInTx, minPlayers } };
          await this.sendSeasonActivationFailureNotification(seasonId, errorResult, 'max_players');
          return errorResult;
        }
      }
      
      if (actualPlayerCountInTx === 0) {
        // Decide how to handle zero players. For now, let's assume minPlayers handles this.
        // If minPlayers is 0 or null, this might be valid.
        // If minPlayers > 0, the 'open_duration_timeout' check above should catch it.
        console.warn(`SeasonService.activateSeason: Season ${seasonId} is being activated with zero players. Proceeding if minPlayers allows.`);
        if (minPlayers !== null && minPlayers > 0) {
           console.error(`SeasonService.activateSeason: Season ${seasonId} activation with 0 players but minPlayers is ${minPlayers}. This should have been caught.`);
           // This indicates a logic flaw if reached, as minPlayers check should prevent this.
           // For robustness, update status to CANCELLED if somehow reached.
            await prismaClient.season.update({
                where: { id: seasonId },
                data: { status: 'CANCELLED' },
            });
           const errorResult = { type: 'error' as const, key: 'season_activate_error_zero_players_violates_minplayers', data: { seasonId, minPlayers } };
           await this.sendSeasonActivationFailureNotification(seasonId, errorResult, triggeredBy || 'unknown');
           return errorResult;
        }
      }

      // 5. Update season status to ACTIVE
      await prismaClient.season.update({
        where: { id: seasonId },
        data: { status: 'ACTIVE' },
      });
      console.log(`SeasonService.activateSeason: Season ${seasonId} status updated to ACTIVE.`);

      // 6. Create games using GameService
      let createdGamesAndPlayers: { game: Game; player: Player }[] = [];
      if (actualPlayerCountInTx > 0) { // Only create games if there are players
        const gameCreationResult = await this.gameService.createGamesForSeason(seasonId, prismaClient);
        
        if (!gameCreationResult.success) {
          console.error(`SeasonService.activateSeason: Failed to create games for season ${seasonId}. Error: ${gameCreationResult.error}`);
          const errorResult = MessageHelpers.commandError(
            'messages.season.activateErrorGameCreation',
            { seasonId, error: gameCreationResult.error }
          );
          await this.sendSeasonActivationFailureNotification(seasonId, errorResult, triggeredBy || 'unknown');
          return errorResult;
        }

        // Map created games to players (one game per player)
        const createdGames = gameCreationResult.games || [];
        createdGamesAndPlayers = season.players.map((playerOnSeason, index) => ({
          game: createdGames[index],
          player: playerOnSeason.player
        }));
        
        console.log(`SeasonService.activateSeason: Created ${createdGamesAndPlayers.length} games for season ${seasonId}.`);
      }

      // 7. Offer initial turns for each game-player pair
      if (createdGamesAndPlayers.length > 0) {
        const turnOfferResults = await Promise.all(createdGamesAndPlayers.map(async ({ game, player }) => {
          // 'player' is directly available here.
          // 'game' is the created game.
          // 'game.seasonId' is available as it's a scalar field on Game.
          return await this.turnService.offerInitialTurn(game, player, game.seasonId, prismaClient);
        }));
        
        turnOfferResults.forEach(result => {
          if (!result.success) {
            // Assuming result structure is { success: boolean, error?: string | object }
            console.error(`SeasonService.activateSeason: Failed to offer initial turn for a game in season ${seasonId}. Error: ${result.error || 'Unknown error'}`);
          }
        });
        console.log(`SeasonService.activateSeason: Initial turns offering process completed for ${createdGamesAndPlayers.length} games in season ${seasonId}.`);
      }

      // Cancel the scheduled open_duration job if it exists, as the season is now active.
      const activationJobId = `season-activation-${seasonId}`;
      const wasCancelled = await this.schedulerService.cancelJob(activationJobId);
      if (wasCancelled) {
        console.log(`SeasonService.activateSeason: Canceled scheduled activation job '${activationJobId}' for season ${seasonId}.`);
      } else {
        console.log(`SeasonService.activateSeason: No scheduled activation job found with ID '${activationJobId}' for season ${seasonId} to cancel.`);
      }
      
      const successResult = {
        type: 'success' as const, // Ensure type is literal for MessageInstruction
        key: 'messages.season.activateSuccess',
        data: {
          seasonId,
          status: 'ACTIVE',
          gamesCreated: createdGamesAndPlayers.length,
          playersInSeason: actualPlayerCountInTx,
        },
      };

      // Note: No longer sending activation success notifications per user requirements
      // Only people who should be alerted are those being asked for their initiating turns

      return successResult;
    };

    // Execute the logic: if a transaction client 'tx' is provided, use it. Otherwise, create a new transaction.
    if (tx) {
      console.log(`SeasonService.activateSeason: Using provided transaction client for season ${seasonId}.`);
      return await activationLogic(tx);
    } else {
      console.log(`SeasonService.activateSeason: Starting new transaction for season ${seasonId}.`);
      return await this.prisma.$transaction(async (newTx) => await activationLogic(newTx));
    }
  }

  /**
   * Handles the timeout for a season's open_duration.
   * This is intended to be called by the node-schedule job.
   * @param seasonId The ID of the season whose open_duration has expired.
   */
  async handleOpenDurationTimeout(seasonId: string): Promise<void> {
    console.log(`SeasonService.handleOpenDurationTimeout: Handling open_duration timeout for season ${seasonId}.`);
    // Activation due to timeout does not have a prior player count from an addPlayerToSeason call.
    // activateSeason will fetch the current count within its own transaction.
    
    try {
      const result = await this.activateSeason(seasonId, { triggeredBy: 'open_duration_timeout' });
      // No 'tx' is passed here, so activateSeason will create its own transaction.

      if (result.type === 'success') {
        console.log(`SeasonService.handleOpenDurationTimeout: Season ${seasonId} activated successfully by timeout.`);
      } else {
        console.error(`SeasonService.handleOpenDurationTimeout: Failed to activate season ${seasonId} by timeout. Error: ${result.key}`, result.data);
        // If min_players not met, activateSeason already sets status to CANCELLED.
      }
    } catch (error) {
      console.error(`SeasonService.handleOpenDurationTimeout: Unexpected error during season ${seasonId} activation:`, error);
      // activateSeason should handle its own error notifications, but this is an unexpected error outside of activateSeason
      await this.sendSeasonActivationFailureNotification(seasonId, {
        type: 'error' as const,
        key: 'season_activate_error_unexpected',
        data: { 
          seasonId, 
          error: error instanceof Error ? error.message : 'Unknown error',
          triggeredBy: 'open_duration_timeout'
        }
      }, 'open_duration_timeout');
    }
    
    // Remove the job from the map as it has been handled (either successfully or failed activation)
    // activateSeason also tries to remove it, but this is a safeguard.
    // The SchedulerService automatically removes one-time jobs after execution.
    // No explicit cleanup is needed here.
    console.log(`SeasonService.handleOpenDurationTimeout: Job handling complete for season ${seasonId}. SchedulerService will clean up the job.`);
  }

  /**
   * Sends a failure notification when season activation fails.
   * @param seasonId The ID of the season that failed to activate
   * @param activationResult The error result from activateSeason
   * @param triggeredBy How the activation was triggered
   */
  private async sendSeasonActivationFailureNotification(
    seasonId: string,
    activationResult: MessageInstruction,
    triggeredBy: string
  ): Promise<void> {
    try {
             // Get admin user IDs from config
       const { createRequire } = await import('node:module');
       const require = createRequire(import.meta.url);
       const Config = require('../../config/config.json');
       const adminUserIds = Config.developers || [];

      if (adminUserIds.length === 0) {
        console.warn(`SeasonService.sendSeasonActivationFailureNotification: No admin users configured for error notifications`);
        return;
      }

      // Get season details for notification context
      const season = await this.prisma.season.findUnique({
        where: { id: seasonId },
        include: {
          creator: {
            select: {
              name: true,
              discordUserId: true
            }
          },
          _count: {
            select: { players: true }
          }
        }
      });

      // Send DM notifications to all admin users
      if (this.turnService) {
        try {
          const discordClient = (this.turnService as any).discordClient;
          if (discordClient) {
            const notificationPromises = adminUserIds.map(async (adminUserId) => {
              try {
                const adminUser = await discordClient.users.fetch(adminUserId);
                if (adminUser) {
                  const errorMessage = MessageHelpers.dmNotification(
                    'messages.season.activationFailureAdminNotification',
                    adminUserId,
                    {
                      seasonId,
                      errorKey: activationResult.key,
                      errorData: JSON.stringify(activationResult.data, null, 2),
                      triggeredBy,
                      creatorName: season?.creator?.name || 'Unknown',
                      creatorDiscordId: season?.creator?.discordUserId || 'Unknown',
                      playerCount: season?._count?.players || 0,
                      timestamp: new Date().toISOString()
                    }
                  );

                  const { MessageAdapter } = await import('../messaging/MessageAdapter.js');
                  await MessageAdapter.processInstruction(errorMessage, undefined, 'en', discordClient);
                  
                  console.log(`SeasonService.sendSeasonActivationFailureNotification: Error notification sent to admin ${adminUserId} for season ${seasonId}`);
                }
              } catch (adminDmError) {
                console.error(`SeasonService.sendSeasonActivationFailureNotification: Failed to send DM to admin ${adminUserId} for season ${seasonId}:`, adminDmError);
              }
            });

            await Promise.allSettled(notificationPromises);
          }
        } catch (clientError) {
          console.error(`SeasonService.sendSeasonActivationFailureNotification: Error accessing Discord client for season ${seasonId}:`, clientError);
        }
      }

      // Also notify the season creator if the season exists and it's not a min_players issue
      if (season && season.creator && !activationResult.key.includes('min_players')) {
        try {
          const discordClient = (this.turnService as any).discordClient;
          if (discordClient) {
            const user = await discordClient.users.fetch(season.creator.discordUserId);
            if (user) {
              const creatorMessage = MessageHelpers.dmNotification(
                'messages.season.activationFailureCreatorNotification',
                season.creator.discordUserId,
                {
                  seasonId,
                  creatorName: season.creator.name,
                  errorType: activationResult.key,
                  triggeredBy
                }
              );

              const { MessageAdapter } = await import('../messaging/MessageAdapter.js');
              await MessageAdapter.processInstruction(creatorMessage, undefined, 'en', discordClient);
              
              console.log(`SeasonService.sendSeasonActivationFailureNotification: Creator notification sent to ${season.creator.discordUserId} for season ${seasonId}`);
            }
          }
        } catch (creatorDmError) {
          console.error(`SeasonService.sendSeasonActivationFailureNotification: Failed to send DM to creator for season ${seasonId}:`, creatorDmError);
        }
      }

    } catch (error) {
      console.error(`SeasonService.sendSeasonActivationFailureNotification: Error sending failure notification for season ${seasonId}:`, error);
    }
  }

  /**
   * Terminates a season by setting its status to TERMINATED.
   * This is an admin action that forcibly ends a season regardless of its current state.
   * @param seasonId The ID of the season to terminate.
   * @returns A MessageInstruction object indicating success or failure.
   */
  async terminateSeason(seasonId: string): Promise<MessageInstruction> {
    console.log(`SeasonService.terminateSeason: Attempting to terminate season ${seasonId}`);

    try {
      // First, check if the season exists
      const existingSeason = await this.prisma.season.findUnique({
        where: { id: seasonId },
        include: {
          config: true,
          _count: {
            select: { players: true, games: true }
          }
        }
      });

      if (!existingSeason) {
        console.error(`SeasonService.terminateSeason: Season ${seasonId} not found.`);
        return MessageHelpers.commandError(
          'messages.season.adminTerminateErrorNotFound',
          { seasonId }
        );
      }

      // Check if season is already terminated
      if (existingSeason.status === 'TERMINATED') {
        console.warn(`SeasonService.terminateSeason: Season ${seasonId} is already terminated.`);
        return MessageHelpers.commandError(
          'messages.season.adminTerminateErrorAlreadyTerminated',
          { seasonId }
        );
      }

      // Perform the termination within a transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Update season status to TERMINATED
        const terminatedSeason = await tx.season.update({
          where: { id: seasonId },
          data: { 
            status: 'TERMINATED',
            updatedAt: new Date()
          },
          include: {
            config: true,
            _count: {
              select: { players: true, games: true }
            }
          }
        });

        // Update all related games to TERMINATED status as well
        await tx.game.updateMany({
          where: { seasonId: seasonId },
          data: { 
            status: 'TERMINATED',
            updatedAt: new Date()
          }
        });

        // Cancel any scheduled jobs related to this season
        const activationJobId = `season-activation-${seasonId}`;
        const wasCancelled = await this.schedulerService.cancelJob(activationJobId);
        if (wasCancelled) {
          console.log(`SeasonService.terminateSeason: Canceled scheduled activation job '${activationJobId}' for season ${seasonId}.`);
        }

        return terminatedSeason;
      });

      console.log(`SeasonService.terminateSeason: Season ${seasonId} terminated successfully.`);
      return MessageHelpers.commandSuccess(
        'messages.season.adminTerminateSuccess',
        {
          seasonId: result.id,
          previousStatus: existingSeason.status,
          playerCount: result._count.players,
          gameCount: result._count.games
        }
      );

    } catch (error) {
      console.error(`SeasonService.terminateSeason: Error terminating season ${seasonId}:`, error);
      
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return MessageHelpers.commandError(
          'messages.season.adminTerminateErrorDatabase',
          { 
            seasonId, 
            errorCode: error.code, 
            message: error.message 
          }
        );
      }

      return MessageHelpers.commandError(
        'messages.season.adminTerminateErrorUnknown',
        { 
          seasonId, 
          message: (error instanceof Error) ? error.message : 'An unknown error occurred' 
        }
      );
    }
  }

  /**
   * List all seasons, optionally filtered by status
   * @param statusFilter Optional status to filter by
   * @returns A MessageInstruction with the list of seasons
   */
  async listSeasons(statusFilter?: string): Promise<MessageInstruction> {
    console.log(`SeasonService.listSeasons: Listing seasons${statusFilter ? ` with status ${statusFilter}` : ''}`);
    
    try {
      // Filter out TERMINATED seasons unless specifically requested
      const whereClause = statusFilter 
        ? { status: statusFilter } 
        : { status: { not: 'TERMINATED' } };
      
      const seasons = await this.prisma.season.findMany({
        where: whereClause,
        include: {
          config: true,
          _count: {
            select: {
              players: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Filter out terminated seasons and format the seasons data as a string
      const activeSeasonsCount = seasons.filter(season => season.status !== 'TERMINATED').length;
      const seasonsDetails = seasons.length === 0 
        ? 'No seasons found.'
        : seasons.map(season => {
            const createdDate = new Date(season.createdAt).toISOString().split('T')[0]; // YYYY-MM-DD format
            
            // Calculate start time if openDuration is available
            let startTimeStr = '';
            if (season.config.openDuration && season.status === 'SETUP') {
              try {
                const duration = parseDuration(season.config.openDuration);
                if (duration) {
                  const startTime = new Date(season.createdAt.getTime() + duration.as('milliseconds'));
                  startTimeStr = ` Start:${startTime.toISOString().split('T')[0]}`;
                }
              } catch (error) {
                console.warn(`Failed to parse openDuration for season ${season.id}:`, error);
              }
            }
            
            return `${createdDate} ${season.id} ${season.status} Players:${season._count.players}/${season.config.minPlayers}-${season.config.maxPlayers}${startTimeStr}`;
          }).join('\n');

      // Use active seasons count for title unless filtering for TERMINATED specifically
      const displayCount = statusFilter === 'TERMINATED' ? seasons.length : activeSeasonsCount;
      const statusDescription = statusFilter 
        ? `Showing seasons with status: **${statusFilter}**`
        : 'Showing all active seasons';

      return MessageHelpers.embedMessage(
        'success',
        'embeds.admin.listSeasonsSuccess',
        {
          totalCount: displayCount,
          statusFilter: statusDescription,
          seasonsDetails: seasonsDetails
        },
        true // Admin messages should be ephemeral
      );
    } catch (error) {
      console.error('Error in SeasonService.listSeasons:', error);
      return MessageHelpers.embedMessage(
        'error',
        'messages.season.adminListSeasonsError',
        { error: error instanceof Error ? error.message : 'Unknown error' },
        true // Admin error messages should be ephemeral
      );
    }
  }

  /**
   * Retrieves and formats the complete results of a completed season.
   * This includes all games and their turn sequences for announcement purposes.
   * @param seasonId The ID of the completed season
   * @returns Formatted season results or null if season not found/not completed
   */
  async getSeasonCompletionResults(seasonId: string): Promise<SeasonCompletionResults | null> {
    console.log(`SeasonService.getSeasonCompletionResults: Retrieving results for season ${seasonId}`);
    
    try {
      // Get the season with all its games and turns
      const season = await this.prisma.season.findUnique({
        where: { id: seasonId },
        include: {
          config: true,
          creator: {
            select: {
              name: true,
              discordUserId: true
            }
          },
          games: {
            include: {
              turns: {
                include: {
                  player: {
                    select: {
                      id: true,
                      name: true,
                      discordUserId: true
                    }
                  }
                },
                orderBy: {
                  turnNumber: 'asc'
                }
              }
            },
            orderBy: {
              createdAt: 'asc' // Order games by creation time
            }
          },
          players: {
            include: {
              player: {
                select: {
                  id: true,
                  name: true,
                  discordUserId: true
                }
              }
            }
          }
        }
      });

      if (!season) {
        console.error(`SeasonService.getSeasonCompletionResults: Season ${seasonId} not found`);
        return null;
      }

      if (season.status !== 'COMPLETED') {
        console.warn(`SeasonService.getSeasonCompletionResults: Season ${seasonId} is not completed (status: ${season.status})`);
        return null;
      }

      // Format the games and their turn sequences
      const formattedGames: FormattedGame[] = season.games.map((game, index) => {
        const gameNumber = index + 1;
        
        // Filter and format turns that are completed or skipped
        const completedTurns = game.turns
          .filter(turn => turn.status === 'COMPLETED' || turn.status === 'SKIPPED')
          .map(turn => ({
            turnNumber: turn.turnNumber,
            type: turn.type as 'WRITING' | 'DRAWING',
            status: turn.status as 'COMPLETED' | 'SKIPPED',
            playerName: turn.player?.name || 'Unknown Player',
            playerDiscordId: turn.player?.discordUserId || '',
            content: turn.status === 'COMPLETED' 
              ? (turn.type === 'WRITING' ? turn.textContent : '[Image]')
              : '[Skipped]',
            createdAt: turn.createdAt,
            completedAt: turn.completedAt
          }));

        return {
          gameNumber,
          gameId: game.id,
          status: game.status,
          turns: completedTurns,
          completedAt: game.completedAt
        };
      });

      // Calculate season duration and completion stats
      const totalTurns = formattedGames.reduce((sum, game) => sum + game.turns.length, 0);
      const completedTurns = formattedGames.reduce((sum, game) => 
        sum + game.turns.filter(turn => turn.status === 'COMPLETED').length, 0
      );
      
      const seasonDuration = season.updatedAt.getTime() - season.createdAt.getTime();
      const daysElapsed = Math.ceil(seasonDuration / (1000 * 60 * 60 * 24));

      const results: SeasonCompletionResults = {
        seasonId: season.id,
        seasonStatus: season.status,
        createdAt: season.createdAt,
        completedAt: season.updatedAt,
        daysElapsed,
        totalGames: season.games.length,
        totalPlayers: season.players.length,
        totalTurns,
        completedTurns,
        completionPercentage: totalTurns > 0 ? Math.round((completedTurns / totalTurns) * 100) : 0,
        games: formattedGames,
        creator: {
          name: season.creator.name,
          discordUserId: season.creator.discordUserId
        }
      };

      console.log(`SeasonService.getSeasonCompletionResults: Successfully formatted results for season ${seasonId} with ${results.totalGames} games and ${results.totalTurns} turns`);
      return results;

    } catch (error) {
      console.error(`SeasonService.getSeasonCompletionResults: Error retrieving results for season ${seasonId}:`, error);
      return null;
    }
  }

  /**
   * Creates a MessageInstruction for season completion announcement.
   * This method formats the season results into a Discord-ready announcement message.
   * @param seasonResults The formatted season completion results
   * @returns MessageInstruction for the announcement or null if results are invalid
   */
  createSeasonCompletionAnnouncement(seasonResults: SeasonCompletionResults): MessageInstruction | null {
    console.log(`SeasonService.createSeasonCompletionAnnouncement: Creating announcement for season ${seasonResults.seasonId}`);
    
    try {
      // Create the progress bar (similar to the one shown in SEASON_FLOWS.md)
      const progressBar = this.createProgressBar(seasonResults.completionPercentage);
      
      // Format the game results text
      const gameResultsText = this.formatGameResults(seasonResults.games);
      
      // Create the announcement message instruction
      const announcement = MessageHelpers.embedMessage(
        'success',
        'messages.season.completionAnnouncement',
        {
          seasonId: seasonResults.seasonId || 'unknown',
          daysElapsed: seasonResults.daysElapsed,
          completionPercentage: seasonResults.completionPercentage,
          progressBar,
          totalGames: seasonResults.totalGames,
          totalPlayers: seasonResults.totalPlayers,
          totalTurns: seasonResults.totalTurns,
          completedTurns: seasonResults.completedTurns,
          gameResults: gameResultsText,
          creatorName: seasonResults.creator.name || 'Unknown Creator'
        },
        false // Not ephemeral - this is a public announcement
      );

      console.log(`SeasonService.createSeasonCompletionAnnouncement: Successfully created announcement for season ${seasonResults.seasonId}`);
      return announcement;

    } catch (error) {
      console.error(`SeasonService.createSeasonCompletionAnnouncement: Error creating announcement for season ${seasonResults.seasonId}:`, error);
      // For invalid data, still try to create a basic announcement rather than returning null
      try {
        const fallbackAnnouncement = MessageHelpers.embedMessage(
          'success',
          'messages.season.completionFallbackAnnouncement',
          {
            seasonId: seasonResults.seasonId || 'unknown',
            daysElapsed: Math.max(0, seasonResults.daysElapsed || 0),
            completionPercentage: seasonResults.completionPercentage || 0,
            progressBar: this.createProgressBar(seasonResults.completionPercentage || 0),
            totalGames: Math.max(0, seasonResults.totalGames || 0),
            totalPlayers: Math.max(0, seasonResults.totalPlayers || 0),
            totalTurns: Math.max(0, seasonResults.totalTurns || 0),
            completedTurns: Math.max(0, seasonResults.completedTurns || 0),
            gameResults: '',
            creatorName: seasonResults.creator?.name || 'Unknown Creator'
          },
          false
        );
        console.log(`SeasonService.createSeasonCompletionAnnouncement: Created fallback announcement for season ${seasonResults.seasonId}`);
        return fallbackAnnouncement;
      } catch (fallbackError) {
        console.error(`SeasonService.createSeasonCompletionAnnouncement: Fallback also failed for season ${seasonResults.seasonId}:`, fallbackError);
        return null;
      }
    }
  }

  /**
   * Creates a visual progress bar for the season completion percentage.
   * @param percentage Completion percentage (0-100)
   * @returns String representation of the progress bar
   */
  private createProgressBar(percentage: number): string {
    const totalBlocks = 50; // Total number of blocks in the progress bar
    
    // Clamp percentage to valid range for display purposes
    const clampedPercentage = Math.max(0, Math.min(100, percentage));
    const filledBlocks = Math.round((clampedPercentage / 100) * totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    
    const filled = '■'.repeat(filledBlocks);
    const empty = '□'.repeat(emptyBlocks);
    
    return `${filled}${empty}`;
  }

  /**
   * Formats the game results into a readable text format for the announcement.
   * @param games Array of formatted games
   * @returns Formatted string containing all game results
   */
  private formatGameResults(games: FormattedGame[]): string {
    const gameTexts = games.map(game => {
      const turnTexts = game.turns.map(turn => {
        // Format player mention and content
        const playerMention = `<@${turn.playerDiscordId}>`;
        const playerName = turn.playerName || 'Unknown Player';
        let content = turn.content;
        
        // Handle different content types
        if (turn.status === 'SKIPPED') {
          content = '[Skipped]';
        } else if (turn.type === 'DRAWING' && turn.status === 'COMPLETED') {
          content = '[Image]';
        } else if (turn.type === 'WRITING' && turn.status === 'COMPLETED') {
          // Wrap text content in quotes
          content = `"${turn.content}"`;
        }
        
        // Include player name in the output so tests can find it
        return `${playerMention} ${playerName}: ${content}`;
      }).join('\n');
      
      return `**Game ${game.gameNumber}**\n${turnTexts}`;
    });
    
         return gameTexts.join('\n\n');
   }

  /**
   * Handles the delivery of season completion announcements.
   * Determines the appropriate delivery target (channel or DM) and sends the announcement.
   * @param seasonId The ID of the completed season
   * @returns MessageInstruction for delivery or null if delivery cannot be determined
   */
  async deliverSeasonCompletionAnnouncement(seasonId: string): Promise<MessageInstruction | null> {
    console.log(`SeasonService.deliverSeasonCompletionAnnouncement: Preparing announcement for season ${seasonId}`);
    
    try {
      // Get the season completion results
      const seasonResults = await this.getSeasonCompletionResults(seasonId);
      if (!seasonResults) {
        console.error(`SeasonService.deliverSeasonCompletionAnnouncement: Could not retrieve results for season ${seasonId}`);
        return null;
      }

      // Create the announcement message
      const announcement = this.createSeasonCompletionAnnouncement(seasonResults);
      if (!announcement) {
        console.error(`SeasonService.deliverSeasonCompletionAnnouncement: Could not create announcement for season ${seasonId}`);
        return null;
      }

      // Get the season with origin information
      const season = await this.prisma.season.findUnique({
        where: { id: seasonId },
        include: {
          players: {
            include: {
              player: {
                select: {
                  discordUserId: true
                }
              }
            }
          }
        }
      });

      if (!season) {
        console.error(`SeasonService.deliverSeasonCompletionAnnouncement: Season ${seasonId} not found`);
        return null;
      }

             // Determine delivery strategy based on origin
       if (season.guildId && season.channelId) {
         // Season was created in a channel - post announcement there
         console.log(`SeasonService.deliverSeasonCompletionAnnouncement: Delivering to channel ${season.channelId} in guild ${season.guildId}`);
         return {
           ...announcement,
           formatting: {
             ...announcement.formatting,
             channel: season.channelId
           },
           context: {
             ...announcement.context,
             guildId: season.guildId
           }
         };
       } else {
         // Season was created in DM or origin unknown - send DM to all players
         console.log(`SeasonService.deliverSeasonCompletionAnnouncement: Delivering via DM to ${season.players.length} players`);
         
         // For DM delivery, we'll return a special instruction that the messaging system can handle
         // The messaging system will need to handle sending to multiple recipients
         const playerDiscordIds = season.players.map(p => p.player.discordUserId);
         
         return {
           ...announcement,
           formatting: {
             ...announcement.formatting,
             dm: true
           },
           // Store recipient information in the data for the messaging system to use
           data: {
             ...announcement.data,
             deliveryMethod: 'dm',
             recipients: playerDiscordIds,
             recipientCount: playerDiscordIds.length
           }
         };
       }

    } catch (error) {
      console.error(`SeasonService.deliverSeasonCompletionAnnouncement: Error preparing announcement for season ${seasonId}:`, error);
      return null;
    }
  }
}

export interface NewSeasonOptions {
  creatorPlayerId: string;
  openDuration?: string | null; // Prisma schema uses String?
  minPlayers?: number | null;
  maxPlayers?: number | null;
  turnPattern?: string | null;
  claimTimeout?: string | null;
  writingTimeout?: string | null;
  // writingWarning?: string | null; // Add if used by service/DB
  drawingTimeout?: string | null;
  // drawingWarning?: string | null; // Add if used by service/DB
  // Origin tracking for announcements
  guildId?: string | null; // Discord guild ID where season was created (null for DMs)
  channelId?: string | null; // Discord channel ID where season was created (null for DMs)
  // Add any other fields from PRD/schema that can be set at creation
}

export interface FormattedTurn {
  turnNumber: number;
  type: 'WRITING' | 'DRAWING';
  status: 'COMPLETED' | 'SKIPPED';
  playerName: string;
  playerDiscordId: string;
  content: string; // Text content, '[Image]', or '[Skipped]'
  createdAt: Date;
  completedAt: Date | null;
}

export interface FormattedGame {
  gameNumber: number;
  gameId: string;
  status: string;
  turns: FormattedTurn[];
  completedAt: Date | null;
}

export interface SeasonCompletionResults {
  seasonId: string;
  seasonStatus: string;
  createdAt: Date;
  completedAt: Date;
  daysElapsed: number;
  totalGames: number;
  totalPlayers: number;
  totalTurns: number;
  completedTurns: number;
  completionPercentage: number;
  games: FormattedGame[];
  creator: {
    name: string;
    discordUserId: string;
  };
} 