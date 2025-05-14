import { PrismaClient, Player, Season, SeasonConfig, Prisma } from '@prisma/client';
import { nanoid } from 'nanoid'; // Use named import for nanoid
import { MessageInstruction } from '../types/MessageInstruction.js'; // Added .js extension

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

export class SeasonService {
  private prisma: PrismaClient;

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
        where: { id: options.creatorPlayerId }, // Changed from discordUserId
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
        const seasonName = options.name || `Epyc Season ${nanoid(8)}`; // Generate name if not provided TODO: Implement more creative/themed name generation
        const seasonData: Prisma.SeasonCreateInput = {
          id: nanoid(), // Use nanoid directly
          name: seasonName, // Use the potentially generated name
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

      console.log(`Season '${newSeasonWithConfig.name}' (ID: ${newSeasonWithConfig.id}) created successfully in DB.`);
      return {
        type: 'success',
        key: 'season_create_success',
        data: {
          seasonId: newSeasonWithConfig.id,
          seasonName: newSeasonWithConfig.name,
          status: newSeasonWithConfig.status,
          // Potentially include other relevant details for the success message
        },
      };
    } catch (error) {
      console.error('Error creating season:', error);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P2002 is the Prisma error code for unique constraint violation
        if (error.code === 'P2002') {
          const target = error.meta?.target as string[] | undefined;
          if (target && target.includes('name')) { // Check if the unique constraint was on the name field
            return {
              type: 'error',
              key: 'season_create_error_name_taken',
              data: { name: options.name },
            };
          }
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
        console.log(`SeasonService.findSeasonById: Found season \'${season.name}\'`);
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
        return { type: 'error', key: 'season_join_error_not_open', data: { status: season.status, seasonName: season.name } };
      }

      // 3. Check max player limit
      const maxPlayers = season.config.maxPlayers;
      const currentPlayerCount = season._count.players;
      if (maxPlayers !== null && currentPlayerCount >= maxPlayers) {
          console.log(`SeasonService.addPlayerToSeason: Season ${seasonId} is full (${currentPlayerCount}/${maxPlayers}).`);
          return { type: 'error', key: 'season_join_error_full', data: { currentPlayers: currentPlayerCount, maxPlayers: maxPlayers, seasonName: season.name } };
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
        return { type: 'error', key: 'season_join_error_already_joined', data: { seasonName: season.name } };
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
        return { type: 'success', key: 'season_join_success', data: { seasonName: season.name } };
      } catch (error) {
         console.error(`SeasonService.addPlayerToSeason: Error adding player ${player.id} to season ${seasonId}:`, error);
         return { type: 'error', key: 'season_join_error_generic', data: { seasonName: season.name } };
      }
    });
  }
}

export interface NewSeasonOptions {
  name?: string; // Made name optional
  creatorPlayerId: string; // Changed from creatorDiscordId
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