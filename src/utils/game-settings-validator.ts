/**
 * Utility functions for validating game settings
 */

/**
 * Validates a duration string (like "1d", "12h", "30m")
 * @param duration - Duration string to validate
 * @returns Whether the duration is valid
 */
export const validateDuration = (duration: string): boolean => {
    // Valid patterns: Nd (days), Nh (hours), Nm (minutes)
    const durationRegex = /^(\d+)(d|h|m)$/;
    return durationRegex.test(duration);
};

/**
 * Validates a returns policy string (like "2/3" or "none")
 * @param returns - Returns string to validate
 * @returns Whether the returns policy is valid
 */
export const validateReturns = (returns: string): boolean => {
    if (returns.toLowerCase() === 'none') {
        return true;
    }
    
    // Valid pattern: N/M where N and M are positive integers
    const returnsRegex = /^(\d+)\/(\d+)$/;
    if (!returnsRegex.test(returns)) {
        return false;
    }
    
    const [plays, gap] = returns.split('/').map(num => parseInt(num, 10));
    
    // Ensure both numbers are positive
    return plays > 0 && gap > 0;
};

/**
 * Validates a turn pattern string
 * @param pattern - Turn pattern to validate
 * @returns Whether the turn pattern is valid
 */
export const validateTurnPattern = (pattern: string): boolean => {
    // Valid patterns must include at least one "writing" and one "drawing"
    return (
        pattern.includes('writing') && 
        pattern.includes('drawing') && 
        pattern.split(',').every(turn => ['writing', 'drawing'].includes(turn.trim()))
    );
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
    
    const [plays, gap] = returns.split('/').map(num => parseInt(num, 10));
    return `Players can play ${plays} times per game, as long as ${gap} turns have passed in between`;
};

/**
 * Parses a duration string into milliseconds
 * @param duration - Duration string (like "1d", "12h", "30m")
 * @returns Duration in milliseconds
 */
export const parseDurationToMs = (duration: string): number => {
    const durationRegex = /^(\d+)(d|h|m)$/;
    const match = duration.match(durationRegex);
    
    if (!match) {
        throw new Error(`Invalid duration format: ${duration}`);
    }
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    const MS_PER_MINUTE = 60 * 1000;
    const MS_PER_HOUR = 60 * MS_PER_MINUTE;
    const MS_PER_DAY = 24 * MS_PER_HOUR;
    
    switch (unit) {
        case 'd': return value * MS_PER_DAY;
        case 'h': return value * MS_PER_HOUR;
        case 'm': return value * MS_PER_MINUTE;
        default: throw new Error(`Invalid duration unit: ${unit}`);
    }
};

/**
 * Formats a duration string for display
 * @param duration - Duration string (like "1d", "12h", "30m")
 * @returns Human-readable duration string
 */
export const formatDurationForDisplay = (duration: string): string => {
    const durationRegex = /^(\d+)(d|h|m)$/;
    const match = duration.match(durationRegex);
    
    if (!match) {
        return duration; // Return original if invalid
    }
    
    const value = match[1];
    const unit = match[2];
    
    switch (unit) {
        case 'd': return `${value} day${value === '1' ? '' : 's'}`;
        case 'h': return `${value} hour${value === '1' ? '' : 's'}`;
        case 'm': return `${value} minute${value === '1' ? '' : 's'}`;
        default: return duration;
    }
}; 