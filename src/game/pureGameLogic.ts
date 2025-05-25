import {
  SelectNextPlayerInput,
  SelectNextPlayerResult,
  CheckGameCompletionInput,
  GameCompletionResult,
  CheckSeasonCompletionInput,
  SeasonCompletionResult,
  ActivateSeasonInput,
  SeasonActivationResult,
  PlayerOperationInput,
  PlayerOperationResult,
  TurnOperationInput,
  TurnOperationResult,
  TurnValidationResult,
  PlayerValidationResult,
  PlayerTurnStats,
  TurnType,
  TurnStatus,
} from './types.js';
import { Player, Turn, Game, Season } from '@prisma/client';

// ============================================================================
// PURE GAME LOGIC FUNCTION INTERFACES
// ============================================================================

/**
 * Pure function to select the next player for a turn based on game rules.
 * Replaces: selectNextPlayer(gameId, turnType, prisma)
 * 
 * @param input - All data needed for player selection
 * @returns Result containing selected player or error
 */
export function selectNextPlayerPure(input: SelectNextPlayerInput): SelectNextPlayerResult {
  try {
    const { gameData, seasonPlayers, allSeasonGames, turnType } = input;

    if (!gameData.season) {
      return { success: false, error: 'Game has no associated season' };
    }

    if (seasonPlayers.length === 0) {
      return { success: false, error: 'No players in season' };
    }

    // Calculate player statistics for MUST and SHOULD rule evaluation
    const playerStats: PlayerTurnStats[] = calculatePlayerStats(
      seasonPlayers,
      allSeasonGames,
      gameData.id
    );

    // Apply MUST rules (hard constraints)
    const eligiblePlayers = applyMustRules(playerStats);

    if (eligiblePlayers.length === 0) {
      return { success: false, error: 'No eligible players found after applying MUST rules' };
    }

    // Apply SHOULD rules (prioritization) in sequence
    const selectedPlayer = applyShouldRules(
      eligiblePlayers,
      turnType,
      gameData.turns, // current game's turns
      seasonPlayers.length,
      allSeasonGames // Pass all season games
    );

    return {
      success: true,
      playerId: selectedPlayer.playerId,
      player: selectedPlayer.player
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Pure function to check if a game is completed.
 * Replaces: checkGameCompletion(gameId, prisma)
 * 
 * @param input - Game data and player information
 * @returns Result indicating if game is completed
 */
export function checkGameCompletionPure(input: CheckGameCompletionInput): GameCompletionResult {
  const { seasonPlayers, completedOrSkippedTurns } = input;

  if (seasonPlayers.length === 0) {
    return {
      isCompleted: false,
      playersCompleted: 0,
      totalPlayers: 0
    };
  }

  // Check if every player in the season has either COMPLETED or SKIPPED a turn in this game
  const playersWithCompletedOrSkippedTurns = new Set(
    completedOrSkippedTurns.map(turn => turn.playerId).filter(Boolean)
  );

  // Every player must have at least one COMPLETED or SKIPPED turn in this game
  const playersCompleted = seasonPlayers.filter(player => 
    playersWithCompletedOrSkippedTurns.has(player.id)
  ).length;

  const isCompleted = playersCompleted === seasonPlayers.length;

  return {
    isCompleted,
    playersCompleted,
    totalPlayers: seasonPlayers.length
  };
}

/**
 * Pure function to check if a season is completed.
 * Replaces: checkSeasonCompletion(seasonId, prisma, seasonService?)
 * 
 * @param input - Season data with games
 * @returns Result indicating if season is completed
 */
export function checkSeasonCompletionPure(input: CheckSeasonCompletionInput): SeasonCompletionResult {
  const { season } = input;

  if (season.games.length === 0) {
    // If a season has no games, and it's past initial setup, it could be considered completed.
    if (season.status !== 'SETUP' && season.status !== 'PENDING') {
      return {
        isCompleted: true,
        completedGames: 0,
        totalGames: 0
      };
    }
    return {
      isCompleted: false,
      completedGames: 0,
      totalGames: 0
    };
  }

  // Check if all games are completed
  const completedGames = season.games.filter(game => game.status === 'COMPLETED');
  const allGamesCompleted = completedGames.length === season.games.length;

  return {
    isCompleted: allGamesCompleted,
    completedGames: completedGames.length,
    totalGames: season.games.length
  };
}

/**
 * Pure function to determine season activation logic.
 * Replaces: activateSeasonPlaceholder(seasonId, prisma)
 * 
 * @param input - Season data
 * @returns Result with activation instructions
 */
export function activateSeasonPure(input: ActivateSeasonInput): SeasonActivationResult {
  const { season } = input;

  if (season.games.length === 0) {
    return {
      success: false,
      error: `Season with ID ${season.id} has no games to activate.`
    };
  }

  // Sort games by creation date to get the first game
  const sortedGames = [...season.games].sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const firstGame = sortedGames[0];

  const updatedSeason: Season = {
    ...season,
    status: 'ACTIVE',
    updatedAt: new Date()
  };

  return {
    success: true,
    data: updatedSeason,
    firstGameId: firstGame.id,
    activationInstructions: {
      updateSeason: { id: season.id, status: 'ACTIVE' },
      updateFirstGame: { id: firstGame.id, status: 'ACTIVE' }
    },
    updateInstructions: [
      {
        type: 'UPDATE',
        table: 'season',
        where: { id: season.id },
        data: { status: 'ACTIVE', updatedAt: new Date() }
      },
      {
        type: 'UPDATE',
        table: 'game',
        where: { id: firstGame.id },
        data: { status: 'ACTIVE', updatedAt: new Date() }
      }
    ]
  };
}

// ============================================================================
// PURE PLAYER LOGIC FUNCTION INTERFACES
// ============================================================================

/**
 * Pure function to determine player creation/update logic.
 * Replaces: addPlayerPlaceholder(discordUserId, name, prisma)
 * 
 * @param input - Player data and existing player info
 * @returns Result with player operation instructions
 */
export function processPlayerOperationPure(input: PlayerOperationInput): PlayerOperationResult {
  const { discordUserId, name, existingPlayer } = input;

  if (existingPlayer) {
    // Player exists - check if name needs updating
    const nameUpdated = existingPlayer.name !== name;
    
    if (nameUpdated) {
      const updatedPlayer: Player = {
        ...existingPlayer,
        name,
        updatedAt: new Date()
      };

      return {
        success: true,
        data: updatedPlayer,
        isNewPlayer: false,
        nameUpdated: true,
        updateInstructions: [{
          type: 'UPDATE',
          table: 'player',
          where: { id: existingPlayer.id },
          data: { name, updatedAt: new Date() }
        }]
      };
    } else {
      // No update needed
      return {
        success: true,
        data: existingPlayer,
        isNewPlayer: false,
        nameUpdated: false
      };
    }
  } else {
    // Create new player
    const newPlayerData = {
      discordUserId,
      name,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return {
      success: true,
      data: newPlayerData as Player, // Will get ID from database
      isNewPlayer: true,
      nameUpdated: false,
      updateInstructions: [{
        type: 'CREATE',
        table: 'player',
        data: newPlayerData
      }]
    };
  }
}

/**
 * Pure function to validate player data.
 * 
 * @param input - Player data to validate
 * @returns Validation result
 */
export function validatePlayerDataPure(input: PlayerOperationInput): PlayerValidationResult {
  // Implementation will be added in next subtask
  throw new Error('Not implemented yet');
}

// ============================================================================
// PURE TURN LOGIC FUNCTION INTERFACES
// ============================================================================

/**
 * Pure function to validate turn claim operation.
 * Replaces validation logic from: claimTurnPlaceholder(turnId, playerId, prisma)
 * 
 * @param input - Turn and player data
 * @returns Validation result
 */
export function validateTurnClaimPure(input: TurnOperationInput): TurnValidationResult {
  const { turn, playerId } = input;

  const validationChecks = {
    turnExists: !!turn,
    correctStatus: turn?.status === 'OFFERED',
    correctPlayer: !turn?.playerId || turn.playerId === playerId,
    validSubmissionData: true // Not relevant for claim operation
  };

  let isValid = true;
  let error: string | undefined;

  if (!validationChecks.turnExists) {
    isValid = false;
    error = 'Turn not found';
  } else if (!validationChecks.correctStatus) {
    isValid = false;
    error = `Turn is not in 'OFFERED' state (current: ${turn.status}). Cannot claim.`;
  } else if (!validationChecks.correctPlayer) {
    isValid = false;
    error = `Turn was offered to player ${turn.playerId}, not ${playerId}. Cannot claim.`;
  }

  return {
    isValid,
    error,
    validationChecks
  };
}

/**
 * Pure function to process turn claim logic.
 * Replaces: claimTurnPlaceholder(turnId, playerId, prisma)
 * 
 * @param input - Turn and player data
 * @returns Result with turn update instructions
 */
export function processTurnClaimPure(input: TurnOperationInput): TurnOperationResult {
  const { turn, playerId } = input;

  if (!playerId) {
    return {
      success: false,
      error: 'Player ID is required for turn claim'
    };
  }

  const updatedTurn: Turn = {
    ...turn,
    status: 'PENDING',
    playerId: playerId,
    claimedAt: new Date()
  };

  return {
    success: true,
    data: updatedTurn,
    statusChange: {
      from: turn.status,
      to: 'PENDING'
    },
    timestampUpdates: {
      claimedAt: new Date()
    },
    updateInstructions: [{
      type: 'UPDATE',
      table: 'turn',
      where: { id: turn.id },
      data: {
        status: 'PENDING',
        playerId: playerId,
        claimedAt: new Date()
      }
    }]
  };
}

/**
 * Pure function to validate turn submission.
 * Replaces validation logic from: submitTurnPlaceholder(turnId, playerId, submissionData, prisma)
 * 
 * @param input - Turn, player, and submission data
 * @returns Validation result
 */
export function validateTurnSubmissionPure(input: TurnOperationInput): TurnValidationResult {
  // Implementation will be added in next subtask
  throw new Error('Not implemented yet');
}

/**
 * Pure function to process turn submission logic.
 * Replaces: submitTurnPlaceholder(turnId, playerId, submissionData, prisma)
 * 
 * @param input - Turn, player, and submission data
 * @returns Result with turn update instructions
 */
export function processTurnSubmissionPure(input: TurnOperationInput): TurnOperationResult {
  // Implementation will be added in next subtask
  throw new Error('Not implemented yet');
}

/**
 * Pure function to validate turn offer operation.
 * Replaces validation logic from: offerTurnPlaceholder(turnId, playerId, prisma)
 * 
 * @param input - Turn and player data
 * @returns Validation result
 */
export function validateTurnOfferPure(input: TurnOperationInput): TurnValidationResult {
  // Implementation will be added in next subtask
  throw new Error('Not implemented yet');
}

/**
 * Pure function to process turn offer logic.
 * Replaces: offerTurnPlaceholder(turnId, playerId, prisma)
 * 
 * @param input - Turn and player data
 * @returns Result with turn update instructions
 */
export function processTurnOfferPure(input: TurnOperationInput): TurnOperationResult {
  // Implementation will be added in next subtask
  throw new Error('Not implemented yet');
}

/**
 * Pure function to validate turn skip operation.
 * Replaces validation logic from: skipTurnPlaceholder(turnId, prisma)
 * 
 * @param input - Turn data
 * @returns Validation result
 */
export function validateTurnSkipPure(input: TurnOperationInput): TurnValidationResult {
  // Implementation will be added in next subtask
  throw new Error('Not implemented yet');
}

/**
 * Pure function to process turn skip logic.
 * Replaces: skipTurnPlaceholder(turnId, prisma)
 * 
 * @param input - Turn data
 * @returns Result with turn update instructions
 */
export function processTurnSkipPure(input: TurnOperationInput): TurnOperationResult {
  // Implementation will be added in next subtask
  throw new Error('Not implemented yet');
}

/**
 * Pure function to validate dismiss offer operation.
 * Replaces validation logic from: dismissOfferPlaceholder(turnId, playerIdWhoWasOffered, prisma)
 * 
 * @param input - Turn and player data
 * @returns Validation result
 */
export function validateDismissOfferPure(input: TurnOperationInput): TurnValidationResult {
  // Implementation will be added in next subtask
  throw new Error('Not implemented yet');
}

/**
 * Pure function to process dismiss offer logic.
 * Replaces: dismissOfferPlaceholder(turnId, playerIdWhoWasOffered, prisma)
 * 
 * @param input - Turn and player data
 * @returns Result with turn update instructions
 */
export function processDismissOfferPure(input: TurnOperationInput): TurnOperationResult {
  // Implementation will be added in next subtask
  throw new Error('Not implemented yet');
}

// ============================================================================
// PURE SEASON LOGIC FUNCTION INTERFACES
// ============================================================================

/**
 * Pure function to validate season creation.
 * Replaces validation logic from: createSeasonPlaceholder(creatorId, configId, prisma)
 * 
 * @param creatorId - ID of the player creating the season
 * @param configId - ID of the season configuration
 * @returns Validation result
 */
export function validateSeasonCreationPure(creatorId: string, configId: string): { isValid: boolean; error?: string } {
  // Implementation will be added in next subtask
  throw new Error('Not implemented yet');
}

/**
 * Pure function to process season creation logic.
 * Replaces: createSeasonPlaceholder(creatorId, configId, prisma)
 * 
 * @param creatorId - ID of the player creating the season
 * @param configId - ID of the season configuration
 * @returns Result with season creation instructions
 */
export function processSeasonCreationPure(creatorId: string, configId: string): {
  success: boolean;
  seasonData?: {
    creatorId: string;
    configId: string;
    status: string;
  };
  error?: string;
} {
  // Implementation will be added in next subtask
  throw new Error('Not implemented yet');
}

// ============================================================================
// HELPER FUNCTIONS (ALREADY PURE - TO BE MOVED HERE)
// ============================================================================

/**
 * Calculate comprehensive statistics for each player in the season.
 * This function is already pure and moved from gameLogic.ts
 */
export function calculatePlayerStats(
  seasonPlayers: Player[],
  allSeasonGames: (Game & { turns: (Turn & { player: Player | null })[] })[],
  currentGameId: string,
): PlayerTurnStats[] {
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
 * Apply MUST rules (hard constraints) to filter eligible players.
 * This function is already pure and moved from gameLogic.ts
 */
export function applyMustRules(playerStats: PlayerTurnStats[]): PlayerTurnStats[] {
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
 * Apply SHOULD rules (prioritization) in sequence to select the best player.
 * This function is already pure and moved from gameLogic.ts
 */
export function applyShouldRules(
  eligiblePlayers: PlayerTurnStats[],
  turnType: TurnType,
  gameTurns: (Turn & { player: Player | null })[],
  totalPlayersInSeason: number,
  allSeasonGames: (Game & { turns: (Turn & { player: Player | null })[] })[]
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
 * SHOULD Rule 1: Player A SHOULD NOT be ASSIGNED an <X>ing turn following Player B more than once per season.
 * This function is already pure and moved from gameLogic.ts
 */
export function applyShouldRule1(
  candidates: PlayerTurnStats[],
  turnType: TurnType,
  currentGameTurns: (Turn & { player: Player | null })[],
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
 * SHOULD Rule 2: Players SHOULD NOT be given an <X>ing turn if they've already been ASSIGNED n/2 <X>ing turns.
 * This function is already pure and moved from gameLogic.ts
 */
export function applyShouldRule2(
  candidates: PlayerTurnStats[],
  turnType: TurnType,
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
 * SHOULD Rule 3: Given an <X>ing turn, prefer the player who has been ASSIGNED the fewest <X>ing turns.
 * This function is already pure and moved from gameLogic.ts
 */
export function applyShouldRule3(
  candidates: PlayerTurnStats[],
  turnType: TurnType
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
 * SHOULD Rule 4: If there is still a tie, prefer players who have fewer PENDING overall turns.
 * This function is already pure and moved from gameLogic.ts
 */
export function applyShouldRule4(candidates: PlayerTurnStats[]): PlayerTurnStats[] {
  if (candidates.length <= 1) {
    return candidates;
  }

  // Find the minimum pending turn count
  const minPendingTurns = Math.min(...candidates.map(player => player.pendingTurns));

  // Return all players with the minimum pending turn count
  return candidates.filter(player => player.pendingTurns === minPendingTurns);
} 