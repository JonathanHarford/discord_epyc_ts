import { describe, expect, test } from 'vitest';
import {
    formatReturnsForDisplay
} from '../../src/utils/game-settings-validator.js';
import {
    durationStringSchema,
    returnsSchema,
    turnPatternSchema
} from '../../src/utils/zod-schemas.js';

describe('durationStringSchema', () => {
    test('should validate valid duration strings', () => {
        expect(durationStringSchema.safeParse('1d').success).toBe(true);
        expect(durationStringSchema.safeParse('12h').success).toBe(true);
        expect(durationStringSchema.safeParse('30m').success).toBe(true);
        expect(durationStringSchema.safeParse('45s').success).toBe(true);
        expect(durationStringSchema.safeParse('2d5h').success).toBe(true);
        expect(durationStringSchema.safeParse('1h30m').success).toBe(true);
    });

    test('should reject invalid duration strings', () => {
        // Invalid but non-empty strings - these get caught by the refine() in the schema
        expect(durationStringSchema.safeParse('invalid').success).toBe(false);
        expect(durationStringSchema.safeParse('1d 2h').success).toBe(false); // Spaces not allowed
        expect(durationStringSchema.safeParse('1m30h').success).toBe(false); // Wrong order
        
        // Empty string - this gets caught by the min(1) validator
        expect(durationStringSchema.safeParse('').success).toBe(false);
    });
});

describe('returnsSchema', () => {
    test('should validate valid returns policies', () => {
        expect(returnsSchema.safeParse('2/3').success).toBe(true);
        expect(returnsSchema.safeParse('1/5').success).toBe(true);
        expect(returnsSchema.safeParse('none').success).toBe(true);
        expect(returnsSchema.safeParse('None').success).toBe(true);
    });

    test('should reject invalid returns policies', () => {
        expect(returnsSchema.safeParse('').success).toBe(false);
        expect(returnsSchema.safeParse('2').success).toBe(false);
        expect(returnsSchema.safeParse('2/').success).toBe(false);
        expect(returnsSchema.safeParse('/3').success).toBe(false);
        expect(returnsSchema.safeParse('0/3').success).toBe(false); // Zero not allowed
        expect(returnsSchema.safeParse('abc').success).toBe(false);
    });
});

describe('turnPatternSchema', () => {
    test('should validate valid turn patterns', () => {
        expect(turnPatternSchema.safeParse('writing,drawing').success).toBe(true);
        expect(turnPatternSchema.safeParse('drawing,writing').success).toBe(true);
    });

    test('should reject invalid turn patterns', () => {
        expect(turnPatternSchema.safeParse('').success).toBe(false);
        expect(turnPatternSchema.safeParse('writing').success).toBe(false);
        expect(turnPatternSchema.safeParse('drawing').success).toBe(false);
        expect(turnPatternSchema.safeParse('writing,reading').success).toBe(false);
    });
});

describe('formatReturnsForDisplay', () => {
    test('should format valid returns policies', () => {
        expect(formatReturnsForDisplay('2/3')).toBe('Players can play 2 times per game, as long as 3 turns have passed in between');
        expect(formatReturnsForDisplay('1/5')).toBe('Players can play 1 times per game, as long as 5 turns have passed in between');
    });

    test('should handle null or "none" returns policies', () => {
        expect(formatReturnsForDisplay(null)).toBe('Players can only play once per game');
        expect(formatReturnsForDisplay('none')).toBe('Players can only play once per game');
        expect(formatReturnsForDisplay('None')).toBe('Players can only play once per game');
    });

    test('should handle invalid returns policies', () => {
        expect(formatReturnsForDisplay('invalid')).toBe('Invalid returns policy');
    });
});