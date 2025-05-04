# Commands That Could Benefit From Zod Validation

This document identifies Discord commands in the codebase that could benefit from using Zod validation for input parameters.

## Already Implemented

1. **ConfigCommand** (`src/commands/chat/config-command.ts`)
   - Validates duration strings, turn patterns, and returns policies using Zod schemas
   - Uses the command validation utilities for consistent error handling

2. **Game Settings Validation** (`src/utils/game-settings-validator.ts`)
   - Updated to use Zod schemas for validating durations, turn patterns, and returns policies
   - Provides consistent validation between command inputs and internal game settings

## Candidates for Zod Validation

1. **DevCommand** (`src/commands/chat/dev-command.ts`)
   - Currently validates commands using string comparison
   - Could benefit from Zod enum validation for the command parameter
   - Example implementation:
     ```typescript
     const devCommandSchema = z.enum([DevCommandName.INFO, /* other commands */]);
     const result = validateStringOption(intr, 'command', devCommandSchema);
     ```

2. **Any Future Commands with Complex Parameters**
   - New commands that accept duration strings should use `durationStringSchema`
   - Commands with numeric parameters that need min/max validation
   - Commands with string parameters that need pattern or enum validation

## Implementation Benefits

Using Zod validation in these commands would provide:

1. **Type Safety**: Runtime type checking that matches TypeScript types
2. **Better Error Messages**: Clear, consistent error messages for invalid inputs
3. **Input Transformation**: Automatic transformation of validated inputs to usable formats
4. **Centralized Validation Logic**: Reusable validation rules across the codebase

## Recommended Approach

For each command:

1. Identify input parameters that need validation
2. Create Zod schemas for each parameter
3. Use the `validateStringOption` or `validateIntegerOption` functions from `command-validator.ts`
4. Implement appropriate error handling based on validation results

Since the command validation utilities are already in place, adding Zod validation to other commands should be straightforward and require minimal changes to the existing command structure. 

## Recent Changes

- Removed the unused `simpleDurationSchema` in favor of the more robust `durationStringSchema`
- Updated `game-settings-validator.ts` to use Zod schemas for validation consistency
- Added comprehensive unit tests for the updated validation functions 