/**
 * Utility class for handling duration strings and conversions between duration strings and milliseconds.
 * Supports formats like "3d", "2d5m", "7d1s", etc.
 */
export class DurationUtils {
    // Time constants in milliseconds
    private static readonly SECOND_MS = 1000;
    private static readonly MINUTE_MS = 60 * DurationUtils.SECOND_MS;
    private static readonly HOUR_MS = 60 * DurationUtils.MINUTE_MS;
    private static readonly DAY_MS = 24 * DurationUtils.HOUR_MS;

    // Unit mapping for parsing
    private static readonly UNIT_MAP: Record<string, number> = {
        'd': DurationUtils.DAY_MS,
        'h': DurationUtils.HOUR_MS,
        'm': DurationUtils.MINUTE_MS,
        's': DurationUtils.SECOND_MS,
    };

    /**
     * Parses a duration string into milliseconds.
     * Valid formats: 3d, 2d5m, 7d1s, 1h30m, etc.
     * Units must be ordered from largest to smallest (d > h > m > s).
     * 
     * @param durationStr - The duration string to parse
     * @returns The duration in milliseconds
     * @throws Error if the format is invalid
     */
    public static parseDurationString(durationStr: string): number {
        // Empty string check
        if (!durationStr || durationStr.trim() === '') {
            throw new Error('Duration string cannot be empty');
        }

        // Validate format using regex
        // Valid format: digits followed by unit (d,h,m,s), repeated one or more times
        const formatRegex = /^(\d+[dhms])+$/;
        if (!formatRegex.test(durationStr)) {
            throw new Error('Invalid duration format. Use format like "3d", "2d5m", "1h30m", etc.');
        }

        // Extract all duration parts (number + unit)
        const durationParts = durationStr.match(/\d+[dhms]/g) || [];
        
        // Track seen units to ensure correct order (d > h > m > s)
        const seenUnits: string[] = [];
        
        // Calculate total milliseconds
        let totalMs = 0;
        
        for (const part of durationParts) {
            const unit = part.slice(-1);
            const value = parseInt(part.slice(0, -1), 10);
            
            // Validate unit order
            if (seenUnits.length > 0) {
                const lastUnit = seenUnits[seenUnits.length - 1];
                const unitOrder = Object.keys(DurationUtils.UNIT_MAP);
                
                if (unitOrder.indexOf(unit) <= unitOrder.indexOf(lastUnit)) {
                    throw new Error('Units must be in order from largest to smallest (d > h > m > s)');
                }
            }
            
            // Validate unit is supported
            if (!(unit in DurationUtils.UNIT_MAP)) {
                throw new Error(`Unsupported unit: ${unit}. Only d, h, m, s are supported.`);
            }
            
            // Add to total
            totalMs += value * DurationUtils.UNIT_MAP[unit];
            seenUnits.push(unit);
        }
        
        return totalMs;
    }

    /**
     * Generates a duration string from milliseconds.
     * Formats to the most compact representation.
     * Doesn't display zero units and converts to largest units when possible.
     * 
     * @param ms - The duration in milliseconds
     * @returns The formatted duration string
     */
    public static generateDurationString(ms: number): string {
        // Handle negative values
        if (ms < 0) {
            throw new Error('Duration cannot be negative');
        }
        
        // Handle zero duration
        if (ms === 0) {
            return '0s';
        }
        
        // Calculate each unit
        const days = Math.floor(ms / DurationUtils.DAY_MS);
        ms %= DurationUtils.DAY_MS;
        
        const hours = Math.floor(ms / DurationUtils.HOUR_MS);
        ms %= DurationUtils.HOUR_MS;
        
        const minutes = Math.floor(ms / DurationUtils.MINUTE_MS);
        ms %= DurationUtils.MINUTE_MS;
        
        const seconds = Math.floor(ms / DurationUtils.SECOND_MS);
        
        // Build the duration string
        const parts: string[] = [];
        
        // Always use the largest unit possible
        if (days > 0) {
            parts.push(`${days}d`);
        }
        
        if (hours > 0) {
            parts.push(`${hours}h`);
        }
        
        if (minutes > 0) {
            parts.push(`${minutes}m`);
        }
        
        if (seconds > 0) {
            parts.push(`${seconds}s`);
        }
        
        // If all parts are 0 but we had a non-zero input, at least show seconds
        if (parts.length === 0 && ms > 0) {
            parts.push('1s'); // Show at least 1 second for very small durations
        }
        
        return parts.join('');
    }
} 