import { PrismaClient, Player, Season, SeasonConfig, Prisma, Game } from '@prisma/client';
import { nanoid } from 'nanoid'; // Use named import for nanoid
import { humanId } from 'human-id'; // Import human-id
import { MessageInstruction } from '../types/MessageInstruction.js'; // Added .js extension
import schedule from 'node-schedule'; // Added for task scheduling
import { DateTime } from 'luxon'; // Duration and DurationLikeObject might not be needed here anymore
import { parseDuration } from '../utils/datetime.js'; // Import the new utility

// Define a more specific return type for createSeason, using Prisma's generated Season type
type SeasonWithConfig = Prisma.SeasonGetPayload<{
  include: { config: true }
}>

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

export class SeasonService {
  private prisma: PrismaClient;
  private scheduledActivationJobs: Map<string, schedule.Job> = new Map(); // For managing scheduled jobs

  // Inject PrismaClient instance
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
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
          id: humanId(), // Use human-id for season ID
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
        return { type: 'error', key: 'season_join_error_player_not_found', data: { playerId } };
      }

      // 1. Find the season (and check if it exists)
      const season = await tx.season.findUnique({
        where: { id: seasonId },
        include: { config: true, _count: { select: { players: true } } },
      });

      if (!season) {
        console.log(`SeasonService.addPlayerToSeason: Season ${seasonId} not found.`);
        return { type: 'error', key: 'season_join_error_season_not_found' }; // Standardized key
      }

      // 2. Check if season is open for joining (Define valid statuses)
      const validJoinStatuses = ['SETUP', 'PENDING_START', 'OPEN']; 
      if (!validJoinStatuses.includes(season.status)) {
        console.log(`SeasonService.addPlayerToSeason: Season ${seasonId} status (${season.status}) is not valid for joining.`);
        return { type: 'error', key: 'season_join_error_not_open', data: { status: season.status /*, seasonName: season.name */ } };
      }

      // 3. Check max player limit
      const maxPlayers = season.config.maxPlayers;
      const currentPlayerCount = season._count.players;
      if (maxPlayers !== null && currentPlayerCount >= maxPlayers) {
          console.log(`SeasonService.addPlayerToSeason: Season ${seasonId} is full (${currentPlayerCount}/${maxPlayers}).`);
          return { type: 'error', key: 'season_join_error_full', data: { currentPlayers: currentPlayerCount, maxPlayers: maxPlayers /*, seasonName: season.name */ } };
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
        return { type: 'error', key: 'season_join_error_already_joined', data: { /* seasonName: season.name */ } };
      }

      // 5. Add player to season (create join record)
      try {
        await tx.playersOnSeasons.create({
          data: {
            playerId: player.id, // Use the validated player's ID
            seasonId: seasonId,
          },
        });
        console.log(`SeasonService.addPlayerToSeason: Successfully added player ${playerId} (ID: ${player.id}) to season ${seasonId}.`);
        return { type: 'success', key: 'season_join_success', data: { /* seasonName: season.name */ } };
      } catch (error) {
         console.error(`SeasonService.addPlayerToSeason: Error adding player ${player.id} to season ${seasonId}:`, error);
         return { type: 'error', key: 'season_join_error_generic', data: { /* seasonName: season.name */ } };
      }
    });
  }

  /**
   * Activates a season if conditions are met (e.g., max players reached).
   * Transitions season status to ACTIVE and creates N games for N players.
   * @param seasonId The ID of the season to activate.
   * @returns A MessageInstruction object indicating success or failure.
   */
  async activateSeason(seasonId: string, activationParams?: { triggeredBy?: 'max_players' | 'open_duration_timeout' }): Promise<MessageInstruction> {
    console.log(`SeasonService.activateSeason: Attempting to activate season ${seasonId}`);
    const trigger = activationParams?.triggeredBy || 'max_players'; // Default to max_players logic

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Fetch Season with config and player count
        const season = await tx.season.findUnique({
          where: { id: seasonId },
          include: {
            config: true,
            _count: {
              select: { players: true },
            },
          },
        });

        if (!season) {
          console.warn(`SeasonService.activateSeason: Season ${seasonId} not found.`);
          return { type: 'error', key: 'season_activate_error_not_found', data: { seasonId } };
        }

        // 2. Validate Season Status
        if (!PRE_ACTIVATION_SEASON_STATUSES.includes(season.status)) {
          console.warn(`SeasonService.activateSeason: Season ${seasonId} is not in a valid pre-activation state. Status: ${season.status}`);
          return {
            type: 'error',
            key: 'season_activate_error_invalid_status',
            data: { seasonId, currentStatus: season.status, expectedStatuses: PRE_ACTIVATION_SEASON_STATUSES },
          };
        }

        const playerCount = season._count.players;
        const maxPlayers = season.config.maxPlayers;
        const minPlayers = season.config.minPlayers; // Needed if called by open_duration timeout

        // 3. Activation Conditions
        // For now, focusing on maxPlayers. open_duration logic will be handled by the calling context (e.g. scheduler)
        // or explicitly passed as a trigger type if this function needs to handle both.
        let canActivate = false;
        let activationReason = '';

        if (trigger === 'max_players') {
          if (maxPlayers !== null && playerCount >= maxPlayers) {
            canActivate = true;
            activationReason = `max players reached (${playerCount}/${maxPlayers})`;
          }
        } else if (trigger === 'open_duration_timeout') {
          if (playerCount >= minPlayers) {
            canActivate = true;
            activationReason = `open_duration timeout and min players met (${playerCount}/${minPlayers})`;
          } else {
            console.log(`SeasonService.activateSeason: Triggered by open_duration_timeout for season ${seasonId}, but min players NOT met (${playerCount}/${minPlayers}). Not activating.`);
            // Consider updating season status here to 'EXPIRED_PENDING_PLAYERS' or similar.
            // For now, returning an info-like error.
            return { 
              type: 'error', // Conform to MessageInstruction
              key: 'season_activate_error_min_players_not_met_on_timeout', 
              data: { seasonId, playerCount, minPlayers }
            };
          }
        }

        if (!canActivate) {
          console.warn(`SeasonService.activateSeason: Season ${seasonId} does not meet activation conditions for trigger '${trigger}'. Players: ${playerCount}, Max: ${maxPlayers}, Min: ${minPlayers}`);
          return {
            type: 'error',
            key: 'season_activate_error_conditions_not_met',
            data: { seasonId, playerCount, maxPlayers, minPlayers, trigger },
          };
        }
        
        console.log(`SeasonService.activateSeason: Activating season ${seasonId}. Reason: ${activationReason}.`);

        // Cancel pending open_duration job if it exists for this season, as it's activating now.
        const pendingJob = this.scheduledActivationJobs.get(seasonId);
        if (pendingJob) {
          pendingJob.cancel();
          this.scheduledActivationJobs.delete(seasonId);
          console.log(`SeasonService.activateSeason: Cancelled pending open_duration activation job for season ${seasonId}.`);
        }

        // 4.a Update Season status to ACTIVE
        const updatedSeason = await tx.season.update({
          where: { id: seasonId },
          data: { status: 'ACTIVE' },
        });
        console.log(`SeasonService.activateSeason: Season ${seasonId} status updated to ACTIVE.`);

        // 4.b Fetch all Player IDs in the season
        const playersInSeason = await tx.playersOnSeasons.findMany({
          where: { seasonId: seasonId },
          select: { playerId: true },
        });

        if (playersInSeason.length === 0 && playerCount > 0) { // playerCount from initial fetch might be > 0
             // This indicates a serious inconsistency if players disappeared during the transaction.
             console.error(`SeasonService.activateSeason: CRITICAL - Player count mismatch for season ${seasonId}. Initial: ${playerCount}, Current in Tx: ${playersInSeason.length}.`);
             throw new Error(`Critical player count mismatch for season ${seasonId} during activation.`);
        }
        if (playersInSeason.length === 0) { // If still 0 (e.g. playerCount was 0 and minPlayers was 0 for some reason)
          console.warn(`SeasonService.activateSeason: Season ${seasonId} has 0 players. No games will be created, but season is ACTIVE.`);
          // Return success but indicate no games created.
           return {
            type: 'success',
            key: 'season_activate_success_no_players',
            data: {
              seasonId: updatedSeason.id,
              newStatus: updatedSeason.status,
              gamesCreated: 0,
              playerCount: 0,
            },
          };
        }
        
        // 4.c Create N games for N players
        const gameCreationPromises: Promise<Game>[] = [];
        for (const playerEntry of playersInSeason) {
          // For now, we don't assign an initiatingPlayerId at game creation,
          // as it's not in the schema and turn assignment (subtask 8.3) handles initial player turns.
          gameCreationPromises.push(
            tx.game.create({
              data: {
                id: nanoid(),
                status: 'ACTIVE', // Games start active as first turns are offered immediately.
                season: {
                  connect: { id: seasonId },
                },
                // turns: {} // Turns are created as part of turn logic, not game creation.
              },
            })
          );
        }
        const createdGames = await Promise.all(gameCreationPromises);
        console.log(`SeasonService.activateSeason: Created ${createdGames.length} games for season ${seasonId}.`);

        return {
          type: 'success',
          key: 'season_activate_success',
          data: {
            seasonId: updatedSeason.id,
            newStatus: updatedSeason.status,
            gamesCreated: createdGames.length,
            playerCount: playersInSeason.length,
          },
        };
      });
    } catch (error: any) { // Added type for error
      console.error(`SeasonService.activateSeason: Error activating season ${seasonId}:`, error);
      // If the error is due to our explicit throw (e.g. 0 players), it will be caught here.
      // Otherwise, it's likely a Prisma or unexpected error.
      return {
        type: 'error',
        key: 'season_activate_error_generic',
        data: { seasonId, error: error.message || 'Unknown error' },
      };
    }
  }

  async handleOpenDurationTimeout(seasonId: string): Promise<void> {
    console.log(`SeasonService.handleOpenDurationTimeout: Checking season ${seasonId} for activation.`);
    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
      include: { config: true, _count: { select: { players: true } } },
    });

    if (!season) {
      console.warn(`SeasonService.handleOpenDurationTimeout: Season ${seasonId} not found. Job will not proceed.`);
      return;
    }

    if (!PRE_ACTIVATION_SEASON_STATUSES.includes(season.status)) {
      console.log(`SeasonService.handleOpenDurationTimeout: Season ${seasonId} status (${season.status}) is not pre-activation. Job will not proceed.`);
      return;
    }

    const playerCount = season._count.players;
    const minPlayers = season.config.minPlayers;

    if (playerCount >= minPlayers) {
      console.log(`SeasonService.handleOpenDurationTimeout: Season ${seasonId} meets min player criteria (${playerCount}/${minPlayers}). Attempting activation.`);
      const activationResult = await this.activateSeason(seasonId, { triggeredBy: 'open_duration_timeout' });
      if (activationResult.type === 'success') {
        console.log(`SeasonService.handleOpenDurationTimeout: Season ${seasonId} successfully activated.`);
      } else {
        console.error(`SeasonService.handleOpenDurationTimeout: Failed to activate season ${seasonId}. Reason: ${activationResult.key}`, activationResult.data);
      }
    } else {
      console.log(`SeasonService.handleOpenDurationTimeout: Season ${seasonId} did not meet min player criteria (${playerCount}/${minPlayers}). Not activating.`);
      // Optionally: Update season status to indicate it timed out without enough players, e.g., 'TIMED_OUT_PENDING_PLAYERS'
      // await this.prisma.season.update({ where: { id: seasonId }, data: { status: 'PENDING_MIN_PLAYERS_AFTER_TIMEOUT' }});
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