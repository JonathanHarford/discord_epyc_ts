import { PrismaClient, Player, Season, SeasonConfig, Prisma, Game } from '@prisma/client';
import { nanoid } from 'nanoid'; // Use named import for nanoid
import { humanId } from 'human-id'; // Import human-id
import { MessageInstruction } from '../types/MessageInstruction.js'; // Added .js extension
import schedule from 'node-schedule'; // Added for task scheduling
import { DateTime } from 'luxon'; // Duration and DurationLikeObject might not be needed here anymore
import { parseDuration } from '../utils/datetime.js'; // Import the new utility
import { LangKeys } from '../constants/lang-keys.js';
import { TurnService } from './TurnService.js'; // Added .js extension

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
const PRE_ACTIVATION_SEASON_STATUSES = ['PENDING_START', 'OPEN', 'SETUP']; // Added 'SETUP' as per createSeason

// Define a type for the Prisma transaction client
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export class SeasonService {
  private prisma: PrismaClient;
  private scheduledActivationJobs: Map<string, schedule.Job> = new Map(); // For managing scheduled jobs
  private turnService: TurnService;

  // Inject PrismaClient instance and TurnService
  constructor(prisma: PrismaClient, turnService: TurnService) {
    this.prisma = prisma;
    this.scheduledActivationJobs = new Map(); // Ensure it's initialized here too
    this.turnService = turnService;
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
      return {
        type: 'error',
        key: 'season_create_error_min_max_players',
        data: { minPlayers: options.minPlayers, maxPlayers: options.maxPlayers },
      };
    }

    try {
      // 1. Find the creator Player using their internal Player ID
      const creator = await this.prisma.player.findUnique({
        where: { id: options.creatorPlayerId },
      });

      if (!creator) {
        console.error(`Creator player with Player ID ${options.creatorPlayerId} not found.`);
        return {
          type: 'error',
          key: 'season_create_error_creator_player_not_found', // Updated key
          data: { playerId: options.creatorPlayerId },
        };
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
          status: 'SETUP', 
          creator: {
            connect: { id: creator.id },
          },
          config: {
            connect: { id: newConfig.id },
          },
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
          const job = schedule.scheduleJob(activationTime, async () => {
            console.log(`Scheduled job running for season ${newSeasonWithConfig.id} (open_duration timeout).`);
            await this.handleOpenDurationTimeout(newSeasonWithConfig.id);
            this.scheduledActivationJobs.delete(newSeasonWithConfig.id); // Remove job from map after execution
          });
          this.scheduledActivationJobs.set(newSeasonWithConfig.id, job);
          console.log(`SeasonService.createSeason: Scheduled activation for season ${newSeasonWithConfig.id} at ${activationTime.toISOString()}`);
        } else {
          console.warn(`SeasonService.createSeason: Invalid or zero openDuration format for season ${newSeasonWithConfig.id}: '${newSeasonWithConfig.config.openDuration}'. Job not scheduled.`);
        }
      }

      console.log(`Season (ID: ${newSeasonWithConfig.id}) created successfully in DB.`);
      return {
        type: 'success',
        key: 'season_create_success',
        data: {
          seasonId: newSeasonWithConfig.id,
          status: newSeasonWithConfig.status,
          openDuration: newSeasonWithConfig.config.openDuration, // Add openDuration for the message
          // Potentially include other relevant details for the success message
        },
      };
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
        return { type: 'error', key: LangKeys.Commands.JoinSeason.playerNotFound, data: { playerId } };
      }

      // 1. Find the season (and check if it exists)
      const season = await tx.season.findUnique({
        where: { id: seasonId },
        include: { config: true, _count: { select: { players: true } } },
      });

      if (!season) {
        console.log(`SeasonService.addPlayerToSeason: Season ${seasonId} not found.`);
        return { type: 'error', key: LangKeys.Commands.JoinSeason.seasonNotFound };
      }

      // 2. Check if season is open for joining (Define valid statuses)
      const validJoinStatuses = ['SETUP', 'PENDING_START', 'OPEN']; 
      if (!validJoinStatuses.includes(season.status)) {
        console.log(`SeasonService.addPlayerToSeason: Season ${seasonId} status (${season.status}) is not valid for joining.`);
        return { type: 'error', key: LangKeys.Commands.JoinSeason.notOpen, data: { status: season.status /*, seasonName: season.name */ } };
      }

      // 3. Check max player limit
      const maxPlayers = season.config.maxPlayers;
      const currentPlayerCount = season._count.players;
      if (maxPlayers !== null && currentPlayerCount >= maxPlayers) {
          console.log(`SeasonService.addPlayerToSeason: Season ${seasonId} is full (${currentPlayerCount}/${maxPlayers}).`);
          return { type: 'error', key: LangKeys.Commands.JoinSeason.full, data: { currentPlayers: currentPlayerCount, maxPlayers: maxPlayers /*, seasonName: season.name */ } };
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
        return { type: 'error', key: LangKeys.Commands.JoinSeason.alreadyJoined, data: { /* seasonName: season.name */ } };
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
      }

      // Player joined, but season not yet activated by max players
      return {
        type: 'success',
        key: LangKeys.Commands.JoinSeason.success,
        data: {
          // seasonName: season.name,
          seasonId: season.id,
          currentPlayers: updatedPlayerCount, // Use the fresh count
          maxPlayers: maxPlayers,
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
    const activationLogic = async (prismaClient: PrismaTransactionClient | PrismaClient) => {
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
      const { minPlayers, maxPlayers } = season.config;

      if (triggeredBy === 'open_duration_timeout') {
        if (minPlayers !== null && actualPlayerCountInTx < minPlayers) {
          console.warn(`SeasonService.activateSeason: Season ${seasonId} (timeout) does not meet min player requirement (${actualPlayerCountInTx}/${minPlayers}). Cancelling season.`);
          await prismaClient.season.update({
            where: { id: seasonId },
            data: { status: 'CANCELLED' }, // Or a new status like 'ABORTED_MIN_PLAYERS'
          });
          return { type: 'error' as const, key: 'season_activate_error_min_players_not_met_on_timeout', data: { seasonId, currentPlayers: actualPlayerCountInTx, minPlayers } };
        }
      } else if (triggeredBy === 'max_players') {
        // If triggered by max_players, playerCount from params should match maxPlayers
        // And actualPlayerCountInTx should also match for consistency
        if (maxPlayers === null || (activationParams?.playerCount !== undefined && activationParams.playerCount < maxPlayers) || actualPlayerCountInTx < maxPlayers) {
          console.warn(`SeasonService.activateSeason: Season ${seasonId} (max_players trigger) condition not met. Expected ${maxPlayers}, param count: ${activationParams?.playerCount}, actual in tx: ${actualPlayerCountInTx}. Activation aborted.`);
          // This state is unexpected if triggeredBy max_players correctly.
          // It implies a logic error or race condition if activationParams.playerCount was indeed maxPlayers.
          return { type: 'error' as const, key: 'season_activate_error_max_players_condition_not_met', data: { seasonId, currentPlayers: actualPlayerCountInTx, expectedMax: maxPlayers, providedCount: activationParams?.playerCount } };
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
           return { type: 'error' as const, key: 'season_activate_error_zero_players_violates_minplayers', data: { seasonId, minPlayers } };
        }
      }

      // 5. Update season status to ACTIVE
      await prismaClient.season.update({
        where: { id: seasonId },
        data: { status: 'ACTIVE' },
      });
      console.log(`SeasonService.activateSeason: Season ${seasonId} status updated to ACTIVE.`);

      // 6. Create games - one for each player and associate them with the player
      const gameAndPlayerCreationPromises: Promise<{ game: Prisma.GameGetPayload<{ include: { season: true } }>; player: Player }>[] = [];
      if (actualPlayerCountInTx > 0) { // Only create games if there are players
        for (const playerOnSeason of season.players) { // playerOnSeason is PlayersOnSeasons[], playerOnSeason.player is Player
          const gameData: Prisma.GameCreateInput = {
            id: nanoid(), // Use nanoid for game ID
            season: { connect: { id: seasonId } },
            status: 'PENDING_START',
          };
          const playerForThisGame = playerOnSeason.player; // player is the actual Player object
          gameAndPlayerCreationPromises.push(
            prismaClient.game.create({ data: gameData, include: { season: true } })
              .then(createdGame => ({ game: createdGame, player: playerForThisGame }))
          );
        }
      }
      
      const createdGamesAndPlayers = await Promise.all(gameAndPlayerCreationPromises);
      console.log(`SeasonService.activateSeason: Created ${createdGamesAndPlayers.length} games for season ${seasonId}.`);

      // 7. Offer initial turns for each game-player pair
      if (createdGamesAndPlayers.length > 0) {
        const turnOfferResults = await Promise.all(createdGamesAndPlayers.map(async ({ game, player }) => {
          // 'player' is directly available here.
          // 'game' is the created game.
          // 'game.seasonId' is available as it's a scalar field on Game.
          return this.turnService.offerInitialTurn(game, player, game.seasonId);
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
      const scheduledJob = this.scheduledActivationJobs.get(seasonId);
      if (scheduledJob) {
        scheduledJob.cancel();
        this.scheduledActivationJobs.delete(seasonId);
        console.log(`SeasonService.activateSeason: Canceled and removed scheduled activation job for season ${seasonId}.`);
      }
      
      return {
        type: 'success' as const, // Ensure type is literal for MessageInstruction
        key: 'season_activate_success',
        data: {
          seasonId,
          status: 'ACTIVE',
          gamesCreated: createdGamesAndPlayers.length,
          playersInSeason: actualPlayerCountInTx,
        },
      };
    };

    // Execute the logic: if a transaction client 'tx' is provided, use it. Otherwise, create a new transaction.
    if (tx) {
      console.log(`SeasonService.activateSeason: Using provided transaction client for season ${seasonId}.`);
      return await activationLogic(tx);
    } else {
      console.log(`SeasonService.activateSeason: Starting new transaction for season ${seasonId}.`);
      return await this.prisma.$transaction(async (newTx) => activationLogic(newTx));
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
    const result = await this.activateSeason(seasonId, { triggeredBy: 'open_duration_timeout' });
    // No 'tx' is passed here, so activateSeason will create its own transaction.

    if (result.type === 'success') {
      console.log(`SeasonService.handleOpenDurationTimeout: Season ${seasonId} activated successfully by timeout.`);
      // TODO: Potentially send a notification (e.g., via Discord bot if applicable)
    } else {
      console.error(`SeasonService.handleOpenDurationTimeout: Failed to activate season ${seasonId} by timeout. Error: ${result.key}`, result.data);
      // TODO: Handle activation failure (e.g., log, notify admin)
      // If min_players not met, activateSeason already sets status to CANCELLED.
    }
    // Remove the job from the map as it has been handled (either successfully or failed activation)
    // activateSeason also tries to remove it, but this is a safeguard.
    const scheduledJob = this.scheduledActivationJobs.get(seasonId);
    if (scheduledJob) {
      // It might have already been cancelled by activateSeason if successful.
      // If activateSeason failed before cancelling, we ensure it's cancelled here.
      scheduledJob.cancel(); 
      this.scheduledActivationJobs.delete(seasonId);
      console.log(`SeasonService.handleOpenDurationTimeout: Cleaned up scheduled job for season ${seasonId}.`);
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
  // Add any other fields from PRD/schema that can be set at creation
} 