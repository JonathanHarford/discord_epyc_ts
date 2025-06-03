import { describe, expect, it } from 'vitest';

import {
  formatTurnPattern,
  isValidTurnPattern,
  TurnPatternValidationError,
  validateTurnPattern,
  validateTurnPatternSafe
} from '../../src/utils/turn-pattern-validation.js';

describe('Turn Pattern Validation', () => {
  describe('validateTurnPattern', () => {
    describe('valid patterns', () => {
      it('should validate single drawing turn', () => {
        const result = validateTurnPattern('drawing');
        expect(result).toEqual(['drawing']);
      });

      it('should validate single writing turn', () => {
        const result = validateTurnPattern('writing');
        expect(result).toEqual(['writing']);
      });

      it('should validate drawing,writing pattern', () => {
        const result = validateTurnPattern('drawing,writing');
        expect(result).toEqual(['drawing', 'writing']);
      });

      it('should validate writing,drawing pattern', () => {
        const result = validateTurnPattern('writing,drawing');
        expect(result).toEqual(['writing', 'drawing']);
      });

      it('should validate complex patterns', () => {
        const result = validateTurnPattern('writing,drawing,writing,drawing');
        expect(result).toEqual(['writing', 'drawing', 'writing', 'drawing']);
      });

      it('should handle whitespace around values', () => {
        const result = validateTurnPattern(' writing , drawing ');
        expect(result).toEqual(['writing', 'drawing']);
      });

      it('should handle mixed whitespace', () => {
        const result = validateTurnPattern('writing,  drawing  ,writing');
        expect(result).toEqual(['writing', 'drawing', 'writing']);
      });
    });

    describe('invalid patterns', () => {
      it('should reject non-string input', () => {
        expect(() => validateTurnPattern(123)).toThrow(TurnPatternValidationError);
        expect(() => validateTurnPattern(123)).toThrow('Turn pattern must be a string, received number');
      });

      it('should reject null input', () => {
        expect(() => validateTurnPattern(null)).toThrow(TurnPatternValidationError);
        expect(() => validateTurnPattern(null)).toThrow('Turn pattern must be a string, received object');
      });

      it('should reject undefined input', () => {
        expect(() => validateTurnPattern(undefined)).toThrow(TurnPatternValidationError);
        expect(() => validateTurnPattern(undefined)).toThrow('Turn pattern must be a string, received undefined');
      });

      it('should reject empty string', () => {
        expect(() => validateTurnPattern('')).toThrow(TurnPatternValidationError);
        expect(() => validateTurnPattern('')).toThrow('Turn pattern cannot be empty');
      });

      it('should reject whitespace-only string', () => {
        expect(() => validateTurnPattern('   ')).toThrow(TurnPatternValidationError);
        expect(() => validateTurnPattern('   ')).toThrow('Turn pattern cannot be empty');
      });

      it('should reject invalid turn types', () => {
        expect(() => validateTurnPattern('running')).toThrow(TurnPatternValidationError);
        expect(() => validateTurnPattern('running')).toThrow('Invalid turn type \'running\' at position 1. Must be \'drawing\' or \'writing\'');
      });

      it('should reject mixed valid and invalid types', () => {
        expect(() => validateTurnPattern('writing,jumping')).toThrow(TurnPatternValidationError);
        expect(() => validateTurnPattern('writing,jumping')).toThrow('Invalid turn type \'jumping\' at position 2. Must be \'drawing\' or \'writing\'');
      });

      it('should reject patterns with extra commas', () => {
        expect(() => validateTurnPattern('writing,,drawing')).toThrow(TurnPatternValidationError);
        expect(() => validateTurnPattern('writing,,drawing')).toThrow('Turn pattern contains empty values (check for extra commas or spaces)');
      });

      it('should reject patterns starting with comma', () => {
        expect(() => validateTurnPattern(',writing')).toThrow(TurnPatternValidationError);
        expect(() => validateTurnPattern(',writing')).toThrow('Turn pattern contains empty values (check for extra commas or spaces)');
      });

      it('should reject patterns ending with comma', () => {
        expect(() => validateTurnPattern('writing,')).toThrow(TurnPatternValidationError);
        expect(() => validateTurnPattern('writing,')).toThrow('Turn pattern contains empty values (check for extra commas or spaces)');
      });

      it('should reject comma-only string', () => {
        expect(() => validateTurnPattern(',')).toThrow(TurnPatternValidationError);
        expect(() => validateTurnPattern(',')).toThrow('Turn pattern contains empty values (check for extra commas or spaces)');
      });

      it('should reject multiple commas', () => {
        expect(() => validateTurnPattern(',,')).toThrow(TurnPatternValidationError);
        expect(() => validateTurnPattern(',,')).toThrow('Turn pattern contains empty values (check for extra commas or spaces)');
      });

      it('should reject case-sensitive invalid types', () => {
        expect(() => validateTurnPattern('Writing')).toThrow(TurnPatternValidationError);
        expect(() => validateTurnPattern('Writing')).toThrow('Invalid turn type \'Writing\' at position 1. Must be \'drawing\' or \'writing\'');
      });

      it('should reject mixed case', () => {
        expect(() => validateTurnPattern('DRAWING,writing')).toThrow(TurnPatternValidationError);
        expect(() => validateTurnPattern('DRAWING,writing')).toThrow('Invalid turn type \'DRAWING\' at position 1. Must be \'drawing\' or \'writing\'');
      });
    });
  });

  describe('validateTurnPatternSafe', () => {
    it('should return success result for valid pattern', () => {
      const result = validateTurnPatternSafe('writing,drawing');
      expect(result.isValid).toBe(true);
      expect(result.parsedPattern).toEqual(['writing', 'drawing']);
      expect(result.error).toBeUndefined();
    });

    it('should return error result for invalid pattern', () => {
      const result = validateTurnPatternSafe('invalid');
      expect(result.isValid).toBe(false);
      expect(result.parsedPattern).toBeUndefined();
      expect(result.error).toBe('Invalid turn type \'invalid\' at position 1. Must be \'drawing\' or \'writing\'');
    });

    it('should return error result for non-string input', () => {
      const result = validateTurnPatternSafe(123);
      expect(result.isValid).toBe(false);
      expect(result.parsedPattern).toBeUndefined();
      expect(result.error).toBe('Turn pattern must be a string, received number');
    });

    it('should return error result for empty string', () => {
      const result = validateTurnPatternSafe('');
      expect(result.isValid).toBe(false);
      expect(result.parsedPattern).toBeUndefined();
      expect(result.error).toBe('Turn pattern cannot be empty');
    });
  });

  describe('isValidTurnPattern', () => {
    it('should return true for valid patterns', () => {
      expect(isValidTurnPattern('writing')).toBe(true);
      expect(isValidTurnPattern('drawing')).toBe(true);
      expect(isValidTurnPattern('writing,drawing')).toBe(true);
      expect(isValidTurnPattern('drawing,writing,drawing')).toBe(true);
      expect(isValidTurnPattern(' writing , drawing ')).toBe(true);
    });

    it('should return false for invalid patterns', () => {
      expect(isValidTurnPattern('')).toBe(false);
      expect(isValidTurnPattern('invalid')).toBe(false);
      expect(isValidTurnPattern('writing,invalid')).toBe(false);
      expect(isValidTurnPattern('writing,,drawing')).toBe(false);
      expect(isValidTurnPattern(123)).toBe(false);
      expect(isValidTurnPattern(null)).toBe(false);
      expect(isValidTurnPattern(undefined)).toBe(false);
    });
  });

  describe('formatTurnPattern', () => {
    it('should format single turn type', () => {
      const result = formatTurnPattern(['writing']);
      expect(result).toBe('writing');
    });

    it('should format multiple turn types', () => {
      const result = formatTurnPattern(['writing', 'drawing']);
      expect(result).toBe('writing,drawing');
    });

    it('should format complex patterns', () => {
      const result = formatTurnPattern(['writing', 'drawing', 'writing', 'drawing']);
      expect(result).toBe('writing,drawing,writing,drawing');
    });

    it('should handle empty array', () => {
      const result = formatTurnPattern([]);
      expect(result).toBe('');
    });
  });

  describe('TurnPatternValidationError', () => {
    it('should be an instance of Error', () => {
      const error = new TurnPatternValidationError('test message');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('TurnPatternValidationError');
      expect(error.message).toBe('test message');
    });
  });

  describe('edge cases', () => {
    it('should handle very long valid patterns', () => {
      const longPattern = Array(100).fill('writing,drawing').join(',');
      const result = validateTurnPattern(longPattern);
      expect(result).toHaveLength(200);
      expect(result.every(type => type === 'writing' || type === 'drawing')).toBe(true);
    });

    it('should handle patterns with lots of whitespace', () => {
      const result = validateTurnPattern('  writing  ,  drawing  ,  writing  ');
      expect(result).toEqual(['writing', 'drawing', 'writing']);
    });

    it('should provide specific error messages for different positions', () => {
      expect(() => validateTurnPattern('writing,invalid,drawing')).toThrow('Invalid turn type \'invalid\' at position 2');
      expect(() => validateTurnPattern('writing,drawing,invalid')).toThrow('Invalid turn type \'invalid\' at position 3');
    });
  });
}); 