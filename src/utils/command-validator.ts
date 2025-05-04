import { ChatInputCommandInteraction } from 'discord.js';
import { z } from 'zod';

/**
 * Type for validation result - either success with value or error message
 */
export type ValidationResult<T> = 
  | { success: true; value: T }
  | { success: false; error: string };

/**
 * Options for validating command options
 */
export interface ValidateOptions {
  /** Custom error message to display on validation failure */
  errorMessage?: string;
  /** Whether to throw an error on validation failure (default: false) */
  throwOnError?: boolean;
}

/**
 * Validates a string option from a command interaction using a Zod schema
 * 
 * @param intr - The command interaction
 * @param optionName - The name of the option to validate
 * @param schema - The Zod schema to validate against
 * @param options - Validation options
 * @returns A validation result with the parsed value or error
 */
export function validateStringOption<T>(
  intr: ChatInputCommandInteraction,
  optionName: string,
  schema: z.ZodType<T>,
  options: ValidateOptions = {}
): ValidationResult<T | null> {
  const value = intr.options.getString(optionName);
  
  // If the option wasn't provided, return null
  if (value === null) {
    return { success: true, value: null };
  }
  
  // Validate the value with the schema
  const result = schema.safeParse(value);
  
  if (result.success) {
    return { success: true, value: result.data };
  } else {
    // Format error message
    const errorMessage = options.errorMessage || 
      `Invalid value for ${optionName}: ${result.error.message || 'validation failed'}`;
    
    // Throw error if requested
    if (options.throwOnError) {
      throw new Error(errorMessage);
    }
    
    return { success: false, error: errorMessage };
  }
}

/**
 * Validates an integer option from a command interaction using a Zod schema
 * 
 * @param intr - The command interaction
 * @param optionName - The name of the option to validate
 * @param schema - The Zod schema to validate against
 * @param options - Validation options
 * @returns A validation result with the parsed value or error
 */
export function validateIntegerOption<T>(
  intr: ChatInputCommandInteraction,
  optionName: string,
  schema: z.ZodType<T>,
  options: ValidateOptions = {}
): ValidationResult<T | null> {
  const value = intr.options.getInteger(optionName);
  
  // If the option wasn't provided, return null
  if (value === null) {
    return { success: true, value: null };
  }
  
  // Validate the value with the schema
  const result = schema.safeParse(value);
  
  if (result.success) {
    return { success: true, value: result.data };
  } else {
    // Format error message
    const errorMessage = options.errorMessage || 
      `Invalid value for ${optionName}: ${result.error.message || 'validation failed'}`;
    
    // Throw error if requested
    if (options.throwOnError) {
      throw new Error(errorMessage);
    }
    
    return { success: false, error: errorMessage };
  }
}

/**
 * Validates all provided options with their respective schemas
 * Returns all validation errors in a single array, or all parsed values if validation succeeds
 * 
 * @param intr - The command interaction
 * @param validations - Record of option names to their validation functions
 * @returns Either all parsed values or all validation errors
 */
export function validateOptions<T extends Record<string, any>>(
  intr: ChatInputCommandInteraction,
  validations: Record<keyof T, (intr: ChatInputCommandInteraction) => ValidationResult<any>>
): { success: true; values: T } | { success: false; errors: string[] } {
  const errors: string[] = [];
  const values: Record<string, any> = {};
  
  // Run all validations
  for (const [key, validateFn] of Object.entries(validations)) {
    const result = validateFn(intr);
    
    if (result.success) {
      // Only include non-null values
      if (result.value !== null) {
        values[key] = result.value;
      }
    } else {
      // We know result has an error property if success is false
      errors.push((result as { success: false; error: string }).error);
    }
  }
  
  // Return all errors or all values
  if (errors.length > 0) {
    return { success: false, errors };
  } else {
    return { success: true, values: values as T };
  }
}

/**
 * Creates a validation function for a string option with a specific schema
 * 
 * @param optionName - The name of the option to validate
 * @param schema - The Zod schema to validate against
 * @param options - Validation options
 * @returns A validation function that can be used with validateOptions
 */
export function createStringValidator<T>(
  optionName: string,
  schema: z.ZodType<T>,
  options: ValidateOptions = {}
): (intr: ChatInputCommandInteraction) => ValidationResult<T | null> {
  return (intr) => validateStringOption(intr, optionName, schema, options);
}

/**
 * Creates a validation function for an integer option with a specific schema
 * 
 * @param optionName - The name of the option to validate
 * @param schema - The Zod schema to validate against
 * @param options - Validation options
 * @returns A validation function that can be used with validateOptions
 */
export function createIntegerValidator<T>(
  optionName: string,
  schema: z.ZodType<T>,
  options: ValidateOptions = {}
): (intr: ChatInputCommandInteraction) => ValidationResult<T | null> {
  return (intr) => validateIntegerOption(intr, optionName, schema, options);
}

/**
 * Type guard for success result
 */
export function isSuccessResult<T>(result: { success: boolean; } & any): result is { success: true; values: T } {
  return result.success === true;
}

/**
 * Type guard for error result
 */
export function isErrorResult(result: { success: boolean; } & any): result is { success: false; errors: string[] } {
  return result.success === false;
} 