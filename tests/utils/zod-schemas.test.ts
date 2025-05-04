import { describe, expect, test, vi } from 'vitest';
import { 
    durationStringSchema, 
    turnPatternSchema, 
    returnsSchema,
    durationToMilliseconds,
    millisecondsToDuration
} from '../../src/utils/index.js';

describe('durationStringSchema', () => {
    test('should validate valid single-unit duration strings', () => {
        // Test single units
        expect(() => durationStringSchema.parse('3d')).not.toThrow();
        expect(() => durationStringSchema.parse('12h')).not.toThrow();
        expect(() => durationStringSchema.parse('45m')).not.toThrow();
        expect(() => durationStringSchema.parse('30s')).not.toThrow();
    });

    test('should validate valid multi-unit duration strings', () => {
        // Test multiple units
        expect(() => durationStringSchema.parse('2d5h')).not.toThrow();
        expect(() => durationStringSchema.parse('1h30m')).not.toThrow();
        expect(() => durationStringSchema.parse('10m15s')).not.toThrow();
        expect(() => durationStringSchema.parse('1d2h3m4s')).not.toThrow();
    });

    test('should reject invalid duration strings', () => {
        // Test invalid formats
        expect(() => durationStringSchema.parse('')).toThrow();
        expect(() => durationStringSchema.parse('abc')).toThrow();
        expect(() => durationStringSchema.parse('1x')).toThrow();
        expect(() => durationStringSchema.parse('1d 2h')).toThrow(); // spaces not allowed
    });

    test('should reject incorrect unit order', () => {
        // Test incorrect unit order
        expect(() => durationStringSchema.parse('1m2h')).toThrow();
        expect(() => durationStringSchema.parse('1s30m')).toThrow();
        expect(() => durationStringSchema.parse('5h2d')).toThrow();
    });

    test('should transform duration string to an object with value and milliseconds', () => {
        // Test transformation
        const result = durationStringSchema.parse('1d12h');
        expect(result).toHaveProperty('value', '1d12h');
        expect(result).toHaveProperty('milliseconds');
        expect(result.milliseconds).toBe(86400000 + 43200000); // 1 day + 12 hours in ms
    });
});

describe('durationToMilliseconds and millisecondsToDuration functions', () => {
    test('should convert duration strings to milliseconds', () => {
        expect(durationToMilliseconds('1d')).toBe(86400000);
        expect(durationToMilliseconds('2h')).toBe(7200000);
        expect(durationToMilliseconds('30m')).toBe(1800000);
        expect(durationToMilliseconds('45s')).toBe(45000);
    });

    test('should convert milliseconds to duration strings', () => {
        expect(millisecondsToDuration(86400000)).toBe('1d');
        expect(millisecondsToDuration(7200000)).toBe('2h');
        expect(millisecondsToDuration(1800000)).toBe('30m');
        expect(millisecondsToDuration(45000)).toBe('45s');
    });

    test('should maintain consistency when converting back and forth', () => {
        const testCases = ['1d', '5h', '30m', '10s', '1d6h', '2h45m', '10m30s'];
        
        for (const duration of testCases) {
            const ms = durationToMilliseconds(duration);
            const roundTrip = millisecondsToDuration(ms);
            // Note: The round trip might not result in the exact same string due to normalization
            // e.g., '1h60m' might become '2h', but the duration value should be the same
            expect(durationToMilliseconds(roundTrip)).toBe(ms);
        }
    });
});

describe('turnPatternSchema', () => {
    test('should validate valid turn patterns', () => {
        expect(() => turnPatternSchema.parse('writing,drawing')).not.toThrow();
        expect(() => turnPatternSchema.parse('drawing,writing')).not.toThrow();
    });

    test('should reject invalid turn patterns', () => {
        expect(() => turnPatternSchema.parse('writing')).toThrow();
        expect(() => turnPatternSchema.parse('drawing')).toThrow();
        expect(() => turnPatternSchema.parse('writing,painting')).toThrow();
        expect(() => turnPatternSchema.parse('drawing,sketching')).toThrow();
        expect(() => turnPatternSchema.parse('')).toThrow();
    });
});

describe('returnsSchema', () => {
    test('should validate valid returns policies', () => {
        expect(() => returnsSchema.parse('2/3')).not.toThrow();
        expect(() => returnsSchema.parse('1/5')).not.toThrow();
        expect(() => returnsSchema.parse('none')).not.toThrow();
        expect(() => returnsSchema.parse('None')).not.toThrow();
        expect(() => returnsSchema.parse('NONE')).not.toThrow();
    });

    test('should reject invalid returns policies', () => {
        expect(() => returnsSchema.parse('')).toThrow();
        expect(() => returnsSchema.parse('2')).toThrow();
        expect(() => returnsSchema.parse('2/')).toThrow();
        expect(() => returnsSchema.parse('/3')).toThrow();
        expect(() => returnsSchema.parse('0/3')).toThrow(); // Zero is not allowed
        expect(() => returnsSchema.parse('2/0')).toThrow(); // Zero is not allowed
        expect(() => returnsSchema.parse('not-none')).toThrow();
    });
}); 