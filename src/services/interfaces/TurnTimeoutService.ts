import { Turn } from '@prisma/client';

/**
 * Interface for turn timeout operations that can be used by both
 * SeasonTurnService and OnDemandTurnService
 */
export interface TurnTimeoutService {
  /**
   * Dismisses an offered turn, typically called when a claim timeout occurs.
   * For on-demand games, this might be equivalent to unassigning a turn.
   * @param turnId The ID of the turn to dismiss/unassign
   * @returns Success status with optional turn data or error message
   */
  dismissOffer(turnId: string): Promise<{ success: boolean; turn?: Turn; error?: string }>;

  /**
   * Skips a turn that is currently pending, typically called when a submission timeout occurs.
   * @param turnId The ID of the turn to skip
   * @returns Success status with optional turn data or error message
   */
  skipTurn(turnId: string): Promise<{ success: boolean; turn?: Turn; error?: string }>;
} 