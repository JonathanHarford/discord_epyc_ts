import { PrismaClient, Player, Turn, Game, Season, PlayersOnSeasons } from '@prisma/client';

export const activateSeasonPlaceholder = () => {
  // TODO: Implement activateSeasonPlaceholder logic
  console.log('activateSeasonPlaceholder called');
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
      game.turns,
      seasonPlayers.length
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
  gameTurns: (Turn & { player: Player | null })[],
  totalPlayersInSeason: number
): PlayerTurnStats {
  let candidates = [...eligiblePlayers];

  // SHOULD Rule 1: Player A SHOULD NOT be ASSIGNED an <X>ing turn following Player B more than once per season
  // This requires checking the previous turn in this specific game
  candidates = applyShouldRule1(candidates, turnType, gameTurns);

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
function applyShouldRule1(
  candidates: PlayerTurnStats[],
  turnType: 'WRITING' | 'DRAWING',
  gameTurns: (Turn & { player: Player | null })[]
): PlayerTurnStats[] {
  // Find the most recent completed turn in this game
  const completedTurns = gameTurns
    .filter(turn => turn.status === 'COMPLETED')
    .sort((a, b) => b.turnNumber - a.turnNumber);

  if (completedTurns.length === 0) {
    // No previous turns, all candidates are equally valid
    return candidates;
  }

  const lastCompletedTurn = completedTurns[0];
  const previousPlayerId = lastCompletedTurn.playerId;

  if (!previousPlayerId) {
    return candidates;
  }

  // TODO: Implement cross-game tracking for this rule
  // For now, we'll skip this rule as it requires complex season-wide tracking
  // This would need to track all turn sequences across all games in the season
  
  return candidates;
}

/**
 * SHOULD Rule 2: Players SHOULD NOT be given an <X>ing turn if they've already been ASSIGNED n/2 <X>ing turns
 */
function applyShouldRule2(
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
function applyShouldRule3(
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
      console.error(`Game with ID ${gameId} not found`);
      return false;
    }

    if (!game.season) {
      console.error(`Game ${gameId} has no associated season`);
      return false;
    }

    const seasonPlayers = game.season.players.map(p => p.player);
    
    if (seasonPlayers.length === 0) {
      console.error(`Season ${game.seasonId} has no players`);
      return false;
    }

    // Check if every player in the season has either COMPLETED or SKIPPED a turn in this game
    const playersWithCompletedOrSkippedTurns = new Set(
      game.turns.map(turn => turn.playerId).filter(Boolean)
    );

    // Every player must have at least one COMPLETED or SKIPPED turn in this game
    const allPlayersCompleted = seasonPlayers.every(player => 
      playersWithCompletedOrSkippedTurns.has(player.id)
    );

    console.log(`Game ${gameId} completion check: ${allPlayersCompleted ? 'COMPLETED' : 'NOT COMPLETED'} (${playersWithCompletedOrSkippedTurns.size}/${seasonPlayers.length} players have finished turns)`);
    
    return allPlayersCompleted;

  } catch (error) {
    console.error('Error in checkGameCompletion:', error);
    return false;
  }
}

export const checkSeasonCompletionPlaceholder = () => {
  // TODO: Implement checkSeasonCompletionPlaceholder logic
  console.log('checkSeasonCompletionPlaceholder called');
}; 