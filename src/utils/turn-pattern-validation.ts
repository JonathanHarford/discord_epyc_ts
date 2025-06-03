/**
 * Turn pattern validation utilities
 * Provides robust validation for turn patterns used in seasons and games
 */

export type TurnType = 'drawing' | 'writing';

export interface TurnPatternValidationResult {
  isValid: boolean;
  parsedPattern?: TurnType[];
  error?: string;
}

export class TurnPatternValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TurnPatternValidationError';
  }
}

/**
 * Validates a turn pattern string and returns parsed result or throws error
 * @param input The turn pattern string to validate
 * @returns Array of TurnType if valid
 * @throws TurnPatternValidationError if invalid
 */
export function validateTurnPattern(input: unknown): TurnType[] {
  // Check if input is a string
  if (typeof input !== 'string') {
    throw new TurnPatternValidationError(
      `Turn pattern must be a string, received ${typeof input}`
    );
  }

  // Check for empty string
  if (input.trim() === '') {
    throw new TurnPatternValidationError(
      'Turn pattern cannot be empty'
    );
  }

  // Split by comma and trim each part
  const parts = input.split(',').map(part => part.trim());

  // Check for empty parts (caused by extra commas)
  const emptyParts = parts.filter(part => part === '');
  if (emptyParts.length > 0) {
    throw new TurnPatternValidationError(
      'Turn pattern contains empty values (check for extra commas or spaces)'
    );
  }

  // Validate each part
  const validTurnTypes: TurnType[] = ['drawing', 'writing'];
  const parsedPattern: TurnType[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    if (!validTurnTypes.includes(part as TurnType)) {
      throw new TurnPatternValidationError(
        `Invalid turn type '${part}' at position ${i + 1}. Must be 'drawing' or 'writing'`
      );
    }
    
    parsedPattern.push(part as TurnType);
  }

  // Ensure pattern has at least one turn
  if (parsedPattern.length === 0) {
    throw new TurnPatternValidationError(
      'Turn pattern must contain at least one turn type'
    );
  }

  return parsedPattern;
}

/**
 * Validates a turn pattern string and returns a result object instead of throwing
 * @param input The turn pattern string to validate
 * @returns TurnPatternValidationResult with validation status and parsed pattern or error
 */
export function validateTurnPatternSafe(input: unknown): TurnPatternValidationResult {
  try {
    const parsedPattern = validateTurnPattern(input);
    return {
      isValid: true,
      parsedPattern
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof TurnPatternValidationError ? error.message : 'Unknown validation error'
    };
  }
}

/**
 * Checks if a string is a valid turn pattern without parsing
 * @param input The turn pattern string to check
 * @returns True if valid, false otherwise
 */
export function isValidTurnPattern(input: unknown): boolean {
  return validateTurnPatternSafe(input).isValid;
}

/**
 * Formats a turn pattern array back to a string
 * @param pattern Array of turn types
 * @returns Comma-separated string
 */
export function formatTurnPattern(pattern: TurnType[]): string {
  return pattern.join(',');
} 