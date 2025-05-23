import { PrismaClient, Player, Turn, Game, Season, PlayersOnSeasons } from '@prisma/client';
import { Logger } from '../services/logger.js'; // Import the logger

/**
 * Activates a season and its first game.
 * Sets the season status to "ACTIVE" and the first game's status to "ACTIVE".
 * @param seasonId - The ID of the season to activate.
 * @param prisma - Prisma client instance.
 * @returns Promise<Season | null> - The updated season or null if not found/no games.
 */
export const activateSeasonPlaceholder = async (
  seasonId: string,
  prisma: PrismaClient
): Promise<Season | null> => {
  try {
    // Find the season and its games
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      include: {
        games: {
          orderBy: { // Assuming games can be ordered by creation or a specific sequence number
            createdAt: 'asc',
          },
        },
      },
    });

    if (!season) {
      console.error(`Season with ID ${seasonId} not found.`);
      return null;
    }

    if (season.games.length === 0) {
      console.error(`Season with ID ${seasonId} has no games to activate.`);
      // Potentially throw an error or handle as a specific case
      return null; 
    }

    // Update season status to ACTIVE
    const updatedSeason = await prisma.season.update({
      where: { id: seasonId },
      data: { status: 'ACTIVE' },
    });

    // Activate the first game
    const firstGame = season.games[0];
    await prisma.game.update({
      where: { id: firstGame.id },
      data: { status: 'ACTIVE' },
    });

    console.log(`Season ${seasonId} activated successfully. First game ${firstGame.id} activated.`);
    return updatedSeason;

  } catch (error) {
    console.error(`Error activating season ${seasonId}:`, error);
    // Consider re-throwing the error or returning a more specific error object
    return null;
  }
};

// Types for the Next Player Logic
interface PlayerTurnStats {
  playerId: string;
  player: Player;
  totalWritingTurns: number;
  totalDrawingTurns: number;
  pendingTurns: number;
  hasPlayedInGame: boolean;
}

interface NextPlayerResult {
  success: boolean;
  playerId?: string;
  player?: Player;
  error?: string;
}

/**
 * Implements the core Next Player Logic algorithm for Season Games.
 * Determines which player should be OFFERED the next AVAILABLE turn in a specific game.
 * 
 * @param gameId - The ID of the game for which to find the next player
 * @param turnType - The type of turn ('WRITING' or 'DRAWING')
 * @param prisma - Prisma client instance for database queries
 * @returns Promise<NextPlayerResult> - The selected player or error information
 */
export async function selectNextPlayer(
  gameId: string,
  turnType: 'WRITING' | 'DRAWING',
  prisma: PrismaClient
): Promise<NextPlayerResult> {
  try {
    // 1. Get the game and its season with all players
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        season: {
          include: {
            players: {
              include: {
                player: true
              }
            }
          }
        },
        turns: {
          include: {
            player: true
          }
        }
      }
    });

    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    if (!game.season) {
      return { success: false, error: 'Game has no associated season' };
    }

    const seasonPlayers = game.season.players.map(p => p.player);
    
    if (seasonPlayers.length === 0) {
      return { success: false, error: 'No players in season' };
    }

    // 2. Get all turns across all games in the season for analysis
    const allSeasonGames = await prisma.game.findMany({
      where: { seasonId: game.seasonId },
      include: {
        turns: {
          include: {
            player: true
          }
        }
      }
    });

    // 3. Calculate player statistics for MUST and SHOULD rule evaluation
    const playerStats: PlayerTurnStats[] = await calculatePlayerStats(
      seasonPlayers,
      allSeasonGames,
      gameId,
      prisma
    );

    // 4. Apply MUST rules (hard constraints)
    const eligiblePlayers = applyMustRules(playerStats);

    if (eligiblePlayers.length === 0) {
      return { success: false, error: 'No eligible players found after applying MUST rules' };
    }

    // 5. Apply SHOULD rules (prioritization) in sequence
    const selectedPlayer = applyShouldRules(
      eligiblePlayers,
      turnType,
      game.turns, // current game's turns
      seasonPlayers.length,
      allSeasonGames // Pass all season games
    );

    return {
      success: true,
      playerId: selectedPlayer.playerId,
      player: selectedPlayer.player
    };

  } catch (error) {
    console.error('Error in selectNextPlayer:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Calculate comprehensive statistics for each player in the season
 */
async function calculatePlayerStats(
  seasonPlayers: Player[],
  allSeasonGames: (Game & { turns: (Turn & { player: Player | null })[] })[],
  currentGameId: string,
  prisma: PrismaClient
): Promise<PlayerTurnStats[]> {
  const stats: PlayerTurnStats[] = [];

  for (const player of seasonPlayers) {
    let totalWritingTurns = 0;
    let totalDrawingTurns = 0;
    let pendingTurns = 0;
    let hasPlayedInGame = false;

    // Count turns across all games in the season
    for (const game of allSeasonGames) {
      for (const turn of game.turns) {
        if (turn.playerId === player.id) {
          // Check if player has played in the current game
          if (game.id === currentGameId && 
              (turn.status === 'COMPLETED' || turn.status === 'SKIPPED' || turn.status === 'PENDING' || turn.status === 'OFFERED')) {
            hasPlayedInGame = true;
          }

          // Count turn types (only count COMPLETED, SKIPPED, PENDING, or OFFERED turns)
          if (['COMPLETED', 'SKIPPED', 'PENDING', 'OFFERED'].includes(turn.status)) {
            if (turn.type === 'WRITING') {
              totalWritingTurns++;
            } else if (turn.type === 'DRAWING') {
              totalDrawingTurns++;
            }
          }

          // Count pending turns
          if (turn.status === 'PENDING') {
            pendingTurns++;
          }
        }
      }
    }

    stats.push({
      playerId: player.id,
      player,
      totalWritingTurns,
      totalDrawingTurns,
      pendingTurns,
      hasPlayedInGame
    });
  }

  return stats;
}

/**
 * Apply MUST rules (hard constraints) to filter eligible players
 */
function applyMustRules(playerStats: PlayerTurnStats[]): PlayerTurnStats[] {
  return playerStats.filter(stats => {
    // MUST Rule 1: A player MUST never play in the same game twice within a single season
    if (stats.hasPlayedInGame) {
      return false;
    }

    // MUST Rule 2: A player MUST never have more than one PENDING turn at a time across all season games
    if (stats.pendingTurns > 0) {
      return false;
    }

    return true;
  });
}

/**
 * Apply SHOULD rules (prioritization) in sequence to select the best player
 */
function applyShouldRules(
  eligiblePlayers: PlayerTurnStats[],
  turnType: 'WRITING' | 'DRAWING',
  gameTurns: (Turn & { player: Player | null })[], // current game's turns
  totalPlayersInSeason: number,
  allSeasonGames: (Game & { turns: (Turn & { player: Player | null })[] })[] // Added allSeasonGames
): PlayerTurnStats {
  let candidates = [...eligiblePlayers];

  // SHOULD Rule 1: Player A SHOULD NOT be ASSIGNED an <X>ing turn following Player B more than once per season
  // This requires checking the previous turn in this specific game and across all season games
  candidates = applyShouldRule1(candidates, turnType, gameTurns, allSeasonGames);

  // SHOULD Rule 2: Players SHOULD NOT be given an <X>ing turn if they've already been ASSIGNED n/2 <X>ing turns
  candidates = applyShouldRule2(candidates, turnType, totalPlayersInSeason);

  // SHOULD Rule 3: Given an <X>ing turn, prefer the player who has been ASSIGNED the fewest <X>ing turns
  candidates = applyShouldRule3(candidates, turnType);

  // SHOULD Rule 4: If there is still a tie, prefer players who have fewer PENDING overall turns
  candidates = applyShouldRule4(candidates);

  // Final tie-breaking: Use deterministic selection (lowest player ID)
  if (candidates.length > 1) {
    candidates.sort((a, b) => a.playerId.localeCompare(b.playerId));
  }

  return candidates[0];
}

/**
 * SHOULD Rule 1: Player A SHOULD NOT be ASSIGNED an <X>ing turn following Player B more than once per season
 */
export function applyShouldRule1(
  candidates: PlayerTurnStats[],
  turnType: 'WRITING' | 'DRAWING',
  currentGameTurns: (Turn & { player: Player | null })[], // Renamed for clarity
  allSeasonGames: (Game & { turns: (Turn & { player: Player | null })[] })[]
): PlayerTurnStats[] {
  // Find Player B (previous player) from the current game's most recent COMPLETED or SKIPPED turn
  const completedOrSkippedCurrentGameTurns = currentGameTurns
    .filter(turn => turn.status === 'COMPLETED' || turn.status === 'SKIPPED')
    .sort((a, b) => b.turnNumber - a.turnNumber);

  if (completedOrSkippedCurrentGameTurns.length === 0) {
    // No previous completed/skipped turn in this game, so rule doesn't apply for this specific assignment.
    return candidates;
  }

  const playerBId = completedOrSkippedCurrentGameTurns[0].playerId;

  if (!playerBId) {
    // Previous turn had no player (should not happen for completed/skipped turns). Rule doesn't apply.
    return candidates;
  }

  const validCandidates = candidates.filter(candidatePlayerA => {
    let timesPlayerAFollowedPlayerB = 0;

    // Check across all games in the season for past instances
    for (const game of allSeasonGames) {
      // Get COMPLETED or SKIPPED turns for this game, sorted by turn number to establish sequence
      const historicalGameTurns = game.turns
        .filter(t => t.status === 'COMPLETED' || t.status === 'SKIPPED')
        .sort((a, b) => a.turnNumber - b.turnNumber);

      for (let i = 0; i < historicalGameTurns.length; i++) {
        const currentTurnInLoop = historicalGameTurns[i];

        // Is this a turn by Player A (the candidate) of the correct type?
        if (
          currentTurnInLoop.playerId === candidatePlayerA.playerId &&
          currentTurnInLoop.type === turnType
        ) {
          // Was the immediately preceding turn in this historical game by Player B?
          if (i > 0) { // Check if there is a preceding turn
            const previousTurnInLoop = historicalGameTurns[i - 1];
            if (previousTurnInLoop.playerId === playerBId) {
              timesPlayerAFollowedPlayerB++;
            }
          }
        }
      }
    }

    // Rule: Player A SHOULD NOT be ASSIGNED ... more than once.
    // This means if they have already followed Player B *once* (timesPlayerAFollowedPlayerB === 1),
    // assigning them the current turn would be the *second* time, thus violating the rule.
    // If timesPlayerAFollowedPlayerB is 0, this current assignment would be the first time, which is allowed.
    return timesPlayerAFollowedPlayerB === 0;
  });

  // If filtering results in an empty list (all candidates would violate the rule),
  // return the original list of candidates (it's a SHOULD rule).
  return validCandidates.length > 0 ? validCandidates : candidates;
}

/**
 * SHOULD Rule 2: Players SHOULD NOT be given an <X>ing turn if they've already been ASSIGNED n/2 <X>ing turns
 */
export function applyShouldRule2(
  candidates: PlayerTurnStats[],
  turnType: 'WRITING' | 'DRAWING',
  totalPlayersInSeason: number
): PlayerTurnStats[] {
  const threshold = Math.floor(totalPlayersInSeason / 2);
  
  const belowThreshold = candidates.filter(player => {
    const turnCount = turnType === 'WRITING' ? player.totalWritingTurns : player.totalDrawingTurns;
    return turnCount < threshold;
  });

  // If some players are below threshold, prefer them; otherwise, use all candidates
  return belowThreshold.length > 0 ? belowThreshold : candidates;
}

/**
 * SHOULD Rule 3: Given an <X>ing turn, prefer the player who has been ASSIGNED the fewest <X>ing turns
 */
export function applyShouldRule3(
  candidates: PlayerTurnStats[],
  turnType: 'WRITING' | 'DRAWING'
): PlayerTurnStats[] {
  if (candidates.length <= 1) {
    return candidates;
  }

  // Find the minimum turn count for the given type
  const minTurnCount = Math.min(...candidates.map(player => 
    turnType === 'WRITING' ? player.totalWritingTurns : player.totalDrawingTurns
  ));

  // Return all players with the minimum turn count
  return candidates.filter(player => {
    const turnCount = turnType === 'WRITING' ? player.totalWritingTurns : player.totalDrawingTurns;
    return turnCount === minTurnCount;
  });
}

/**
 * SHOULD Rule 4: If there is still a tie, prefer players who have fewer PENDING overall turns
 */
function applyShouldRule4(candidates: PlayerTurnStats[]): PlayerTurnStats[] {
  if (candidates.length <= 1) {
    return candidates;
  }

  // Find the minimum pending turn count
  const minPendingTurns = Math.min(...candidates.map(player => player.pendingTurns));

  // Return all players with the minimum pending turn count
  return candidates.filter(player => player.pendingTurns === minPendingTurns);
}

/**
 * Checks if a game is completed based on player turn states.
 * A game is completed when every player in the season has either COMPLETED or been SKIPPED for their turn in that specific game.
 * 
 * @param gameId - The ID of the game to check for completion
 * @param prisma - Prisma client instance for database queries
 * @returns Promise<boolean> - True if the game is completed, false otherwise
 */
export async function checkGameCompletion(
  gameId: string,
  prisma: PrismaClient
): Promise<boolean> {
  try {
    // Get the game with its season and all players in the season
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        season: {
          include: {
            players: {
              include: {
                player: true
              }
            }
          }
        },
        turns: {
          where: {
            status: {
              in: ['COMPLETED', 'SKIPPED']
            }
          },
          include: {
            player: true
          }
        }
      }
    });

    if (!game) {
      Logger.warn(`Game with ID ${gameId} not found during completion check.`);
      return false;
    }

    if (!game.season) {
      Logger.warn(`Game ${gameId} has no associated season during completion check.`);
      return false;
    }

    const seasonPlayers = game.season.players.map(p => p.player);
    
    if (seasonPlayers.length === 0) {
      // This might be a valid state if a season can exist without players, or an error.
      // Using warn as it's potentially an unexpected state for a game completion check.
      Logger.warn(`Season ${game.seasonId} associated with game ${gameId} has no players during completion check.`);
      return false; // Or true, depending on how game completion is defined for a game with no players in season.
                     // Current logic implies it cannot be completed if no players to complete turns.
    }

    // Check if every player in the season has either COMPLETED or SKIPPED a turn in this game
    const playersWithCompletedOrSkippedTurns = new Set(
      game.turns.map(turn => turn.playerId).filter(Boolean)
    );

    // Every player must have at least one COMPLETED or SKIPPED turn in this game
    const allPlayersCompleted = seasonPlayers.every(player => 
      playersWithCompletedOrSkippedTurns.has(player.id)
    );

    Logger.info(
      `Game ${gameId} completion status: ${allPlayersCompleted ? 'COMPLETED' : 'NOT COMPLETED'}. ` +
      `Players with finished turns: ${playersWithCompletedOrSkippedTurns.size}/${seasonPlayers.length}.`
    );
    
    return allPlayersCompleted;

  } catch (error) {
    void Logger.error(`Error in checkGameCompletion for gameId ${gameId}:`, error);
    return false;
  }
}

/**
 * Checks if a season is completed.
 * A season is completed if all its games are in "COMPLETED" status.
 * If completed, updates the season status to "COMPLETED".
 * @param seasonId - The ID of the season to check.
 * @param prisma - Prisma client instance.
 * @returns Promise<{ completed: boolean; season?: Season | null }>
 */
export const checkSeasonCompletion = async (
  seasonId: string,
  prisma: PrismaClient
): Promise<{ completed: boolean; season?: Season | null }> => {
  try {
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      include: {
        games: true, // Fetch all games for the season
      },
    });

    if (!season) {
      console.error(`Season with ID ${seasonId} not found.`);
      return { completed: false, season: null };
    }

    if (season.games.length === 0) {
      console.log(`Season ${seasonId} has no games. Considering it completed by default if it's not in SETUP or PENDING.`);
      // If a season has no games, and it's past initial setup, it could be considered completed.
      // Or handle as an error/specific state depending on business logic.
      if (season.status !== 'SETUP' && season.status !== 'PENDING') {
        const updatedSeason = await prisma.season.update({
          where: { id: seasonId },
          data: { status: 'COMPLETED' },
        });
        return { completed: true, season: updatedSeason };
      }
      return { completed: false, season }; // Or true, depending on desired logic for empty seasons
    }

    // Check if all games are completed
    const allGamesCompleted = season.games.every(
      (game) => game.status === 'COMPLETED'
    );

    if (allGamesCompleted) {
      // If all games are completed, update the season status
      const updatedSeason = await prisma.season.update({
        where: { id: seasonId },
        data: { status: 'COMPLETED' },
      });
      console.log(`Season ${seasonId} is completed. Status updated.`);
      return { completed: true, season: updatedSeason };
    } else {
      console.log(`Season ${seasonId} is not yet completed. Not all games are in 'COMPLETED' status.`);
      return { completed: false, season };
    }
  } catch (error) {
    console.error(`Error checking season completion for ${seasonId}:`, error);
    // Consider re-throwing or returning a more specific error object
    return { completed: false, season: null };
  }
}; 