import { describe, it, expect, vi } from 'vitest';
import { DurationUtils } from '../../src/utils/index.js';

describe('DurationUtils', () => {
    describe('parseDurationString', () => {
        it('should parse single unit duration strings correctly', () => {
            expect(DurationUtils.parseDurationString('3d')).toBe(259200000); // 3 days
            expect(DurationUtils.parseDurationString('5h')).toBe(18000000);  // 5 hours
            expect(DurationUtils.parseDurationString('10m')).toBe(600000);   // 10 minutes
            expect(DurationUtils.parseDurationString('30s')).toBe(30000);    // 30 seconds
        });

        it('should parse multi-unit duration strings correctly', () => {
            expect(DurationUtils.parseDurationString('2d5m')).toBe(172800000 + 300000);  // 2 days 5 minutes
            expect(DurationUtils.parseDurationString('1h30m')).toBe(3600000 + 1800000);  // 1 hour 30 minutes
            expect(DurationUtils.parseDurationString('7d1s')).toBe(604800000 + 1000);    // 7 days 1 second
            expect(DurationUtils.parseDurationString('1d2h3m4s')).toBe(
                86400000 + 7200000 + 180000 + 4000
            ); // 1 day 2 hours 3 minutes 4 seconds
        });

        it('should throw an error for empty strings', () => {
            expect(() => DurationUtils.parseDurationString('')).toThrow('Duration string cannot be empty');
            expect(() => DurationUtils.parseDurationString('  ')).toThrow('Duration string cannot be empty');
        });

        it('should throw an error for invalid format', () => {
            expect(() => DurationUtils.parseDurationString('abc')).toThrow('Invalid duration format');
            expect(() => DurationUtils.parseDurationString('1x2y')).toThrow('Invalid duration format');
            expect(() => DurationUtils.parseDurationString('1d 2h')).toThrow('Invalid duration format'); // Space not allowed
        });

        it('should throw an error when units are in wrong order', () => {
            expect(() => DurationUtils.parseDurationString('1m7d')).toThrow('Units must be in order');
            expect(() => DurationUtils.parseDurationString('1s2h')).toThrow('Units must be in order');
            expect(() => DurationUtils.parseDurationString('1h1d')).toThrow('Units must be in order');
        });

        it('should throw an error for unsupported units', () => {
            expect(() => DurationUtils.parseDurationString('1w')).toThrow('Invalid duration format');
            expect(() => DurationUtils.parseDurationString('1y')).toThrow('Invalid duration format');
        });

        it('should handle large numbers correctly', () => {
            expect(DurationUtils.parseDurationString('999d')).toBe(999 * 86400000);
            expect(DurationUtils.parseDurationString('9999h')).toBe(9999 * 3600000);
        });
    });

    describe('generateDurationString', () => {
        it('should generate single unit duration strings correctly', () => {
            expect(DurationUtils.generateDurationString(259200000)).toBe('3d');     // 3 days
            expect(DurationUtils.generateDurationString(18000000)).toBe('5h');      // 5 hours
            expect(DurationUtils.generateDurationString(600000)).toBe('10m');       // 10 minutes
            expect(DurationUtils.generateDurationString(30000)).toBe('30s');        // 30 seconds
        });

        it('should generate multi-unit duration strings correctly', () => {
            expect(DurationUtils.generateDurationString(172800000 + 300000)).toBe('2d5m');     // 2 days 5 minutes
            expect(DurationUtils.generateDurationString(3600000 + 1800000)).toBe('1h30m');     // 1 hour 30 minutes
            expect(DurationUtils.generateDurationString(604800000 + 1000)).toBe('7d1s');       // 7 days 1 second
            expect(DurationUtils.generateDurationString(86400000 + 7200000 + 180000 + 4000)).toBe('1d2h3m4s'); // 1 day 2 hours 3 minutes 4 seconds
        });

        it('should not display zero units', () => {
            expect(DurationUtils.generateDurationString(3600000 + 10000)).toBe('1h10s');  // 1 hour 0 minutes 10 seconds
            expect(DurationUtils.generateDurationString(86400000 + 60000)).toBe('1d1m');  // 1 day 0 hours 1 minute
        });

        it('should convert to largest units when possible', () => {
            expect(DurationUtils.generateDurationString(86400000)).toBe('1d');        // 24 hours -> 1 day
            expect(DurationUtils.generateDurationString(3600000)).toBe('1h');         // 60 minutes -> 1 hour
            expect(DurationUtils.generateDurationString(60000)).toBe('1m');           // 60 seconds -> 1 minute
            expect(DurationUtils.generateDurationString(90000)).toBe('1m30s');        // 90 seconds -> 1 minute 30 seconds
        });

        it('should handle edge cases correctly', () => {
            expect(DurationUtils.generateDurationString(0)).toBe('0s');              // Zero duration
            expect(DurationUtils.generateDurationString(500)).toBe('1s');            // Less than a second rounded up
            expect(() => DurationUtils.generateDurationString(-1000)).toThrow('Duration cannot be negative');
        });

        it('should handle suboptimal inputs according to PRD examples', () => {
            // Test cases from PRD
            const hourInMs = 3600000;
            const minuteInMs = 60000;
            const secondInMs = 1000;
            
            expect(DurationUtils.generateDurationString(36 * minuteInMs)).toBe('36m');           // '0h36m' -> '36m'
            expect(DurationUtils.generateDurationString(2 * minuteInMs)).toBe('2m');             // '2m0s' -> '2m'
            expect(DurationUtils.generateDurationString(61 * minuteInMs)).toBe('1h1m');          // '61m' -> '1h1m'
            expect(DurationUtils.generateDurationString(24 * hourInMs)).toBe('1d');              // '24h' -> '1d'
        });
    });

    describe('bidirectional conversion', () => {
        it('should correctly convert back and forth between strings and milliseconds', () => {
            const testCases = [
                '3d',
                '5h',
                '10m',
                '30s',
                '2d5m',
                '1h30m',
                '7d1s',
                '1d2h3m4s'
            ];

            for (const testCase of testCases) {
                const ms = DurationUtils.parseDurationString(testCase);
                const regenerated = DurationUtils.generateDurationString(ms);
                
                // For some cases like '1h1s', if converted to ms and back, might become '1h'
                // if the seconds component was less than 500ms
                // So we convert both to ms for comparison
                const originalMs = DurationUtils.parseDurationString(testCase);
                const regeneratedMs = DurationUtils.parseDurationString(regenerated);
                
                // Allow a small rounding difference (less than 1 second)
                expect(Math.abs(originalMs - regeneratedMs)).toBeLessThan(1000);
            }
        });
    });
}); 