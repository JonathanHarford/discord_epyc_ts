/**
 * Utility functions for formatting game settings
 * Uses Zod schemas for validation when needed
 */
import { 
    returnsSchema
} from './zod-schemas.js';

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
    const result = returnsSchema.safeParse(returns);
    if (!result.success) {
        return 'Invalid returns policy';
    }
    
    const [plays, gap] = returns.split('/').map(num => parseInt(num, 10));
    return `Players can play ${plays} times per game, as long as ${gap} turns have passed in between`;
};