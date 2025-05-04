import { describe, expect, test } from 'vitest';
import {
    validateDuration,
    validateReturns,
    validateTurnPattern,
    formatReturnsForDisplay,
    parseDurationToMs,
    formatDurationForDisplay
} from '../../src/utils/game-settings-validator.js';

describe('validateDuration', () => {
    test('should validate valid duration strings', () => {
        expect(validateDuration('1d')).toBe(true);
        expect(validateDuration('12h')).toBe(true);
        expect(validateDuration('30m')).toBe(true);
        expect(validateDuration('45s')).toBe(true);
        expect(validateDuration('2d5h')).toBe(true);
        expect(validateDuration('1h30m')).toBe(true);
    });

    test('should reject invalid duration strings', () => {
        // The empty string will throw an error in the DurationUtils class,
        // but our safeParseDuration function should handle this and return false
        expect(validateDuration('')).toBe(false);
        expect(validateDuration('invalid')).toBe(false);
        expect(validateDuration('1d 2h')).toBe(false); // Spaces not allowed
        expect(validateDuration('1m30h')).toBe(false); // Wrong order
    });
});

describe('validateReturns', () => {
    test('should validate valid returns policies', () => {
        expect(validateReturns('2/3')).toBe(true);
        expect(validateReturns('1/5')).toBe(true);
        expect(validateReturns('none')).toBe(true);
        expect(validateReturns('None')).toBe(true);
    });

    test('should reject invalid returns policies', () => {
        expect(validateReturns('')).toBe(false);
        expect(validateReturns('2')).toBe(false);
        expect(validateReturns('2/')).toBe(false);
        expect(validateReturns('/3')).toBe(false);
        expect(validateReturns('0/3')).toBe(false); // Zero not allowed
        expect(validateReturns('abc')).toBe(false);
    });
});

describe('validateTurnPattern', () => {
    test('should validate valid turn patterns', () => {
        expect(validateTurnPattern('writing,drawing')).toBe(true);
        expect(validateTurnPattern('drawing,writing')).toBe(true);
    });

    test('should reject invalid turn patterns', () => {
        expect(validateTurnPattern('')).toBe(false);
        expect(validateTurnPattern('writing')).toBe(false);
        expect(validateTurnPattern('drawing')).toBe(false);
        expect(validateTurnPattern('writing,reading')).toBe(false);
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

describe('parseDurationToMs', () => {
    test('should parse duration strings to milliseconds', () => {
        expect(parseDurationToMs('1d')).toBe(86400000); // 1 day
        expect(parseDurationToMs('2h')).toBe(7200000); // 2 hours
        expect(parseDurationToMs('30m')).toBe(1800000); // 30 minutes
        expect(parseDurationToMs('45s')).toBe(45000); // 45 seconds
    });

    test('should parse combined duration strings', () => {
        expect(parseDurationToMs('1d12h')).toBe(86400000 + 43200000); // 1 day 12 hours
        expect(parseDurationToMs('2h30m')).toBe(7200000 + 1800000); // 2 hours 30 minutes
    });

    test('should throw for invalid duration strings', () => {
        expect(() => parseDurationToMs('')).toThrow();
        expect(() => parseDurationToMs('invalid')).toThrow();
    });
});

describe('formatDurationForDisplay', () => {
    test('should format duration strings for display', () => {
        expect(formatDurationForDisplay('1d')).toBe('1 day');
        expect(formatDurationForDisplay('2d')).toBe('2 days');
        expect(formatDurationForDisplay('1h')).toBe('1 hour');
        expect(formatDurationForDisplay('5h')).toBe('5 hours');
        expect(formatDurationForDisplay('1m')).toBe('1 minute');
        expect(formatDurationForDisplay('30m')).toBe('30 minutes');
        expect(formatDurationForDisplay('1s')).toBe('1 second');
        expect(formatDurationForDisplay('45s')).toBe('45 seconds');
    });

    test('should format combined duration strings', () => {
        expect(formatDurationForDisplay('1d12h')).toBe('1 day, 12 hours');
        expect(formatDurationForDisplay('2h30m')).toBe('2 hours, 30 minutes');
        expect(formatDurationForDisplay('1d2h3m4s')).toBe('1 day, 2 hours, 3 minutes, 4 seconds');
    });

    test('should return original string for invalid durations', () => {
        expect(formatDurationForDisplay('invalid')).toBe('invalid');
        expect(formatDurationForDisplay('')).toBe('');
    });
}); 