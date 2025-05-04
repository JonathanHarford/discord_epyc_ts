/**
 * Utility functions for validating game settings
 * Uses Zod schemas for validation
 */
import { 
    durationStringSchema, 
    returnsSchema, 
    turnPatternSchema,
    durationToMilliseconds,
    safeParseDuration
} from './zod-schemas.js';
import { DurationUtils } from './duration-utils.js';

/**
 * Validates a duration string (like "1d", "12h", "30m")
 * @param duration - Duration string to validate
 * @returns Whether the duration is valid
 */
export const validateDuration = (duration: string): boolean => {
    try {
        const result = safeParseDuration(duration);
        return result.success;
    } catch (error) {
        // In case of any error (including empty string), return false
        return false;
    }
};

/**
 * Validates a returns policy string (like "2/3" or "none")
 * @param returns - Returns string to validate
 * @returns Whether the returns policy is valid
 */
export const validateReturns = (returns: string): boolean => {
    const result = returnsSchema.safeParse(returns);
    return result.success;
};

/**
 * Validates a turn pattern string
 * @param pattern - Turn pattern to validate
 * @returns Whether the turn pattern is valid
 */
export const validateTurnPattern = (pattern: string): boolean => {
    const result = turnPatternSchema.safeParse(pattern);
    return result.success;
};

/**
 * Formats a returns policy string for display
 * @param returns - Returns string (like "2/3" or null)
 * @returns Formatted description of the returns policy
 */
export const formatReturnsForDisplay = (returns: string | null): string => {
    if (!returns || returns.toLowerCase() === 'none') {
        return 'Players can only play once per game';
    }
    
    // Validate the format first
    if (!validateReturns(returns)) {
        return 'Invalid returns policy';
    }
    
    const [plays, gap] = returns.split('/').map(num => parseInt(num, 10));
    return `Players can play ${plays} times per game, as long as ${gap} turns have passed in between`;
};

/**
 * Parses a duration string into milliseconds
 * @param duration - Duration string (like "1d", "12h", "30m")
 * @returns Duration in milliseconds
 */
export const parseDurationToMs = (duration: string): number => {
    return durationToMilliseconds(duration);
};

/**
 * Formats a duration string for display
 * @param duration - Duration string (like "1d", "12h", "30m", "2d5h")
 * @returns Human-readable duration string
 */
export const formatDurationForDisplay = (duration: string): string => {
    try {
        // Try to validate the duration first
        if (!validateDuration(duration)) {
            return duration; // Return original if invalid
        }
        
        // Use DurationUtils to parse the duration string
        const ms = DurationUtils.parseDurationString(duration);
        
        // Manual formatting for human-readable output
        const days = Math.floor(ms / (24 * 60 * 60 * 1000));
        const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
        const seconds = Math.floor((ms % (60 * 1000)) / 1000);
        
        const parts: string[] = [];
        
        if (days > 0) {
            parts.push(`${days} day${days !== 1 ? 's' : ''}`);
        }
        
        if (hours > 0) {
            parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
        }
        
        if (minutes > 0) {
            parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
        }
        
        if (seconds > 0) {
            parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
        }
        
        return parts.join(', ');
    } catch (error) {
        return duration; // Return original if any error occurs
    }
}; 