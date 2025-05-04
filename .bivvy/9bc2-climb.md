<Climb>
  <header>
    <id>9bc2</id>
    <type>feature</type>
    <description>Add /config games command to configure server default game settings</description>
  </header>
  <newDependencies>No new dependencies required.</newDependencies>
  <prerequisitChanges>
    - Ensure the GameSettings model in Prisma schema has the required fields:
      - turnPattern
      - returns
      - writingTimeout
      - writingWarning
      - drawingTimeout
      - drawingWarning
      - staleTimeout
      - minTurns
      - maxTurns
    - Ensure database service methods for updating server settings exist
  </prerequisitChanges>
  <relevantFiles>
    - src/commands/chat/config-command.ts (to update for game settings)
    - src/commands/metadata.ts (to add game settings subcommand)
    - src/database/server-service.ts (for DB operations)
    - prisma/schema.prisma (for GameSettings model)
  </relevantFiles>

## Feature Overview
Add a `/config games` command that allows server administrators to configure default game settings for future games created in the server. This will include settings like:
1. Turn pattern (writing/drawing order)
2. Timeout durations (for writing and drawing)
3. Warning times (for writing and drawing)
4. Stale game timeout
5. Minimum and maximum turn counts
6. Returns policy (players replay frequency)

## Requirements
- Command should be restricted to server administrators only
- Command should allow setting each game parameter individually
- All parameters should be optional (unspecified parameters remain unchanged)
- Command should provide validation for input values
- Command should provide confirmation when settings are updated
- Command should show current settings when no parameters are provided

## Design and Implementation
1. Add a new subcommand `/config games` to the existing ConfigCommand
2. Add options for each game setting parameter
3. Update server-service.ts to include methods for updating default game settings
4. Add validation for the input values
5. Provide clear feedback to users with the updated settings

## Development Details
### Command Structure
```
/config games [param1:value1] [param2:value2] ...
```
Parameters:
- `turn_pattern`: String pattern like "writing,drawing" or "drawing,writing"
- `writing_timeout`: Duration like "1d", "12h", "30m"
- `writing_warning`: Duration like "1h", "30m", "10m"
- `drawing_timeout`: Duration like "1d", "12h", "30m"
- `drawing_warning`: Duration like "1h", "30m", "10m"
- `stale_timeout`: Duration like "7d", "14d", "30d"
- `min_turns`: Integer ≥ 4
- `max_turns`: Integer > min_turns or "none"
- `returns`: Format like "2/3" (plays 2 times with 3 turns gap) or "none"

### Database Operations
Add method to `server-service.ts`:
- `updateDefaultGameSettings(serverId, gameSettings)`: Update default game settings for a server

### Helper Functions
- Duration parser/validator: Convert string durations like "1d" to milliseconds and validate format
- Returns format validator: Validate "N/M" format
- Turn pattern validator: Ensure valid pattern (should contain "writing" and "drawing")

## Testing Approach
- Test command with administrator and non-administrator users
- Test setting each parameter individually and multiple parameters at once
- Test with valid and invalid input values
- Test that configured settings persist after bot restart
- Test that new games use the configured default settings

## Future Considerations
- Consider adding a way to save and load presets for game settings
- Add support for custom turn patterns beyond just writing/drawing alternation
- Add visual feedback (like embeds) to make the settings display more user-friendly
- Consider versioning of game settings to track changes over time
</Climb> 