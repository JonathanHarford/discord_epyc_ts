import { describe, it, expect } from 'vitest';
import { Duration } from 'luxon';
import { parseDuration, durationStr } from '../../src/utils/datetime.js'; // Assuming .js extension based on rules

describe('datetime utils', () => {
  describe('parseDuration', () => {
    // Test cases for valid duration strings
    it('should parse days', () => {
      const duration = parseDuration('7d');
      expect(duration).not.toBeNull();
      expect(duration?.as('days')).toBe(7);
    });

    it('should parse hours', () => {
      const duration = parseDuration('12h');
      expect(duration).not.toBeNull();
      expect(duration?.as('hours')).toBe(12);
    });

    it('should parse minutes', () => {
      const duration = parseDuration('30m');
      expect(duration).not.toBeNull();
      expect(duration?.as('minutes')).toBe(30);
    });

    it('should parse seconds', () => {
      const duration = parseDuration('45s');
      expect(duration).not.toBeNull();
      expect(duration?.as('seconds')).toBe(45);
    });

    it('should parse combined units: 3d6h', () => {
      const duration = parseDuration('3d6h');
      expect(duration).not.toBeNull();
      expect(duration?.as('hours')).toBe(78); // 72 hours + 6 hours
    });

    it('should parse combined units: 1h30m10s', () => {
      const duration = parseDuration('1h30m10s');
      expect(duration).not.toBeNull();
      expect(duration?.as('seconds')).toBe(3600 + 30 * 60 + 10); // 5410 seconds
    });
    
    it('should return null when units are out of order: 6h3d10s30m', () => {
      const duration = parseDuration('6h3d10s30m');
      expect(duration).toBeNull();
    });

    it('should return null when multiple instances of the same unit are present: 1d2d3h1h', () => {
      const duration = parseDuration('1d2d3h1h');
      expect(duration).toBeNull();
    });

    it('should parse zero duration: 0s', () => {
      const duration = parseDuration('0s');
      expect(duration).not.toBeNull();
      expect(duration?.as('seconds')).toBe(0);
    });

    it('should parse zero duration: 0d0h0m0s', () => {
      const duration = parseDuration('0d0h0m0s');
      expect(duration).not.toBeNull();
      expect(duration?.as('seconds')).toBe(0);
    });

    // Test cases for invalid duration strings
    it('should return null for empty string', () => {
      expect(parseDuration('')).toBeNull();
    });

    it('should return null for invalid format: abc', () => {
      expect(parseDuration('abc')).toBeNull();
    });
    
    it('should return null for invalid format: 7x', () => {
      expect(parseDuration('7x')).toBeNull();
    });
    
    it('should return null for invalid format: d7', () => {
      expect(parseDuration('d7')).toBeNull();
    });

    it('should return null for negative values: -5d', () => {
      expect(parseDuration('-5d')).toBeNull(); // Function checks for value < 0
    });
    
    it('should return null for floating point values in string: 7.5d', () => {
        expect(parseDuration('7.5d')).toBeNull(); // parseInt will take 7, but ".5d" will remain
    });

    it('should return null for values without units: 7', () => {
      expect(parseDuration('7')).toBeNull();
    });

    it('should return null for units without values: d', () => {
      expect(parseDuration('d')).toBeNull();
    });
    
    it('should return null for mixed valid and invalid parts: 3dabc2h', () => {
        expect(parseDuration('3dabc2h')).toBeNull();
    });

    it('should return null for unknown units: 1y', () => {
      expect(parseDuration('1y')).toBeNull();
    });

    it('should return null for string with only spaces', () => {
      expect(parseDuration('   ')).toBeNull();
    });

    it('should trim whitespace: \' 7d \'', () => {
      const duration = parseDuration(' 7d ');
      expect(duration?.as('days')).toBe(7);
    });

    it('should trim internal spaces: \'3d 6h\'', () => {
      const duration = parseDuration('2h 30m');
      expect(duration?.as('hours')).toBe(2.5);
    });
  });

  describe('durationStr', () => {
    it('should format zero duration', () => {
      expect(durationStr(Duration.fromMillis(0))).toBe('0s');
    });

    it('should format days', () => {
      expect(durationStr(Duration.fromObject({ days: 7 }))).toBe('7d');
    });

    it('should format hours', () => {
      expect(durationStr(Duration.fromObject({ hours: 12 }))).toBe('12h');
    });

    it('should format minutes', () => {
      expect(durationStr(Duration.fromObject({ minutes: 30 }))).toBe('30m');
    });

    it('should format seconds', () => {
      expect(durationStr(Duration.fromObject({ seconds: 45 }))).toBe('45s');
    });

    it('should format combined units: 3d6h', () => {
      expect(durationStr(Duration.fromObject({ days: 3, hours: 6 }))).toBe('3d6h');
    });
    
    it('should format combined units: 1d2h3m4s', () => {
      expect(durationStr(Duration.fromObject({ days: 1, hours: 2, minutes: 3, seconds: 4 }))).toBe('1d2h3m4s');
    });

    it('should normalize units: 90 minutes to 1h30m', () => {
      expect(durationStr(Duration.fromObject({ minutes: 90 }))).toBe('1h30m');
    });

    it('should normalize units: 25 hours to 1d1h', () => {
      expect(durationStr(Duration.fromObject({ hours: 25 }))).toBe('1d1h');
    });
    
    it('should normalize units: 70 seconds to 1m10s', () => {
      expect(durationStr(Duration.fromObject({ seconds: 70 }))).toBe('1m10s');
    });

    it('should omit zero components: 1d0h5m -> 1d5m', () => {
      expect(durationStr(Duration.fromObject({ days: 1, hours: 0, minutes: 5 }))).toBe('1d5m');
    });

    it('should handle duration less than 1 second as 0s', () => {
      expect(durationStr(Duration.fromMillis(500))).toBe('0s'); // current behavior
    });
    
    it('should handle duration of exactly 0 as 0s', () => {
        const zeroDuration = Duration.fromObject({});
        expect(durationStr(zeroDuration)).toBe('0s');
    });

  });
}); 