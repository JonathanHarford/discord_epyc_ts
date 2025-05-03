import { generateUniqueId } from './utils.js';

/**
 * Service for general utility functions
 */
export class UtilityService {
    /**
     * Generate a unique ID for database records
     * @param length Length of the ID
     * @returns Unique ID string
     */
    public generateId(length: number = 10): string {
        return generateUniqueId(length);
    }
} 