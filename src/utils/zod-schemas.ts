import { z } from 'zod';
import { DurationUtils } from './duration-utils.js';

/**
 * Zod schema for validating duration strings
 * 
 * Valid formats:
 * - Single unit: "3d", "5h", "10m", "30s"
 * - Combined units: "2d5h", "1h30m", "7d1s", "1d2h3m4s"
 * - Units must be in order from largest to smallest (d > h > m > s)
 * 
 * The schema returns the original validated string and provides transform methods
 * to convert to milliseconds.
 */
export const durationStringSchema = z
  .string()
  .min(1, { message: 'Duration string cannot be empty' })
  .refine(
    (value) => {
      try {
        // Use the existing DurationUtils to validate the format
        DurationUtils.parseDurationString(value);
        return true;
      } catch (error) {
        return false;
      }
    },
    {
      message: 'Invalid duration format. Use format like "3d", "2d5m", "1h30m", etc.'
    }
  )
  .transform((value) => ({
    // Return both the original string and parsed milliseconds
    value,
    milliseconds: DurationUtils.parseDurationString(value)
  }));

/**
 * Type for the parsed duration result
 */
export type ParsedDuration = z.infer<typeof durationStringSchema>;

/**
 * Helper function to validate and parse a duration string
 * 
 * @param durationStr - The duration string to validate and parse
 * @returns A validated and parsed duration object or throws a ZodError
 */
export function parseDuration(durationStr: string): ParsedDuration {
  return durationStringSchema.parse(durationStr);
}

/**
 * Helper function to safely validate and parse a duration string
 * 
 * @param durationStr - The duration string to validate and parse
 * @returns Result containing either the parsed duration or an error
 */
export function safeParseDuration(durationStr: string) {
  // We'll simplify this by directly calling safeParse and using its results
  // If there are any issues, they'll be properly handled by zod's safeParse
  const result = durationStringSchema.safeParse(durationStr);
  return result;
}

/**
 * Zod schema for validating turn patterns
 * Valid patterns include "writing,drawing" or "drawing,writing"
 */
export const turnPatternSchema = z
  .string()
  .refine(
    (value) => {
      return (
        value.includes('writing') &&
        value.includes('drawing') &&
        value.split(',').every(turn => ['writing', 'drawing'].includes(turn.trim()))
      );
    },
    {
      message: 'Turn pattern must include both "writing" and "drawing" terms separated by commas'
    }
  );

/**
 * Zod schema for validating returns policy
 * Valid formats: "2/3" or "none"
 */
export const returnsSchema = z
  .string()
  .refine(
    (value) => {
      if (value.toLowerCase() === 'none') {
        return true;
      }
      
      const returnsRegex = /^(\d+)\/(\d+)$/;
      if (!returnsRegex.test(value)) {
        return false;
      }
      
      const [plays, gap] = value.split('/').map(num => parseInt(num, 10));
      return plays > 0 && gap > 0;
    },
    {
      message: 'Returns must be in the format "N/M" (e.g., "2/3") or "none"'
    }
  );

/**
 * Transform a duration string to milliseconds using DurationUtils
 */
export function durationToMilliseconds(duration: string): number {
  return DurationUtils.parseDurationString(duration);
}

/**
 * Transform milliseconds to a duration string using DurationUtils
 */
export function millisecondsToDuration(ms: number): string {
  return DurationUtils.generateDurationString(ms);
} 