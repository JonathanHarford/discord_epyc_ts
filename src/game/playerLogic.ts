import { PrismaClient, Player } from '@prisma/client';

/**
 * Adds a new player to the database or retrieves them if they already exist.
 *
 * @param discordUserId - The unique Discord user ID of the player.
 * @param name - The display name of the player.
 * @param prisma - Prisma client instance for database operations.
 * @returns Promise<Player | null> - The created or existing player object, or null if an error occurs.
 */
export const addPlayerPlaceholder = async (
  discordUserId: string,
  name: string,
  prisma: PrismaClient
): Promise<Player | null> => {
  try {
    // Check if the player already exists
    const existingPlayer = await prisma.player.findUnique({
      where: {
        discordUserId,
      },
    });

    if (existingPlayer) {
      console.log(`Player with Discord ID ${discordUserId} already exists: ${existingPlayer.name}`);
      // Optionally, update the name if it has changed
      if (existingPlayer.name !== name) {
        return prisma.player.update({
          where: { id: existingPlayer.id },
          data: { name },
        });
      }
      return existingPlayer;
    }

    // Create a new player
    const newPlayer = await prisma.player.create({
      data: {
        discordUserId,
        name,
      },
    });

    console.log(`New player created: ${newPlayer.name} (Discord ID: ${discordUserId})`);
    return newPlayer;

  } catch (error) {
    console.error('Error in addPlayerPlaceholder:', error);
    return null;
  }
}; 