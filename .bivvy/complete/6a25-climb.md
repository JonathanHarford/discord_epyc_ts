<Climb>
  <header>
    <id>6a25</id>
    <type>feature</type>
    <description>Flesh out the /start command with parameters</description>
    <newDependencies>None</newDependencies>
    <prerequisitChanges>None</prerequisitChanges>
    <relevantFiles>
      src/commands/chat/start-command.ts
      src/commands/metadata.ts
      src/database/game-service.ts
      prisma/schema.prisma
    </relevantFiles>
  </header>

## Feature Overview
This Climb aims to enhance the `/start` command by adding parameters that allow users to customize game settings when starting a new game, rather than always using the server's default settings. This will make the game creation process more flexible, allowing for varied gameplay experiences.

## Requirements
1. Update the `/start` command to accept optional parameters for customizing game settings
2. Parameters must include:
   - `turn_pattern`: Order of writing and drawing turns
   - `writing_timeout`: Time allowed for writing turns
   - `drawing_timeout`: Time allowed for drawing turns
   - `min_turns`: Minimum number of turns
   - `max_turns`: Maximum number of turns
   - `returns`: Player returns policy

3. All parameters must be optional, falling back to server defaults when not specified
4. Input validation similar to what's already in the config command
5. Update the createGame method in the game service to accept custom settings
6. Clear, user-friendly error messages for invalid inputs
7. Success message should include a summary of the custom settings

## Design and Implementation
1. Update the command metadata to include the same options available in the config command for games
2. Enhance the start-command.ts implementation to:
   - Parse and validate the input parameters
   - Create custom game settings when parameters are provided
   - Pass the custom settings to the game service
3. Update the game service to handle custom settings during game creation
4. Ensure proper error handling and validation of all parameters

## Development Details
1. Use the existing validation schemas from the config command
2. Update the game service to handle custom settings by either:
   - Creating a new GameSettings record for this specific game, or
   - Using the existing createGame method with custom settings
3. Ensure backward compatibility with existing functionality

## Testing Approach
Test the command with various combinations of:
- No parameters (using server defaults)
- All parameters specified
- Some parameters specified, others using defaults
- Invalid parameter values to ensure proper validation and error handling

## Future Considerations
- Consider adding additional parameters like warning times
- Consider adding a way to save and name custom game templates for reuse
- Add a way to view active game settings 