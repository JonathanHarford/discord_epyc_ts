import { PrismaClient, Player, Season, SeasonConfig, Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'; // Attempting different import path
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

// Define a return type for addPlayerToSeason
interface AddPlayerResult {
  success: boolean;
  message: string; // e.g., 'Successfully joined', 'Season full', 'Already joined', 'Season not found', 'Season not open', 'Player not found'
  season?: Season; // Optionally return the updated season or relevant info
}

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
      // 1. Find the creator Player using their Discord ID
      const creator = await this.prisma.player.findUnique({
        where: { discordUserId: options.creatorDiscordId },
      });

      if (!creator) {
        console.error(`Creator player with Discord ID ${options.creatorDiscordId} not found.`);
        return {
          type: 'error',
          key: 'season_create_error_creator_not_found',
          data: { discordUserId: options.creatorDiscordId },
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
          id: nanoid(), // Use nanoid directly
          name: options.name,
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
      if (error instanceof PrismaClientKnownRequestError) {
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
   * Adds a player (by their Discord ID) to a specified season.
   * Handles player creation if they don't exist, checks season status, max player limit, and if player already joined.
   * @param discordUserId The Discord User ID of the player trying to join.
   * @param seasonId The ID of the season to join.
   * @returns An AddPlayerResult object indicating success or failure reason.
   */
  async addPlayerToSeason(discordUserId: string, seasonId: string): Promise<AddPlayerResult> {
    console.log(`SeasonService.addPlayerToSeason: Attempting to add player ${discordUserId} to season ${seasonId}`);

    return await this.prisma.$transaction(async (tx) => {
      // 1. Find the season (and check if it exists)
      const season = await tx.season.findUnique({
        where: { id: seasonId },
        include: { config: true, _count: { select: { players: true } } },
      });

      if (!season) {
        console.log(`SeasonService.addPlayerToSeason: Season ${seasonId} not found.`);
        return { success: false, message: 'Season not found' };
      }

      // 2. Check if season is open for joining (Define valid statuses)
      // TODO: Use an enum for statuses? For now, hardcode valid joining states.
      const validJoinStatuses = ['SETUP', 'PENDING_START', 'OPEN']; // Adjust based on actual lifecycle
      if (!validJoinStatuses.includes(season.status)) {
        console.log(`SeasonService.addPlayerToSeason: Season ${seasonId} status (${season.status}) is not valid for joining.`);
        return { success: false, message: 'Season is not open for joining' };
      }

      // 3. Check max player limit
      const maxPlayers = season.config.maxPlayers; // Assumes config is always included
      const currentPlayerCount = season._count.players;
      if (maxPlayers !== null && currentPlayerCount >= maxPlayers) {
          console.log(`SeasonService.addPlayerToSeason: Season ${seasonId} is full (${currentPlayerCount}/${maxPlayers}).`);
          return { success: false, message: 'Season is full' };
      }


      // 4. Find or create the player
      // Ensure player exists using their discordUserId
      let player = await tx.player.findUnique({
        where: { discordUserId: discordUserId },
      });

      if (!player) {
        // TODO: How should player name be handled? Fetch from Discord API? Use placeholder?
        // For now, create with a placeholder name if not found. Command might need to pass name.
        console.log(`SeasonService.addPlayerToSeason: Player ${discordUserId} not found. Creating.`);
        try {
          player = await tx.player.create({
            data: {
              discordUserId: discordUserId,
              name: `User_${discordUserId.slice(-4)}`, // Placeholder name
              // bannedAt: null, // Default is null
            }
          });
          console.log(`SeasonService.addPlayerToSeason: Created player ${player.id} for Discord user ${discordUserId}.`);
        } catch (error) {
           console.error(`SeasonService.addPlayerToSeason: Error creating player ${discordUserId}:`, error);
           // Handle potential unique constraint errors if another process creates it concurrently?
           // Re-throw or return specific error might be needed depending on desired behavior.
           return { success: false, message: 'Error creating player profile.' };
        }
      }


      // 5. Check if player is already in the season
      const existingJoin = await tx.playersOnSeasons.findUnique({
        where: {
          playerId_seasonId: {
            playerId: player.id,
            seasonId: seasonId,
          },
        },
      });

      if (existingJoin) {
        console.log(`SeasonService.addPlayerToSeason: Player ${discordUserId} (ID: ${player.id}) already in season ${seasonId}.`);
        return { success: false, message: 'You have already joined this season', season };
      }

      // 6. Add player to season (create join record)
      try {
        await tx.playersOnSeasons.create({
          data: {
            playerId: player.id,
            seasonId: seasonId,
            // joinedAt is handled by @default(now())
          },
        });
        console.log(`SeasonService.addPlayerToSeason: Successfully added player ${discordUserId} (ID: ${player.id}) to season ${seasonId}.`);
        return { success: true, message: 'Successfully joined the season', season };
      } catch (error) {
         console.error(`SeasonService.addPlayerToSeason: Error adding player ${player.id} to season ${seasonId}:`, error);
         // Handle potential errors during the join table creation
         // Could be a race condition if max players check passed but someone else joined.
         // Consider re-checking count or handling specific Prisma errors.
         return { success: false, message: 'An error occurred while joining.' };
      }
    });
  }
}

export interface NewSeasonOptions {
  name: string;
  creatorDiscordId: string;
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