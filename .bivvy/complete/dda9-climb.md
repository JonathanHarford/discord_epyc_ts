<Climb>
  <header>
    <id>dda9</id>
    <type>feature</type>
    <description>Add command to configure server default season settings</description>
  <newDependencies>None</newDependencies>
  <prerequisitChanges>None</prerequisitChanges>
  <relevantFiles>
    - src/commands/metadata.ts
    - src/commands/chat/config-command.ts
    - src/database/server-service.ts
    - prisma/schema.prisma
  </relevantFiles>

## Feature Overview
Currently, the bot supports configuration for channels and default game settings but does not have a way to configure default season settings. This feature will add a `seasons` subcommand to the existing `/config` command that will allow server administrators to configure default season settings.

## Requirements
1. Add a `seasons` subcommand to the existing `/config` command
2. Allow configuration of the following season settings:
   - `openDuration`: The duration a season stays open for player registration (format: 1d, 12h, 30m)
   - `minPlayers`: Minimum number of players required for a season
   - `maxPlayers`: Maximum number of players allowed for a season (optional)
3. Validate inputs using the same pattern as existing game settings validation
4. Add a function to the `ServerService` to update default season settings
5. Support displaying current season settings when no parameters are provided

## Design and Implementation
1. Extend the `CONFIG` command metadata in `src/commands/metadata.ts` to include a new `seasons` subcommand with appropriate options
2. Add a method in `ServerService` to update default season settings similar to the existing `updateDefaultGameSettings` function
3. Implement a `handleSeasonsConfig` method in the `ConfigCommand` class similar to `handleGamesConfig`
4. Add validation for season settings inputs
5. Implement a method to display current season settings

## Development Details
1. The implementation will follow the same pattern as the existing game settings configuration:
   - Input validation using Zod schemas
   - Error handling and messaging
   - Confirmation messages with updated settings
2. The command should only be accessible to server administrators
3. Season settings should be stored in the `SeasonSettings` table and linked to the server via `ServerSettings`

## Testing Approach
1. Test the command with valid inputs to ensure settings are updated correctly
2. Test with invalid inputs to ensure validation works properly
3. Test querying current settings
4. Test edge cases like very large or small values

## Future Considerations
- Consider adding more season settings as needed in the future
- May want to add options to reset settings to defaults
</Climb> 