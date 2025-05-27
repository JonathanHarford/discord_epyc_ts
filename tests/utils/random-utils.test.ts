import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RandomUtils } from '../../src/utils/index.js';

// Mock any configs that might be loaded
vi.mock('../../config/config.json', () => ({}));
vi.mock('../../config/debug.json', () => ({}));
vi.mock('../../lang/logs.json', () => ({}));

describe('RandomUtils', () => {
    // Store the original Math.random function
    const originalRandom = Math.random;

    // After each test, restore the original Math.random
    afterEach(() => {
        Math.random = originalRandom;
    });

    describe('intFromInterval', () => {
        it('should return a number within the specified range', () => {
            // Test with a range of values
            for (let i = 0; i < 100; i++) {
                const min = 5;
                const max = 10;
                const result = RandomUtils.intFromInterval(min, max);

                expect(result).toBeGreaterThanOrEqual(min);
                expect(result).toBeLessThanOrEqual(max);
                expect(Number.isInteger(result)).toBe(true);
            }
        });

        it('should handle min equal to max', () => {
            const result = RandomUtils.intFromInterval(5, 5);
            expect(result).toBe(5);
        });
    });

    describe('shuffle', () => {
        it('should maintain the same elements after shuffling', () => {
            const original = [1, 2, 3, 4, 5];
            const shuffled = RandomUtils.shuffle([...original]);

            // Check that no elements were added or removed
            expect(shuffled.length).toBe(original.length);
            original.forEach(item => {
                expect(shuffled).toContain(item);
            });
        });

        it('should handle empty arrays', () => {
            const result = RandomUtils.shuffle([]);
            expect(result).toEqual([]);
        });

        it('should return the input array reference', () => {
            const input = [1, 2, 3];
            const result = RandomUtils.shuffle(input);
            expect(result).toBe(input); // Same reference
        });
    });
});
