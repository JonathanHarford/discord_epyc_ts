<Climb>
  <header>
    <id>6pxS</id>
    <type>feature</type>
    <description>Add /config command to configure announcement, completed, and admin channels</description>
  </header>
  <newDependencies>No new dependencies required.</newDependencies>
  <prerequisitChanges>
    - Ensure the ServerSettings model in Prisma schema has the required channel fields:
      - announcementChannelId
      - completedChannelId
      - adminChannelId
    - Ensure database service methods for updating server settings exist
  </prerequisitChanges>
  <relevantFiles>
    - src/commands/chat/ (for new config command)
    - src/database/server-service.ts (for DB operations)
    - prisma/schema.prisma (for channel definitions)
  </relevantFiles>

## Feature Overview
Add a `/config` command that allows server administrators to configure which Discord channels should be used for:
1. Announcement messages (required) - Where new games and seasons are announced
2. Completed game messages (optional) - Where completed games are posted
3. Admin notifications (optional) - Where administrative notifications are sent

## Requirements
- Command should be restricted to server administrators only
- Command should allow setting each channel type individually
- Users should be able to select channels from a dropdown/menu
- Command should provide confirmation when channels are updated
- Command should validate that the bot has proper permissions in the selected channels

## Design and Implementation
1. Create a new slash command `/config channels` with channel selection options
2. Update server-service.ts to include methods for updating channel settings
3. Add proper permission checks to ensure only administrators can use the command
4. Add validation to ensure the bot has proper permissions in selected channels
5. Provide clear feedback on success/failure

## Development Details
### Command Structure
```
/config channels [announcement] [completed] [admin]
```
- All parameters are optional channel mentions
- If a parameter is not provided, that channel setting remains unchanged
- To remove a channel setting, we'll need to implement a way to "unset" the channel (possibly with a "none" option)

### Database Updates
Use the existing ServerSettings model, which already has:
- announcementChannelId: String (required)
- completedChannelId: String (optional)
- adminChannelId: String (optional)

### Permission Requirements
- User executing command must have ADMINISTRATOR permission
- Bot needs to have SEND_MESSAGES and VIEW_CHANNEL permissions in all selected channels

## Testing Approach
- Test command with administrator and non-administrator users
- Test setting each channel individually and all at once
- Test with valid and invalid channel selections
- Test permissions validation
- Test that configuration persists after bot restart

## Future Considerations
- Consider adding additional configuration options like:
  - Default game settings
  - Default season settings
  - Test mode toggle
</Climb> 