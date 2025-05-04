<Climb>
  <header>
    <id>pfVQ</id>
    <type>feature</type>
    <description>Zod validation for commands and duration strings</description>
  </header>
  <newDependencies>None - zod is already installed</newDependencies>
  <prerequisitChanges>None - will build on top of existing duration utilities</prerequisitChanges>
  <relevantFiles>
    - src/utils/duration-utils.ts (existing duration utility)
    - src/utils/game-settings-validator.ts (existing validation functions)
    - src/commands/chat/config-command.ts (uses duration validation)
    - src/commands/metadata.ts (command definitions)
  </relevantFiles>

  <Feature Overview>
    Implement Zod validation for command arguments, specifically focusing on duration strings. This will provide more robust validation with better error messages and typesafe parsing of command inputs. The implementation will create reusable schemas that can be used consistently across the application.
  </Feature Overview>

  <Requirements>
    1. Create a Zod schema for validating duration strings
       - Must validate the format used in the application (e.g., "1d", "12h", "30m", "45s")
       - Must support combined formats (e.g., "2d5h", "1h30m")
       - Should ensure units are in the correct order (d > h > m > s)
       - Should provide clear error messages for invalid formats
    
    2. Integrate with the existing DurationUtils class
       - Ensure the validation is consistent with the existing parsing logic
       - Maintain backward compatibility with code using DurationUtils
       - Allow for conversion between the validated schema and milliseconds
    
    3. Create helper utilities for command argument validation
       - Make it easy to validate Discord command arguments
       - Support providing custom error messages
       - Support transforming validated values into application formats
  </Requirements>

  <Design and Implementation>
    1. Create a new zod-schemas.ts module to house Zod schemas
       - Define a durationStringSchema for validating duration strings
       - Use existing DurationUtils parsing/generation for consistency
    
    2. Create integration points between Zod schemas and command handling
       - Define helpers to validate command arguments
       - Support optional arguments with proper typing
    
    3. Update at least one command to use the new validation
       - Update the config-command.ts to use Zod validation
       - Preserve existing functionality while improving validation
  </Design and Implementation>

  <Development Details>
    - The durationStringSchema will:
      - Parse and validate duration strings
      - Return the validated string format
      - Provide transform methods to get the milliseconds value
    
    - Error handling will:
      - Provide user-friendly error messages
      - Support custom error messages per validation
      - Make debugging validation issues easier
  </Development Details>

  <Testing Approach>
    - Unit tests for the Zod schema implementations
      - Test valid inputs with various combinations of units
      - Test invalid inputs and verify proper error messages
      - Test transforms and validations
    
    - Unit tests for any helper functions created
      - Verify proper validation behavior
      - Test edge cases and error conditions
  </Testing Approach>
</Climb> 