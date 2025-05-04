import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { 
    validateStringOption,
    validateIntegerOption,
    validateOptions,
    createStringValidator,
    createIntegerValidator,
    isSuccessResult,
    isErrorResult,
    ValidationResult
} from '../../src/utils/index.js';
import { ChatInputCommandInteraction } from 'discord.js';

// Create a mock ChatInputCommandInteraction
const createMockInteraction = (options: Record<string, any> = {}) => {
    return {
        options: {
            getString: (name: string) => options[name] || null,
            getInteger: (name: string) => options[name] || null,
        }
    } as unknown as ChatInputCommandInteraction;
};

describe('validateStringOption', () => {
    test('should validate and parse a valid string option', () => {
        // Create a mock schema
        const schema = z.string().min(3);
        
        // Create a mock interaction with a valid string
        const interaction = createMockInteraction({ test_option: 'valid' });
        
        // Validate the option
        const result = validateStringOption(interaction, 'test_option', schema);
        
        // Check the result
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.value).toBe('valid');
        }
    });
    
    test('should return null for optional options', () => {
        // Create a mock schema
        const schema = z.string().min(3);
        
        // Create a mock interaction without the option
        const interaction = createMockInteraction();
        
        // Validate the option
        const result = validateStringOption(interaction, 'test_option', schema);
        
        // Check the result
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.value).toBe(null);
        }
    });
    
    test('should return an error for invalid strings', () => {
        // Create a mock schema
        const schema = z.string().min(3);
        
        // Create a mock interaction with an invalid string
        const interaction = createMockInteraction({ test_option: 'ab' });
        
        // Validate the option
        const result = validateStringOption(interaction, 'test_option', schema);
        
        // Check the result
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBeTruthy();
        }
    });
    
    test('should use custom error message if provided', () => {
        // Create a mock schema
        const schema = z.string().min(3);
        
        // Create a mock interaction with an invalid string
        const interaction = createMockInteraction({ test_option: 'ab' });
        
        // Validate the option with a custom error message
        const result = validateStringOption(interaction, 'test_option', schema, {
            errorMessage: 'Custom error message'
        });
        
        // Check the result
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBe('Custom error message');
        }
    });
    
    test('should throw an error if throwOnError is true', () => {
        // Create a mock schema
        const schema = z.string().min(3);
        
        // Create a mock interaction with an invalid string
        const interaction = createMockInteraction({ test_option: 'ab' });
        
        // Expect the validation to throw an error
        expect(() => validateStringOption(interaction, 'test_option', schema, {
            throwOnError: true
        })).toThrow();
    });
});

describe('validateIntegerOption', () => {
    test('should validate and parse a valid integer option', () => {
        // Create a mock schema
        const schema = z.number().int().min(1);
        
        // Create a mock interaction with a valid integer
        const interaction = createMockInteraction({ test_option: 5 });
        
        // Validate the option
        const result = validateIntegerOption(interaction, 'test_option', schema);
        
        // Check the result
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.value).toBe(5);
        }
    });
    
    test('should return null for optional options', () => {
        // Create a mock schema
        const schema = z.number().int().min(1);
        
        // Create a mock interaction without the option
        const interaction = createMockInteraction();
        
        // Validate the option
        const result = validateIntegerOption(interaction, 'test_option', schema);
        
        // Check the result
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.value).toBe(null);
        }
    });
    
    test('should return an error for invalid integers', () => {
        // Create a mock schema
        const schema = z.number().int().min(5);
        
        // Create a mock interaction with an invalid integer
        const interaction = createMockInteraction({ test_option: 3 });
        
        // Validate the option
        const result = validateIntegerOption(interaction, 'test_option', schema);
        
        // Check the result
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBeTruthy();
        }
    });
});

describe('validateOptions', () => {
    test('should validate multiple options and return all values', () => {
        // Create a mock interaction with multiple options
        const interaction = createMockInteraction({
            name: 'John',
            age: 25
        });
        
        // Create validators for each option
        const validators = {
            name: (intr: ChatInputCommandInteraction) => validateStringOption(intr, 'name', z.string().min(3)),
            age: (intr: ChatInputCommandInteraction) => validateIntegerOption(intr, 'age', z.number().int().min(18))
        };
        
        // Validate all options
        const result = validateOptions(interaction, validators);
        
        // Check the result
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.values).toBeTruthy();
            expect(result.values).toEqual({
                name: 'John',
                age: 25
            });
        }
    });
    
    test('should collect all errors if validation fails', () => {
        // Create a mock interaction with invalid options
        const interaction = createMockInteraction({
            name: 'Jo', // Too short
            age: 16    // Too young
        });
        
        // Create validators for each option
        const validators = {
            name: (intr: ChatInputCommandInteraction) => validateStringOption(intr, 'name', z.string().min(3)),
            age: (intr: ChatInputCommandInteraction) => validateIntegerOption(intr, 'age', z.number().int().min(18))
        };
        
        // Validate all options
        const result = validateOptions(interaction, validators);
        
        // Check the result
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors).toBeTruthy();
            expect(result.errors.length).toBe(2);
        }
    });
});

describe('createStringValidator and createIntegerValidator', () => {
    test('should create a validator function for string options', () => {
        // Create a validator function
        const validateName = createStringValidator('name', z.string().min(3));
        
        // Create a mock interaction
        const interaction = createMockInteraction({ name: 'John' });
        
        // Use the validator function
        const result = validateName(interaction);
        
        // Check the result
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.value).toBe('John');
        }
    });
    
    test('should create a validator function for integer options', () => {
        // Create a validator function
        const validateAge = createIntegerValidator('age', z.number().int().min(18));
        
        // Create a mock interaction
        const interaction = createMockInteraction({ age: 25 });
        
        // Use the validator function
        const result = validateAge(interaction);
        
        // Check the result
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.value).toBe(25);
        }
    });
});

describe('isSuccessResult and isErrorResult', () => {
    test('should correctly identify success results', () => {
        const successResult = { success: true, values: { test: 'value' } };
        expect(isSuccessResult(successResult)).toBe(true);
        expect(isErrorResult(successResult)).toBe(false);
    });
    
    test('should correctly identify error results', () => {
        const errorResult = { success: false, errors: ['Test error'] };
        expect(isSuccessResult(errorResult)).toBe(false);
        expect(isErrorResult(errorResult)).toBe(true);
    });
}); 