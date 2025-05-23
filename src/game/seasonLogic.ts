import { PrismaClient, Season } from '@prisma/client';

/**
 * Creates a new season in the database.
 *
 * @param creatorId - The ID of the player creating the season.
 * @param configId - The ID of the season configuration to link to this season.
 * @param prisma - Prisma client instance for database operations.
 * @returns Promise<Season | null> - The created season object, or null if an error occurs.
 */
export const createSeasonPlaceholder = async (
  creatorId: string,
  configId: string,
  prisma: PrismaClient
): Promise<Season | null> => {
  try {
    // Create a new season with status "SETUP"
    const newSeason = await prisma.season.create({
      data: {
        creatorId,
        configId,
        status: 'SETUP', // Default status for a new season
      },
    });

    console.log(`New season created with ID: ${newSeason.id} by player ${creatorId}, using config ${configId}`);
    return newSeason;

  } catch (error) {
    console.error('Error in createSeasonPlaceholder:', error);
    // This could be due to various reasons, e.g., foreign key constraint violation (invalid creatorId or configId),
    // or if the configId is already linked to another season (due to @unique on configId in Season model).
    return null;
  }
}; 