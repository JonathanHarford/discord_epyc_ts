import { describe, expect, it } from 'vitest';

import { StringUtils } from '../../src/utils/index.js';

describe('StringUtils', () => {
    describe('truncate', () => {
        it('should return the input string when shorter than the specified length', () => {
            const input = 'Hello, world!';
            const result = StringUtils.truncate(input, 20);
            expect(result).toBe(input);
        });

        it('should truncate the string to the specified length', () => {
            const input = 'Hello, world!';
            const result = StringUtils.truncate(input, 5);
            expect(result).toBe('Hello');
        });

        it('should add ellipsis when specified', () => {
            const input = 'Hello, world!';
            const result = StringUtils.truncate(input, 8, true);
            expect(result).toBe('Hello...');
        });

        it('should handle edge case of empty string', () => {
            const input = '';
            const result = StringUtils.truncate(input, 5);
            expect(result).toBe('');
        });
    });
});
