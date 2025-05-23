import { PrismaClient, Turn } from '@prisma/client';

/**
 * Allows a player to claim an "OFFERED" turn.
 *
 * @param turnId - The ID of the turn to claim.
 * @param playerId - The ID of the player claiming the turn.
 * @param prisma - Prisma client instance.
 * @returns Promise<Turn | null> - The updated turn or null if unsuccessful.
 */
export const claimTurnPlaceholder = async (
  turnId: string,
  playerId: string,
  prisma: PrismaClient
): Promise<Turn | null> => {
  try {
    const turn = await prisma.turn.findUnique({
      where: { id: turnId },
    });

    if (!turn) {
      console.error(`Turn ${turnId} not found.`);
      return null;
    }

    if (turn.status !== 'OFFERED') {
      console.error(`Turn ${turnId} is not in 'OFFERED' state (current: ${turn.status}). Cannot claim.`);
      return null;
    }

    // Ensure the turn is offered to this specific player, or if it's a general offer (playerId is null on offer)
    if (turn.playerId !== null && turn.playerId !== playerId) {
      console.error(`Turn ${turnId} was offered to player ${turn.playerId}, not ${playerId}. Cannot claim.`);
      return null;
    }

    const updatedTurn = await prisma.turn.update({
      where: { id: turnId },
      data: {
        status: 'PENDING', // Or 'CLAIMED' if you have such a status
        claimedAt: new Date(),
        playerId: playerId, // Explicitly assign/confirm the player
      },
    });

    console.log(`Player ${playerId} claimed turn ${turnId}. Status set to PENDING.`);
    return updatedTurn;

  } catch (error) {
    console.error(`Error claiming turn ${turnId} for player ${playerId}:`, error);
    return null;
  }
};

/**
 * Allows a player to submit their work for a "PENDING" turn.
 *
 * @param turnId - The ID of the turn to submit.
 * @param playerId - The ID of the player submitting the turn.
 * @param submissionData - Object containing textContent or imageUrl.
 * @param prisma - Prisma client instance.
 * @returns Promise<Turn | null> - The updated turn or null if unsuccessful.
 */
export const submitTurnPlaceholder = async (
  turnId: string,
  playerId: string,
  submissionData: { textContent?: string; imageUrl?: string },
  prisma: PrismaClient
): Promise<Turn | null> => {
  try {
    const turn = await prisma.turn.findUnique({
      where: { id: turnId },
    });

    if (!turn) {
      console.error(`Turn ${turnId} not found.`);
      return null;
    }

    if (turn.status !== 'PENDING') {
      console.error(`Turn ${turnId} is not in 'PENDING' state (current: ${turn.status}). Cannot submit.`);
      return null;
    }

    if (turn.playerId !== playerId) {
      console.error(`Turn ${turnId} is assigned to player ${turn.playerId}, not ${playerId}. Cannot submit.`);
      return null;
    }

    // Validate submission data based on turn type
    if (turn.type === 'WRITING' && !submissionData.textContent) {
      console.error(`Turn ${turnId} is a WRITING turn but no textContent provided.`);
      return null;
    }
    if (turn.type === 'DRAWING' && !submissionData.imageUrl) {
      console.error(`Turn ${turnId} is a DRAWING turn but no imageUrl provided.`);
      return null;
    }

    const updatedTurn = await prisma.turn.update({
      where: { id: turnId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        textContent: turn.type === 'WRITING' ? submissionData.textContent : undefined,
        imageUrl: turn.type === 'DRAWING' ? submissionData.imageUrl : undefined,
      },
    });

    console.log(`Player ${playerId} submitted turn ${turnId}. Status set to COMPLETED.`);
    return updatedTurn;

  } catch (error) {
    console.error(`Error submitting turn ${turnId} for player ${playerId}:`, error);
    return null;
  }
};

/**
 * Offers an "AVAILABLE" turn to a specific player.
 *
 * @param turnId - The ID of the turn to offer.
 * @param playerId - The ID of the player to offer the turn to.
 * @param prisma - Prisma client instance.
 * @returns Promise<Turn | null> - The updated turn or null if unsuccessful.
 */
export const offerTurnPlaceholder = async (
  turnId: string,
  playerId: string,
  prisma: PrismaClient
): Promise<Turn | null> => {
  try {
    const turn = await prisma.turn.findUnique({
      where: { id: turnId },
    });

    if (!turn) {
      console.error(`Turn ${turnId} not found.`);
      return null;
    }

    if (turn.status !== 'AVAILABLE') {
      console.error(`Turn ${turnId} is not in 'AVAILABLE' state (current: ${turn.status}). Cannot offer.`);
      return null;
    }

    const updatedTurn = await prisma.turn.update({
      where: { id: turnId },
      data: {
        status: 'OFFERED',
        offeredAt: new Date(),
        playerId: playerId,
      },
    });

    console.log(`Turn ${turnId} offered to player ${playerId}. Status set to OFFERED.`);
    return updatedTurn;

  } catch (error) {
    console.error(`Error offering turn ${turnId} to player ${playerId}:`, error);
    return null;
  }
};

/**
 * Marks a turn as "SKIPPED".
 *
 * @param turnId - The ID of the turn to skip.
 * @param prisma - Prisma client instance.
 * @returns Promise<Turn | null> - The updated turn or null if unsuccessful.
 */
export const skipTurnPlaceholder = async (
  turnId: string,
  prisma: PrismaClient
): Promise<Turn | null> => {
  try {
    const turn = await prisma.turn.findUnique({
      where: { id: turnId },
    });

    if (!turn) {
      console.error(`Turn ${turnId} not found.`);
      return null;
    }

    if (turn.status === 'COMPLETED' || turn.status === 'SKIPPED') {
      console.warn(`Turn ${turnId} is already ${turn.status}. No action taken.`);
      return turn;
    }

    const updatedTurn = await prisma.turn.update({
      where: { id: turnId },
      data: {
        status: 'SKIPPED',
        skippedAt: new Date(),
      },
    });

    console.log(`Turn ${turnId} marked as SKIPPED.`);
    return updatedTurn;

  } catch (error) {
    console.error(`Error skipping turn ${turnId}:`, error);
    return null;
  }
};

/**
 * Dismisses an "OFFERED" turn, reverting it to "AVAILABLE".
 * This might be used if a player rejects an offer or an offer expires.
 *
 * @param turnId - The ID of the turn to dismiss the offer for.
 * @param playerIdWhoWasOffered - The ID of the player to whom the turn was offered. (for verification)
 * @param prisma - Prisma client instance.
 * @returns Promise<Turn | null> - The updated turn or null if unsuccessful.
 */
export const dismissOfferPlaceholder = async (
  turnId: string,
  playerIdWhoWasOffered: string, // Added for verification
  prisma: PrismaClient
): Promise<Turn | null> => {
  try {
    const turn = await prisma.turn.findUnique({
      where: { id: turnId },
    });

    if (!turn) {
      console.error(`Turn ${turnId} not found.`);
      return null;
    }

    if (turn.status !== 'OFFERED') {
      console.error(`Turn ${turnId} is not in 'OFFERED' state (current: ${turn.status}). Cannot dismiss offer.`);
      return null;
    }

    if (turn.playerId !== playerIdWhoWasOffered) {
      console.error(`Turn ${turnId} was offered to ${turn.playerId}, not ${playerIdWhoWasOffered}. Cannot dismiss.`);
      return null;
    }

    const updatedTurn = await prisma.turn.update({
      where: { id: turnId },
      data: {
        status: 'AVAILABLE',
        offeredAt: null,
        claimedAt: null, // Also clear claimedAt if it was somehow set
        playerId: null,
      },
    });

    console.log(`Offer for turn ${turnId} (player ${playerIdWhoWasOffered}) dismissed. Status set to AVAILABLE.`);
    return updatedTurn;

  } catch (error) {
    console.error(`Error dismissing offer for turn ${turnId}:`, error);
    return null;
  }
}; 