import { PrismaClient, Player, Season, SeasonConfig, Prisma } from '@prisma/client'; // Import Prisma types
import { nanoid } from 'nanoid'; // Use named import for nanoid

// Define a more specific return type for createSeason, using Prisma's generated Season type
type SeasonWithConfig = Prisma.SeasonGetPayload<{
  include: { config: true }
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
   * @returns The created Season object, including its configuration.
   * @throws Error if the creator player does not exist or if the season name is taken.
   */
  async createSeason(options: NewSeasonOptions): Promise<SeasonWithConfig> {
    console.log('SeasonService.createSeason DB logic executing with options:', options);

    // 1. Find the creator Player using their Discord ID
    const creator = await this.prisma.player.findUnique({
      where: { discordUserId: options.creatorDiscordId },
    });

    if (!creator) {
      // TODO: Handle player creation if they don't exist? Or enforce pre-registration?
      // For now, throw an error if the player isn't found.
      console.error(`Creator player with Discord ID ${options.creatorDiscordId} not found.`);
      throw new Error('Creator player not found. Please ensure the player is registered.');
    }

    // Use a transaction to ensure atomicity: create config and season together
    const newSeasonWithConfig = await this.prisma.$transaction(async (tx) => {
      // 2. Create the SeasonConfig record
      // Start with defaults (implicitly handled by Prisma schema defaults)
      // Override defaults with any provided options
      const configData: Prisma.SeasonConfigCreateInput = {
        // Use Prisma schema defaults unless overridden
        ...(options.turnPattern && { turnPattern: options.turnPattern }),
        ...(options.claimTimeout && { claimTimeout: options.claimTimeout }),
        ...(options.writingTimeout && { writingTimeout: options.writingTimeout }),
        // ...(options.writingWarning && { writingWarning: options.writingWarning }), // Add if needed
        ...(options.drawingTimeout && { drawingTimeout: options.drawingTimeout }),
        // ...(options.drawingWarning && { drawingWarning: options.drawingWarning }), // Add if needed
        ...(options.openDuration && { openDuration: options.openDuration }),
        ...(options.minPlayers && { minPlayers: options.minPlayers }),
        ...(options.maxPlayers && { maxPlayers: options.maxPlayers }),
        // isGuildDefaultFor: null, // Explicitly null unless setting a default
        id: nanoid() // Use nanoid directly
      };
      const newConfig = await tx.seasonConfig.create({ data: configData });

      // 3. Create the Season record
      const seasonData: Prisma.SeasonCreateInput = {
        name: options.name,
        status: 'SETUP', // Initial status - player needs to join/ready up?
        creator: {
          connect: { id: creator.id },
        },
        config: {
          connect: { id: newConfig.id },
        },
        id: nanoid() // Use nanoid directly
      };

      const newSeason = await tx.season.create({
        data: seasonData,
        include: { config: true }, // Include the config in the return value
      });

      return newSeason;
    });

    console.log(`Season '${newSeasonWithConfig.name}' (ID: ${newSeasonWithConfig.id}) created successfully in DB.`);
    return newSeasonWithConfig;
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