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
  .transform((value) => {
    try {
      // Don't attempt transformation if the value didn't pass refinement
      // This should never happen due to the refine above, but adding as a safeguard
      return {
        value,
        milliseconds: DurationUtils.parseDurationString(value)
      };
    } catch (error) {
      // If we somehow get here with an invalid value, return a default
      return {
        value,
        milliseconds: 0
      };
    }
  });

/**
 * Type for the parsed duration result
 */
export type ParsedDuration = z.infer<typeof durationStringSchema>;

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