import { Player, Turn, Game, Season, PlayersOnSeasons, SeasonConfig } from '@prisma/client';

// ============================================================================
// CORE DATA TYPES FOR PURE FUNCTIONS
// ============================================================================

/**
 * Extended types that include related data for pure function processing
 */
export type GameWithRelations = Game & {
  season: SeasonWithRelations;
  turns: TurnWithPlayer[];
};

export type SeasonWithRelations = Season & {
  players: PlayersOnSeasons[];
  games: Game[];
  config: SeasonConfig;
};

export type TurnWithPlayer = Turn & {
  player: Player | null;
};

export type PlayerWithStats = Player & {
  totalWritingTurns: number;
  totalDrawingTurns: number;
  pendingTurns: number;
  hasPlayedInGame: boolean;
};

// ============================================================================
// PURE FUNCTION INPUT TYPES
// ============================================================================

/**
 * Input data for selectNextPlayer pure function
 */
export interface SelectNextPlayerInput {
  gameData: GameWithRelations;
  seasonPlayers: Player[];
  allSeasonGames: (Game & { turns: TurnWithPlayer[] })[];
  turnType: 'WRITING' | 'DRAWING';
}

/**
 * Input data for game completion check
 */
export interface CheckGameCompletionInput {
  gameId: string;
  seasonPlayers: Player[];
  completedOrSkippedTurns: TurnWithPlayer[];
}

/**
 * Input data for season completion check
 */
export interface CheckSeasonCompletionInput {
  season: SeasonWithRelations;
}

/**
 * Input data for season activation
 */
export interface ActivateSeasonInput {
  season: SeasonWithRelations;
}

/**
 * Input data for player operations
 */
export interface PlayerOperationInput {
  discordUserId: string;
  name: string;
  existingPlayer?: Player | null;
}

/**
 * Input data for turn operations
 */
export interface TurnOperationInput {
  turn: Turn;
  playerId?: string;
  submissionData?: {
    textContent?: string;
    imageUrl?: string;
  };
}

// ============================================================================
// PURE FUNCTION RESULT TYPES
// ============================================================================

/**
 * Result from selectNextPlayer pure function
 */
export interface SelectNextPlayerResult {
  success: boolean;
  playerId?: string;
  player?: Player;
  error?: string;
}

/**
 * Result from game completion check
 */
export interface GameCompletionResult {
  isCompleted: boolean;
  playersCompleted: number;
  totalPlayers: number;
}

/**
 * Result from season completion check
 */
export interface SeasonCompletionResult {
  isCompleted: boolean;
  completedGames: number;
  totalGames: number;
}

/**
 * Instructions for database updates
 */
export interface DatabaseUpdateInstruction {
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  table: string;
  where?: Record<string, any>;
  data?: Record<string, any>;
}

/**
 * Result that includes update instructions
 */
export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  updateInstructions?: DatabaseUpdateInstruction[];
}

// ============================================================================
// SPECIFIC OPERATION RESULTS
// ============================================================================

/**
 * Result from season activation logic
 */
export interface SeasonActivationResult extends OperationResult<Season> {
  firstGameId?: string;
  activationInstructions?: {
    updateSeason: { id: string; status: string };
    updateFirstGame: { id: string; status: string };
  };
}

/**
 * Result from player creation/update logic
 */
export interface PlayerOperationResult extends OperationResult<Player> {
  isNewPlayer: boolean;
  nameUpdated: boolean;
}

/**
 * Result from turn operations
 */
export interface TurnOperationResult extends OperationResult<Turn> {
  statusChange?: {
    from: string;
    to: string;
  };
  timestampUpdates?: Record<string, Date>;
}

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

/**
 * Validation result for turn operations
 */
export interface TurnValidationResult {
  isValid: boolean;
  error?: string;
  validationChecks: {
    turnExists: boolean;
    correctStatus: boolean;
    correctPlayer: boolean;
    validSubmissionData: boolean;
  };
}

/**
 * Validation result for player operations
 */
export interface PlayerValidationResult {
  isValid: boolean;
  error?: string;
  validationChecks: {
    validDiscordId: boolean;
    validName: boolean;
    notBanned: boolean;
  };
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Turn type enumeration
 */
export type TurnType = 'WRITING' | 'DRAWING';

/**
 * Turn status enumeration
 */
export type TurnStatus = 'AVAILABLE' | 'OFFERED' | 'PENDING' | 'COMPLETED' | 'SKIPPED';

/**
 * Season status enumeration
 */
export type SeasonStatus = 'SETUP' | 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'TERMINATED';

/**
 * Game status enumeration
 */
export type GameStatus = 'SETUP' | 'ACTIVE' | 'COMPLETED' | 'TERMINATED';

/**
 * Player statistics for next player selection
 */
export interface PlayerTurnStats {
  playerId: string;
  player: Player;
  totalWritingTurns: number;
  totalDrawingTurns: number;
  pendingTurns: number;
  hasPlayedInGame: boolean;
} 