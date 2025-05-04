import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { 
    durationStringSchema, 
    turnPatternSchema, 
    returnsSchema,
    parseDuration,
    safeParseDuration,
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

describe('parseDuration function', () => {
    test('should parse valid duration strings', () => {
        const result = parseDuration('2h30m');
        expect(result.value).toBe('2h30m');
        expect(result.milliseconds).toBe(9000000); // 2.5 hours in ms
    });

    test('should throw on invalid duration strings', () => {
        expect(() => parseDuration('invalid')).toThrow();
        expect(() => parseDuration('')).toThrow();
    });
});

describe('safeParseDuration function', () => {
    test('should return success result for valid duration strings', () => {
        const result = safeParseDuration('3d');
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.value).toBe('3d');
            expect(result.data.milliseconds).toBe(259200000); // 3 days in ms
        }
    });

    test('should return error result for invalid duration strings', () => {
        // Mock the durationStringSchema's safeParse method for this test only
        const mockParse = vi.fn().mockImplementation(() => ({
            success: false,
            error: new Error('Mock error')
        }));
        
        // Save the original method to restore it later
        const originalSafeParse = durationStringSchema.safeParse;
        
        try {
            // Replace the method with our mock
            durationStringSchema.safeParse = mockParse;
            
            // Now call our function which should use the mock
            const result = safeParseDuration('invalid');
            
            // Verify the mock was called
            expect(mockParse).toHaveBeenCalledWith('invalid');
            
            // Verify the result
            expect(result.success).toBe(false);
        } finally {
            // Restore the original method
            durationStringSchema.safeParse = originalSafeParse;
        }
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